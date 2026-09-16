// The feed card's ACTIONS — the ones that shipped as `useState` toggles and
// dead controls.
//
// This suite exists because of one defect and its family: Like was
// `setLiked(v => !v)` and never called the network. A test that asserts "the
// heart fills on tap" passes against that bug. So every case here asserts the
// REQUEST, and the rollback cases assert the UI goes BACK — an optimistic
// update with no rollback is the same lie with extra steps.
//
// SEAM: `@/lib/api/client`, so the real `../api` runs and the real query keys,
// mapper and page envelope are exercised. Mocking `../api` would have made the
// rollback cases assert against a fixture instead of against the cache.
//
// ============================================================================
// WHY ABSENCE IS ASSERTED WITH `.not.toBeOnTheScreen()` AND NOT `.toBeNull()`
// ============================================================================
// `expect(queryBy…()).toBeNull()` hands jest a `ReactTestInstance` when the
// element IS still there, and jest's `pretty-format` has no plugin for one — so
// it walks the raw fiber it exposes (`_fiber.alternate`, `.return`, `.child`,
// `._debugOwner`, …). Measured on this screen: 4.7 SECONDS to build a failure
// message that `waitFor` then discards.
//
// That is not a slow assertion, it is a broken poll loop. `waitFor` allows 1000ms
// total, and the FIRST poll after a press is always stale — react-query v5
// notifies its observers through `notifyManager`, which schedules on a macrotask
// — so poll one fails, spends five seconds formatting, and the budget is gone
// before poll two ever runs. The cache was correct 130ms in.
//
// RNTL's own matcher prints the element compactly, so a failed poll costs
// milliseconds and the retry happens. Same expectation, honest cost.

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

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    push: (...a: unknown[]) => mockPush(...a),
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  },
}));

jest.mock("@/lib/share", () => ({ shareText: jest.fn(() => Promise.resolve("shared")) }));

// The hook, not the store: importing the store for real pulls in
// `@/lib/api/client` -> `@/lib/config`, whose readExtra() throws at require
// time under Jest. Every migrated screen suite mocks it at this level.
let mockUser: { id: string; displayName: string; avatarUrl?: string } | null = null;
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => mockUser,
  useIsAuthenticated: () => true,
}));

import { CommunityScreen } from "../CommunityScreen";

const VIEWER = "u-me";

/**
 * A feed row as the SERVICE would serialise it.
 *
 * Two things are modelled deliberately, because both are contract behaviour a
 * hand-written fixture would otherwise get wrong:
 *   - `owned_by_me` is DERIVED from the author, the way the server derives it;
 *   - `author_user_id` is WITHHELD on an anonymous row, so a test cannot
 *     accidentally rely on an id the real API will never send.
 */
const wire = (over: Record<string, unknown> = {}) => {
  const merged: Record<string, unknown> = { author_user_id: "u-other", ...over };
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
    comment_count: 2,
    liked_by_me: false,
    bookmarked_by_me: false,
    ...merged,
    author_user_id: anonymous ? null : merged.author_user_id,
  };
};

/**
 * The server's feed, as a mutable fixture.
 *
 * Mutable on purpose: reporting and deleting both INVALIDATE the feed, so the
 * refetch that follows has to be able to disagree with the first response. A
 * fixed array would have the "removed" post come straight back and the test
 * would be asserting against a server that cannot exist.
 */
let serverFeed: Record<string, unknown>[] = [];

function feedReturns(items: Record<string, unknown>[], nextOffset: number | null = null) {
  serverFeed = items;
  mockGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/v1/social/feed")) return { items: serverFeed, next_offset: nextOffset };
    return { items: [], next_offset: null };
  });
}

const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of queryClients) client.clear();
  queryClients.length = 0;
});

function render(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClients.push(qc);
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(undefined);
  mockPush.mockReset();
  mockUser = { id: "u-me", displayName: "Ama Mensah" };
});

describe("Like", () => {
  it("takes its initial state from the SERVER, not from local state", async () => {
    feedReturns([wire({ liked_by_me: true, like_count: 7 })]);
    render(<CommunityScreen />);
    // Already liked on arrival: the control offers to UNDO, which a `useState`
    // initialised to false could never do.
    await waitFor(() => expect(screen.getByLabelText("Unlike")).toBeTruthy());
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("POSTs a reaction and moves the count optimistically", async () => {
    feedReturns([wire()]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("Like")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Like"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/react", {
        reaction_type: "like",
      }),
    );
    await waitFor(() => expect(screen.getByLabelText("Unlike")).toBeTruthy());
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("DELETEs the reaction when unliking", async () => {
    feedReturns([wire({ liked_by_me: true, like_count: 5 })]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("Unlike")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Unlike"));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/v1/social/posts/p-1/react"));
    await waitFor(() => expect(screen.getByLabelText("Like")).toBeTruthy());
    expect(screen.getByText("4")).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("ROLLS BACK the heart and the count when the request fails, and says so", async () => {
    feedReturns([wire()]);
    mockPost.mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("Like")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Like"));

    // Back to exactly where the user was — a like that silently fails is the
    // whole defect this wiring exists to fix.
    await waitFor(() => expect(screen.getByLabelText("Like")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("3")).toBeTruthy());
    expect(screen.queryByLabelText("Unlike")).toBeNull();
    // And the failure is VISIBLE, not swallowed.
    await waitFor(() => expect(screen.getByText(/Couldn't update your reaction/)).toBeTruthy());
  });
});

describe("Bookmark", () => {
  it("round-trips: POST to save, DELETE to unsave, initial state from the server", async () => {
    feedReturns([wire({ bookmarked_by_me: false })]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("Bookmark")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Bookmark"));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/bookmark"));
    await waitFor(() => expect(screen.getByLabelText("Remove bookmark")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Remove bookmark"));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/v1/social/posts/p-1/bookmark"));
    await waitFor(() => expect(screen.getByLabelText("Bookmark")).toBeTruthy());
  });

  it("rolls back and reports the failure", async () => {
    feedReturns([wire()]);
    mockPost.mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("Bookmark")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Bookmark"));

    await waitFor(() => expect(screen.getByText(/Couldn't update your saved posts/)).toBeTruthy());
    expect(screen.getByLabelText("Bookmark")).toBeTruthy();
    expect(screen.queryByLabelText("Remove bookmark")).toBeNull();
  });
});

describe("The 3-dot overflow menu", () => {
  it("opens a real menu — it used to render with no onPress at all", async () => {
    feedReturns([wire()]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("More options")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("More options"));

    expect(screen.getByTestId("post-overflow-sheet")).toBeTruthy();
    expect(screen.getByLabelText("Save post")).toBeTruthy();
    // "Share post", distinct from the card's own "Share" — see the sheet.
    expect(screen.getByLabelText("Share post")).toBeTruthy();
    expect(screen.getByLabelText("Report post")).toBeTruthy();
  });

  it("shows Delete ONLY on the viewer's own post", async () => {
    feedReturns([wire({ author_user_id: "u-me" })]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("More options")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("More options"));
    expect(screen.getByLabelText("Delete post")).toBeTruthy();
  });

  it("omits Delete on somebody else's post — the server answers that with a 403", async () => {
    feedReturns([wire({ author_user_id: "u-other" })]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("More options")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("More options"));
    // OMITTED, not disabled: on someone else's post it is never going to be
    // allowed, so a dimmed row would promise a temporary state.
    expect(screen.queryByLabelText("Delete post")).toBeNull();
  });

  it("offers Delete on the viewer's own ANONYMOUS post, without printing the author id", async () => {
    // The invariant that actually matters. `author_user_id` is on the wire for
    // an anonymous post, so ownership is answerable — but the id must never be
    // rendered, or the post is deanonymised by its own delete affordance.
    feedReturns([wire({ author_user_id: "u-me", is_anonymous: true, author_name: null })]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByText("Anonymous")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("More options"));

    expect(screen.getByLabelText("Delete post")).toBeTruthy();
    expect(screen.queryByText("u-me")).toBeNull();
    expect(screen.queryByText(/u-me/)).toBeNull();
  });

  it("deletes an own post through DELETE /posts/{id} after a confirm step", async () => {
    feedReturns([wire({ author_user_id: "u-me" })]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("More options")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("More options"));

    fireEvent.press(screen.getByLabelText("Delete post"));
    // A destructive action does not fire off the first tap.
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this post?")).toBeTruthy();

    // The server stops returning it, as a hard delete means it must.
    mockDelete.mockImplementation(async () => {
      serverFeed = [];
    });
    fireEvent.press(screen.getByLabelText("Delete post"));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/v1/social/posts/p-1"));
    await waitFor(() =>
      expect(screen.queryByText("Managing blood pressure")).not.toBeOnTheScreen(),
    );
  });
});

describe("Reporting", () => {
  it("removes the post from the feed and TELLS the user that is why it went", async () => {
    feedReturns([wire()]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("More options")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("More options"));
    fireEvent.press(screen.getByLabelText("Report post"));

    // The consequence is stated BEFORE the reasons: one report flags the item
    // outright and there is no un-flag route in the API.
    expect(screen.getByText(/hides this post from the community feed/)).toBeTruthy();

    // A report flags the post, so the feed genuinely stops returning it.
    mockPost.mockImplementation(async () => {
      serverFeed = [];
    });
    fireEvent.press(screen.getByLabelText("Medical misinformation"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/report", {
        reason: "Medical misinformation",
        note: null,
      }),
    );
    // The explanation survives the report. It must: removing the row on success
    // would unmount the sheet mid-sentence.
    await waitFor(() => expect(screen.getByText(/it's been reported/)).toBeTruthy());
    expect(screen.getByText("Managing blood pressure")).toBeTruthy();

    // Dismissed — NOW the post goes.
    fireEvent.press(screen.getByLabelText("Done"));
    await waitFor(() =>
      expect(screen.queryByText("Managing blood pressure")).not.toBeOnTheScreen(),
    );
  });

  it("does not claim a report that failed", async () => {
    feedReturns([wire()]);
    mockPost.mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("More options")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("More options"));
    fireEvent.press(screen.getByLabelText("Report post"));
    fireEvent.press(screen.getByLabelText("Spam or advertising"));

    await waitFor(() => expect(screen.getByText(/Couldn't send the report/)).toBeTruthy());
    expect(screen.queryByText(/it's been reported/)).toBeNull();
    // Still there, because it still is on the server.
    expect(screen.getByText("Managing blood pressure")).toBeTruthy();
  });
});

describe("The feed card's content", () => {
  it("renders the TITLE the card used to throw away", async () => {
    feedReturns([wire()]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByText("Managing blood pressure")).toBeTruthy());
    expect(screen.getByText("Take your reading at the same time each morning.")).toBeTruthy();
  });

  it("prefers the author's excerpt over the body when there is one", async () => {
    feedReturns([wire({ excerpt: "One line on morning readings." })]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByText("One line on morning readings.")).toBeTruthy());
    // Both clamped paragraphs saying the same thing is what an excerpt exists
    // to avoid.
    expect(screen.queryByText("Take your reading at the same time each morning.")).toBeNull();
  });

  it("never prints the author id, anonymous or not", async () => {
    feedReturns([
      wire({ is_anonymous: true, author_name: null, author_user_id: "11111111-2222-3333" }),
    ]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByText("Anonymous")).toBeTruthy());
    expect(screen.queryByText(/11111111/)).toBeNull();
  });
});

describe("Pagination", () => {
  it("asks for the next page at the offset the SERVER gave, and stops on a null one", async () => {
    const pageOne = [wire({ post_id: "p-1", title: "First" })];
    const pageTwo = [wire({ post_id: "p-2", title: "Second" })];
    mockGet.mockImplementation(async (path: string) => {
      if (path === "/v1/social/feed?limit=20&offset=0") {
        return { items: pageOne, next_offset: 20 };
      }
      if (path === "/v1/social/feed?limit=20&offset=20") {
        // Last page. `next_offset: null` is the ONLY stop signal — a full page
        // is not one.
        return { items: pageTwo, next_offset: null };
      }
      throw new Error(`unexpected page request: ${path}`);
    });

    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy());

    const list = screen.UNSAFE_getByType(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("react-native").FlatList,
    );
    fireEvent(list, "endReached");
    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());

    const before = mockGet.mock.calls.length;
    // Scrolling past the end again must not re-request the last offset.
    fireEvent(list, "endReached");
    fireEvent(list, "endReached");
    await waitFor(() => expect(mockGet.mock.calls.length).toBe(before));
  });
});

describe("Saved posts entry point", () => {
  it("is reachable from the feed — a saved list nothing links to is the onboarding-status mistake", async () => {
    feedReturns([wire()]);
    render(<CommunityScreen />);
    await waitFor(() => expect(screen.getByLabelText("Saved posts")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Saved posts"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/saved-posts");
  });
});
