// Threaded replies — Figma 1094:2270 / 1094:2306 / 1096:2270 / 1096:2353 /
// 1097:2324, notes 1100:2367.
//
// Driven through PostDetailScreen rather than by mounting CommentThread on its
// own, because the two halves of this feature live on opposite sides of that
// screen: the Reply affordance is on a row deep in the list and the composer that
// answers it is docked at the bottom. A component test of either alone would
// assert that a prop was passed, not that a reply can be written.
//
// The load-bearing cases:
//   1. The expander fetches LAZILY. Eight comments must not mean eight extra
//      requests for arguments nobody asked to read.
//   2. Paging stops on `next_offset: null` and nothing else.
//   3. THE PARENT ID THAT COMES BACK IS NOT THE ONE THAT WAS SENT. Replying to a
//      reply is filed against that reply's own parent, so the thread the client
//      refreshes and opens has to be read off the RESPONSE.
//   4. A null `reply_to_name` renders NO "@" prefix and NO user id. Substituting
//      the id would deanonymise content whose author is not to be named.
//
// SEAM: `@/lib/api/client`, so the real mapper, the real paths and the real
// per-viewer keys are exercised.

import { screen, fireEvent, waitFor, cleanup } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();
jest.mock("@/lib/api/client", () => ({
  client: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: jest.fn(),
    patch: jest.fn(),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
  registerAuthTokenProvider: jest.fn(),
  registerDeviceIdProvider: jest.fn(),
}));

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => ({ id: "p-1" }),
}));

jest.mock("@/lib/share", () => ({ shareText: jest.fn(() => Promise.resolve("shared")) }));

const VIEWER = "u-me";
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ id: "u-me", displayName: "Ama Mensah" }),
  useIsAuthenticated: () => true,
}));

import { PostDetailScreen } from "../PostDetailScreen";

const POST_WIRE = {
  post_id: "p-1",
  kind: "blog",
  author_user_id: "u-1",
  owned_by_me: false,
  author_role: "doctor",
  author_name: "Dr. Kwabena Osei",
  title: "Managing blood pressure",
  body: "Take your reading at the same time each morning.",
  excerpt: null,
  tags: [],
  is_anonymous: false,
  moderation_status: "approved",
  published_at: "2026-08-07T09:00:00Z",
  created_at: "2026-08-07T09:00:00Z",
  updated_at: "2026-08-07T09:00:00Z",
  like_count: 3,
  // Counts replies, so it legitimately exceeds the top-level item count.
  comment_count: 4,
  liked_by_me: false,
  bookmarked_by_me: false,
};

const commentWire = (over: Record<string, unknown> = {}) => ({
  comment_id: "c-1",
  post_id: "p-1",
  author_user_id: "u-2",
  author_role: "user",
  author_name: "Ama Mensah",
  body: "This helped, thank you.",
  moderation_status: "approved",
  created_at: "2026-08-07T10:00:00Z",
  updated_at: "2026-08-07T10:00:00Z",
  parent_comment_id: null,
  reply_to_user_id: null,
  reply_to_name: null,
  reply_count: 0,
  ...over,
});

/** A reply: parented on a TOP-LEVEL id, always, and never carrying replies of its own. */
const replyWire = (over: Record<string, unknown> = {}) =>
  commentWire({
    comment_id: "r-1",
    author_user_id: "u-3",
    author_name: "Dr. Adjoa Boateng",
    body: "Morning readings before food are the ones we compare.",
    parent_comment_id: "c-1",
    reply_count: 0,
    ...over,
  });

type Reply = { items: Record<string, unknown>[]; next_offset: number | null };

/**
 * Route the three GETs this screen can make. `replies` is a map keyed on the
 * REQUEST PATH suffix so a test can give one thread a different answer per page,
 * and a thread with no entry throws — which is what proves a fetch that should
 * not have happened.
 */
function serverHas({
  comments = [] as Record<string, unknown>[],
  replies = {} as Record<string, Reply | "throw">,
}: {
  comments?: Record<string, unknown>[];
  replies?: Record<string, Reply | "throw">;
} = {}) {
  mockGet.mockImplementation(async (path: string) => {
    if (path.includes("/replies")) {
      const answer = replies[path];
      if (!answer || answer === "throw") {
        throw Object.assign(new Error("replies unavailable"), { status: 500 });
      }
      return answer;
    }
    if (path.includes("/comments")) return { items: comments, next_offset: null };
    return POST_WIRE;
  });
}

const repliesPath = (commentId: string, offset = 0) =>
  `/v1/social/comments/${commentId}/replies?limit=20&offset=${offset}`;

const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of queryClients) client.clear();
  queryClients.length = 0;
  jest.useRealTimers();
});

function render(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClients.push(qc);
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const replyReads = () => mockGet.mock.calls.filter(([p]) => String(p).includes("/replies")).length;

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(undefined);
});

describe("the expander", () => {
  it("is offered on reply_count alone and fetches NOTHING until it is opened", async () => {
    serverHas({
      comments: [commentWire({ reply_count: 2 })],
      replies: { [repliesPath("c-1")]: { items: [replyWire()], next_offset: null } },
    });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("This helped, thank you.")).toBeTruthy());

    // The point of paying for `reply_count` on the comment: a screen of eight
    // threads issues no extra requests at all.
    expect(replyReads()).toBe(0);
    expect(screen.getByLabelText("View 2 replies")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("View 2 replies"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(repliesPath("c-1")));
    await waitFor(() =>
      expect(
        screen.getByText("Morning readings before food are the ones we compare."),
      ).toBeTruthy(),
    );
    // And a way back out, drawn OUTSIDE the rail because it closes the thread
    // rather than paging it.
    expect(screen.getByLabelText("Hide replies")).toBeTruthy();
  });

  it("is absent on a comment with no replies, which still gets a Reply affordance", async () => {
    serverHas({ comments: [commentWire({ reply_count: 0 })] });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("This helped, thank you.")).toBeTruthy());

    expect(screen.queryByLabelText(/View \d+ repl/)).toBeNull();
    expect(screen.getByLabelText("Reply to Ama Mensah")).toBeTruthy();
  });

  it("says reply, singular, for one", async () => {
    serverHas({ comments: [commentWire({ reply_count: 1 })] });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("View 1 reply")).toBeTruthy());
  });

  it("pages, and stops when next_offset is null", async () => {
    serverHas({
      comments: [commentWire({ reply_count: 2 })],
      replies: {
        [repliesPath("c-1")]: {
          items: [replyWire({ comment_id: "r-1", body: "First reply" })],
          next_offset: 20,
        },
        [repliesPath("c-1", 20)]: {
          items: [replyWire({ comment_id: "r-2", body: "Second reply" })],
          next_offset: null,
        },
      },
    });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("View 2 replies")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("View 2 replies"));

    await waitFor(() => expect(screen.getByText("First reply")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Show more replies"));
    await waitFor(() => expect(screen.getByText("Second reply")).toBeTruthy());

    // A full page is NOT the stop signal — `next_offset: null` is, and the pager
    // goes with it. Inferring from page length loops forever when the total is an
    // exact multiple of the limit.
    await waitFor(() => expect(screen.queryByLabelText("Show more replies")).toBeNull());
  });
});

describe("writing a reply", () => {
  it("names the target in a bar and in the placeholder, and offers a way back to top-level", async () => {
    serverHas({ comments: [commentWire()] });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("Reply to Ama Mensah")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Reply to Ama Mensah"));
    // Two signals, because the tinted bubble scrolls away and this bar does not.
    expect(screen.getByText("Replying to")).toBeTruthy();
    expect(screen.getByLabelText("Post reply")).toBeTruthy();
    expect(screen.getByPlaceholderText("Reply to Ama Mensah…")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Cancel reply"));
    // Back to a top-level comment: the mode is gone from every surface that
    // announced it, not just from the bar.
    expect(screen.queryByText("Replying to")).toBeNull();
    expect(screen.getByPlaceholderText("Add a comment…")).toBeTruthy();
    expect(screen.getByLabelText("Post comment")).toBeTruthy();
  });

  it("sends parent_comment_id for a reply and OMITS it for a top-level comment", async () => {
    serverHas({ comments: [commentWire()] });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("Comment input")).toBeTruthy());

    mockPost.mockResolvedValue(commentWire({ comment_id: "c-new", parent_comment_id: null }));
    fireEvent.changeText(screen.getByLabelText("Comment input"), "Top level");
    fireEvent.press(screen.getByLabelText("Post comment"));
    await waitFor(() =>
      // No `parent_comment_id` key at all — the top-level request is byte-identical
      // to what it was before threading shipped.
      expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/comments", { body: "Top level" }),
    );

    fireEvent.press(screen.getByLabelText("Reply to Ama Mensah"));
    mockPost.mockResolvedValue(replyWire({ comment_id: "r-new", reply_to_name: "Ama Mensah" }));
    fireEvent.changeText(screen.getByLabelText("Comment input"), "A reply");
    fireEvent.press(screen.getByLabelText("Post reply"));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/comments", {
        body: "A reply",
        parent_comment_id: "c-1",
      }),
    );
  });

  it("shows a visible error and keeps the draft when the send fails", async () => {
    // Keep the three-second toast visible while assertions run, regardless of
    // how long rendering takes on a cold or busy machine.
    jest.useFakeTimers();
    serverHas({ comments: [commentWire()] });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("Reply to Ama Mensah")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Reply to Ama Mensah"));
    mockPost.mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));
    fireEvent.changeText(screen.getByLabelText("Comment input"), "A reply");
    fireEvent.press(screen.getByLabelText("Post reply"));

    await waitFor(() => expect(screen.getByText(/Couldn't post your comment/)).toBeTruthy());
    // Reply mode SURVIVES the failure. Dropping back to top-level would silently
    // re-aim a retry at the post instead of at the person being answered.
    expect(screen.getByText("Replying to")).toBeTruthy();
    expect(screen.getByLabelText("Comment input").props.value).toBe("A reply");
  });
});

describe("replying to a REPLY — the parent id that comes back is not the one sent", () => {
  it("sends the SIBLING's id, and files the row under the parent the SERVER named", async () => {
    // The thread: c-1 top-level, r-1 a reply under it.
    serverHas({
      comments: [commentWire({ reply_count: 1 })],
      replies: { [repliesPath("c-1")]: { items: [replyWire()], next_offset: null } },
    });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("View 1 reply")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("View 1 reply"));
    await waitFor(() => expect(screen.getByLabelText("Reply to Dr. Adjoa Boateng")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Reply to Dr. Adjoa Boateng"));

    // Collapsed deliberately, WITH the reply target still armed. This is what
    // makes the next assertion observable: if the screen re-opened the thread it
    // SENT (r-1) nothing would reopen, because r-1 is not a top-level row.
    fireEvent.press(screen.getByLabelText("Hide replies"));
    await waitFor(() => expect(screen.getByLabelText("View 1 reply")).toBeTruthy());

    // The server answers 201 with the TOP-LEVEL id, not the id it was given, and
    // with the SIBLING recorded as who was answered.
    const created = replyWire({
      comment_id: "r-2",
      author_user_id: VIEWER,
      author_name: "Ama Mensah",
      body: "Agreed — same arm, same chair.",
      parent_comment_id: "c-1",
      reply_to_user_id: "u-3",
      reply_to_name: "Dr. Adjoa Boateng",
    });
    mockPost.mockResolvedValue(created);
    serverHas({
      comments: [commentWire({ reply_count: 2 })],
      replies: {
        [repliesPath("c-1")]: { items: [replyWire(), created], next_offset: null },
      },
    });

    fireEvent.changeText(screen.getByLabelText("Comment input"), "Agreed — same arm, same chair.");
    fireEvent.press(screen.getByLabelText("Post reply"));

    // Sent: the sibling. The client says who is being answered; the server decides
    // where the row lives.
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/comments", {
        body: "Agreed — same arm, same chair.",
        parent_comment_id: "r-1",
      }),
    );

    // Reopened: c-1, which only `created.parent_comment_id` could have named.
    await waitFor(() => expect(screen.getByLabelText("Hide replies")).toBeTruthy());
    // Regex, not an exact string: the "@" is an inline RUN of this body, so the
    // bubble's text node is the prefix and the sentence together.
    await waitFor(() => expect(screen.getByText(/Agreed — same arm, same chair\./)).toBeTruthy());
    // And the sibling is named by an "@" prefix, which is the only thing the
    // flattened parent link cannot express.
    expect(screen.getByText(/@Dr\. Adjoa Boateng/)).toBeTruthy();
    // Never the id, on any surface.
    expect(screen.queryByText("u-3")).toBeNull();
  });
});

describe("an un-named parent", () => {
  it("renders no @ prefix and no user id when reply_to_name is null", async () => {
    serverHas({
      comments: [commentWire({ author_name: null, reply_count: 1 })],
      replies: {
        [repliesPath("c-1")]: {
          items: [
            replyWire({
              body: "Wrist monitors read high if the wrist sits below the heart.",
              // The reply answered the un-named parent. The service copies its
              // null verbatim rather than resolving a name — so there is no
              // prefix to draw, and the id must not stand in for one.
              reply_to_user_id: "u-2",
              reply_to_name: null,
            }),
          ],
          next_offset: null,
        },
      },
    });
    render(<PostDetailScreen />);

    // A ROLE, not a name, and in `on-surface-variant` where a real name gets
    // `on-surface` — a word difference AND a token difference, so the distinction
    // never rests on colour alone.
    await waitFor(() => expect(screen.getByText("Community member")).toBeTruthy());
    // NOT the post's "MedApp member": comments have no anonymous mode, so this is
    // a different claim from the one the post byline makes.
    expect(screen.queryByText("MedApp member")).toBeNull();

    fireEvent.press(screen.getByLabelText("View 1 reply"));
    await waitFor(() =>
      expect(
        screen.getByText("Wrist monitors read high if the wrist sits below the heart."),
      ).toBeTruthy(),
    );
    // No prefix at all. Not "@unknown", not "@member", and above all not the id —
    // a UUID in an "@" against content whose author cannot be named is a
    // deanonymisation rather than a fallback.
    expect(screen.queryByText(/@/)).toBeNull();
    expect(screen.queryByText("u-2")).toBeNull();
  });

  it("gives the composer a POINTER instead of an invented identity", async () => {
    serverHas({ comments: [commentWire({ author_name: null })] });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("Reply to Community member")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Reply to Community member"));
    // A word AND a token difference from the named case, per the design notes.
    expect(screen.getByText("Replying to this comment")).toBeTruthy();
    expect(screen.getByPlaceholderText("Write a reply…")).toBeTruthy();
  });
});

describe("acting on a reply", () => {
  const ownReplyThread = (replyOver: Record<string, unknown>) => ({
    comments: [commentWire({ author_user_id: VIEWER, reply_count: 1 })],
    replies: {
      [repliesPath("c-1")]: { items: [replyWire(replyOver)], next_offset: null },
    },
  });

  it("deletes the reader's OWN reply", async () => {
    serverHas(ownReplyThread({ author_user_id: VIEWER, author_name: "Ama Mensah" }));
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("View 1 reply")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("View 1 reply"));
    await waitFor(() =>
      expect(
        screen.getByText("Morning readings before food are the ones we compare."),
      ).toBeTruthy(),
    );

    // Two rows, both the reader's, so both offer delete — index 1 is the reply.
    fireEvent.press(screen.getAllByLabelText("Comment options: delete")[1]);
    expect(screen.queryByLabelText("Report comment")).toBeNull();
    fireEvent.press(screen.getByLabelText("Delete comment"));
    // Confirm step, like everywhere else destructive in this feature.
    expect(mockDelete).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("Delete comment"));

    // A reply is deleted through its POST, like any comment — the server verifies
    // the pairing, so there is no reply-specific route to get wrong.
    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith("/v1/social/posts/p-1/comments/r-1"),
    );
  });

  it("reports somebody ELSE's reply, and not delete", async () => {
    // Parent is the reader's, so "options: report" is unambiguous: it can only be
    // the reply's.
    serverHas(ownReplyThread({ author_user_id: "u-other" }));
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("View 1 reply")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("View 1 reply"));
    await waitFor(() => expect(screen.getByLabelText("Comment options: report")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Comment options: report"));
    expect(screen.queryByLabelText("Delete comment")).toBeNull();
    fireEvent.press(screen.getByLabelText("Report comment"));
    fireEvent.press(screen.getByLabelText("Spam or advertising"));

    await waitFor(() =>
      // A reply reports through the TOP-LEVEL comment route, not under the post.
      expect(mockPost).toHaveBeenCalledWith("/v1/social/comments/r-1/report", {
        reason: "Spam or advertising",
        note: null,
      }),
    );
  });

  it("surfaces a visible error when reporting a reply fails", async () => {
    serverHas(ownReplyThread({ author_user_id: "u-other" }));
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("View 1 reply")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("View 1 reply"));
    await waitFor(() => expect(screen.getByLabelText("Comment options: report")).toBeTruthy());

    mockPost.mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));
    fireEvent.press(screen.getByLabelText("Comment options: report"));
    fireEvent.press(screen.getByLabelText("Report comment"));
    fireEvent.press(screen.getByLabelText("Spam or advertising"));

    await waitFor(() => expect(screen.getByText(/Couldn't send the report/)).toBeTruthy());
  });
});

describe("the async branches of one thread", () => {
  it("keeps the parent readable when the replies fail, and retries", async () => {
    serverHas({
      comments: [commentWire({ reply_count: 1 })],
      replies: { [repliesPath("c-1")]: "throw" },
    });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("View 1 reply")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("View 1 reply"));

    await waitFor(() => expect(screen.getByText(/couldn't load these replies/i)).toBeTruthy());
    // One failed sub-request must not blank a thread somebody was already reading.
    expect(screen.getByText("This helped, thank you.")).toBeTruthy();
    // And it must not be a dead end — retry is not optional on an error state.
    expect(screen.getByText("Check your connection and try again.")).toBeTruthy();

    serverHas({
      comments: [commentWire({ reply_count: 1 })],
      replies: { [repliesPath("c-1")]: { items: [replyWire()], next_offset: null } },
    });
    fireEvent.press(screen.getByLabelText("Retry loading replies"));
    await waitFor(() =>
      expect(
        screen.getByText("Morning readings before food are the ones we compare."),
      ).toBeTruthy(),
    );
  });

  it("says the replies are GONE when the count outlived them", async () => {
    // Reachable for exactly one reason: reporting a reply removes it AND
    // decrements `reply_count`, with no threshold and no un-flag route, so the
    // expander can outlive the replies it counted.
    serverHas({
      comments: [commentWire({ reply_count: 3 })],
      replies: { [repliesPath("c-1")]: { items: [], next_offset: null } },
    });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("View 3 replies")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("View 3 replies"));

    await waitFor(() => expect(screen.getByText("These replies are gone")).toBeTruthy());
    // "No replies yet" would be a lie about what happened to them.
    expect(screen.queryByText(/no replies yet/i)).toBeNull();
    expect(screen.getByLabelText("Hide replies")).toBeTruthy();
  });
});

describe("the two counts that disagree, on purpose", () => {
  it("shows the POST's total in the header, not the number of visible threads", async () => {
    // 4 = one top-level comment plus its three replies. The feed card the reader
    // tapped showed 4, and showing 1 here would under-report the discussion.
    serverHas({ comments: [commentWire({ reply_count: 3 })] });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("This helped, thank you.")).toBeTruthy());

    expect(screen.getByText("Comments")).toBeTruthy();
    expect(screen.getByTestId("comments-count")).toHaveTextContent("4");
    // Exactly one thread is listed under that 4, and the header must not quietly
    // become 1 to make them agree.
    expect(screen.getByLabelText("View 3 replies")).toBeTruthy();
  });
});
