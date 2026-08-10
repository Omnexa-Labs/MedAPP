// Post detail — Figma 1066:2025.
//
// The byline cases carry the weight here. Three distinct states collapse into
// one nullable field, and getting them wrong either deanonymises someone or
// prints a UUID at a patient.
//
// The suite also pins what changed when `GET /posts/{id}` shipped: the screen
// no longer reads the post out of the FEED's cache, so the "open it from
// Community" cold-cache dead end is gone and a deep link works. The old test
// for that branch is deliberately replaced rather than deleted — there is still
// a not-available state, but it now means the post is missing or flagged, which
// is a fact about the server rather than about our cache.
//
// SEAM: `@/lib/api/client`, so the real mapper and the real per-viewer query
// keys are exercised.

import { screen, fireEvent, waitFor } from "@testing-library/react-native";
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

const mockParams: { id?: string } = { id: "p-1" };
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    back: (...a: unknown[]) => mockBack(...a),
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/share", () => ({ shareText: jest.fn(() => Promise.resolve("shared")) }));

let mockUser: { id: string; displayName: string } | null = null;
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => mockUser,
  useIsAuthenticated: () => true,
}));

import { PostDetailScreen } from "../PostDetailScreen";

const VIEWER = "u-me";

/** Serialised the way the SERVICE does: ownership derived, id withheld when anonymous. */
const postWire = (over: Record<string, unknown> = {}) => {
  const merged: Record<string, unknown> = { author_user_id: "u-1", ...over };
  const anonymous = Boolean(merged.is_anonymous);
  return {
  owned_by_me: merged.author_user_id === VIEWER,
  post_id: "p-1",
  kind: "blog",
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
  comment_count: 1,
  liked_by_me: false,
  bookmarked_by_me: false,
  ...merged,
  author_user_id: anonymous ? null : merged.author_user_id,
  };
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
  ...over,
});

/**
 * Route the two GETs this screen makes. `post: null` makes `/posts/{id}` throw,
 * which is the 404 a missing OR flagged post produces.
 */
function serverHas({
  post = postWire(),
  comments = [] as Record<string, unknown>[],
  commentsNextOffset = null as number | null,
}: {
  post?: Record<string, unknown> | null;
  comments?: Record<string, unknown>[];
  commentsNextOffset?: number | null;
} = {}) {
  mockGet.mockImplementation(async (path: string) => {
    if (path.includes("/comments")) {
      return { items: comments, next_offset: commentsNextOffset };
    }
    if (!post) throw Object.assign(new Error("post not found"), { status: 404 });
    return post;
  });
}

function render(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(undefined);
  mockBack.mockReset();
  mockParams.id = "p-1";
  mockUser = { id: "u-me", displayName: "Ama Mensah" };
  serverHas();
});

describe("loading the post", () => {
  it("reads GET /posts/{id} — not the feed cache it used to depend on", async () => {
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("Managing blood pressure")).toBeTruthy());
    // The whole point: nothing primed a feed cache, and the screen still works.
    // That is a deep link, a process restart and a cache eviction all fixed.
    expect(mockGet).toHaveBeenCalledWith("/v1/social/posts/p-1");
    expect(screen.getByText("Take your reading at the same time each morning.")).toBeTruthy();
    expect(screen.queryByText("Read more")).toBeNull();
  });

  it("resolves whatever id the URL carried — this is what makes a shared link work", async () => {
    // A share now emits `medapp://post-detail?id=<post id>` (@/lib/share-links).
    // That link is only honest if the id in the URL is the ONLY input: no feed
    // cache, no prior screen, nothing the recipient's app could be missing.
    // Varying the param proves the screen reads it rather than a constant.
    mockParams.id = "p-from-a-shared-link";
    serverHas({ post: postWire({ post_id: "p-from-a-shared-link" }) });
    render(<PostDetailScreen />);

    await waitFor(() => expect(screen.getByText("Managing blood pressure")).toBeTruthy());
    expect(mockGet).toHaveBeenCalledWith("/v1/social/posts/p-from-a-shared-link");
  });

  it("says the post is unavailable on a 404 — missing, or flagged and no longer readable", async () => {
    serverHas({ post: null });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText(/isn't available/)).toBeTruthy());
    // The old copy said "Open it from Community", which described OUR cache
    // rather than the server. There is nothing the user can do in Community
    // that would make a flagged post open.
    expect(screen.queryByText(/open it from community/i)).toBeNull();
    expect(screen.getByLabelText("Retry loading the post")).toBeTruthy();
  });
});

describe("bylines", () => {
  it("says Anonymous for an anonymous post, and never the UUID", async () => {
    serverHas({ post: postWire({ is_anonymous: true, author_name: null }) });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("Anonymous")).toBeTruthy());
    expect(screen.queryByText("u-1")).toBeNull();
  });

  it("says MedApp member when the lookup failed — NOT Anonymous", async () => {
    // A failed lookup is not anonymity. Calling it Anonymous would tell the
    // reader the author chose to hide, which is a different claim.
    serverHas({ post: postWire({ is_anonymous: false, author_name: null }) });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("MedApp member")).toBeTruthy());
    expect(screen.queryByText("Anonymous")).toBeNull();
  });
});

describe("the engagement row, which used to be decoration", () => {
  it("likes for real, optimistically, and rolls back on failure", async () => {
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("Like")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Like"));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/react", {
        reaction_type: "like",
      }),
    );
    await waitFor(() => expect(screen.getByLabelText("Unlike")).toBeTruthy());
    expect(screen.getByText("4")).toBeTruthy();

    // UNLIKE is a DELETE, not a POST. Rejecting `mockPost` here left the
    // request succeeding, so this case asserted a rollback that never ran —
    // the exact shape of bug this suite exists to catch, one level up.
    mockDelete.mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));
    fireEvent.press(screen.getByLabelText("Unlike"));
    await waitFor(() => expect(screen.getByText(/Couldn't update your reaction/)).toBeTruthy());

    // The rollback itself: the heart and the count both go back to where the
    // server still says they are.
    await waitFor(() => expect(screen.getByLabelText("Unlike")).toBeTruthy());
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("bookmarks from the detail screen too — it had no bookmark control at all", async () => {
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("Bookmark")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Bookmark"));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/bookmark"));
    await waitFor(() => expect(screen.getByLabelText("Remove bookmark")).toBeTruthy());
  });

  it("has the overflow menu the feed card has, with Delete gated on ownership", async () => {
    serverHas({ post: postWire({ author_user_id: "u-me" }) });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("More options")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("More options"));
    expect(screen.getByLabelText("Delete post")).toBeTruthy();
    expect(screen.getByLabelText("Report post")).toBeTruthy();
  });

  it("leaves the screen after deleting, rather than repainting as a dead link", async () => {
    serverHas({ post: postWire({ author_user_id: "u-me" }) });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("More options")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("More options"));
    fireEvent.press(screen.getByLabelText("Delete post"));
    fireEvent.press(screen.getByLabelText("Delete post"));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/v1/social/posts/p-1"));
    // "This post isn't available" is right for arriving at a dead link and
    // wrong for an action the reader just took.
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});

describe("comments", () => {
  it("renders them from the service", async () => {
    serverHas({ comments: [commentWire()] });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("This helped, thank you.")).toBeTruthy());
    expect(screen.getByText("Ama Mensah")).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith("/v1/social/posts/p-1/comments?limit=20&offset=0");
  });

  it("posts a comment and refetches rather than appending optimistically", async () => {
    render(<PostDetailScreen />);
    // Wait for the COMPOSER, not for the request. `GET /posts/{id}` is issued on
    // mount, so waiting on the call resolves on the first poll — while the screen
    // is still the loading spinner and the composer does not exist yet.
    await waitFor(() => expect(screen.getByLabelText("Comment input")).toBeTruthy());
    mockPost.mockResolvedValue(commentWire());
    fireEvent.changeText(screen.getByLabelText("Comment input"), "Very helpful");
    fireEvent.press(screen.getByLabelText("Post comment"));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/comments", {
        body: "Very helpful",
      }),
    );
    // Refetched, because moderation may hold the comment back entirely.
    const commentReads = () =>
      mockGet.mock.calls.filter(([p]) => String(p).includes("/comments")).length;
    await waitFor(() => expect(commentReads()).toBeGreaterThan(1));
  });

  it("will not send an empty comment", async () => {
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText("Post comment")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Post comment"));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("offers DELETE on the reader's own comment", async () => {
    serverHas({ comments: [commentWire({ author_user_id: "u-me" })] });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("This helped, thank you.")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Comment options: delete"));
    expect(screen.queryByLabelText("Report comment")).toBeNull();
    fireEvent.press(screen.getByLabelText("Delete comment"));
    // Confirm step, like the post's.
    expect(mockDelete).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("Delete comment"));
    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith("/v1/social/posts/p-1/comments/c-1"),
    );
  });

  it("offers REPORT on somebody else's comment, and not delete", async () => {
    serverHas({ comments: [commentWire({ author_user_id: "u-other" })] });
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("This helped, thank you.")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Comment options: report"));
    expect(screen.queryByLabelText("Delete comment")).toBeNull();
    fireEvent.press(screen.getByLabelText("Report comment"));
    fireEvent.press(screen.getByLabelText("Spam or advertising"));
    await waitFor(() =>
      // Top-level route: /comments/{id}/report, NOT nested under the post.
      expect(mockPost).toHaveBeenCalledWith("/v1/social/comments/c-1/report", {
        reason: "Spam or advertising",
        note: null,
      }),
    );
  });

  it("pages, and stops when next_offset is null", async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === "/v1/social/posts/p-1/comments?limit=20&offset=0") {
        return { items: [commentWire({ comment_id: "c-1", body: "First" })], next_offset: 20 };
      }
      if (path === "/v1/social/posts/p-1/comments?limit=20&offset=20") {
        return { items: [commentWire({ comment_id: "c-2", body: "Second" })], next_offset: null };
      }
      return postWire();
    });

    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Load more comments"));
    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
    // Null `next_offset` is the stop signal; the control goes with it.
    await waitFor(() => expect(screen.queryByLabelText("Load more comments")).toBeNull());
  });
});
