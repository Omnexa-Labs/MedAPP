// Saved posts — `GET /v1/social/me/bookmarks`.
//
// The screen exists because bookmarking previously wrote into a black hole:
// there was no read surface for the list anywhere in the app. So the states
// this pins are the ones that make it a real screen rather than a list stub —
// loading, error, EMPTY, and paging that stops.
//
// SEAM: `@/lib/api/client`.

import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";

const mockGet = jest.fn();
const mockDelete = jest.fn();
jest.mock("@/lib/api/client", () => ({
  client: {
    get: (...a: unknown[]) => mockGet(...a),
    post: jest.fn(),
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
}));

jest.mock("@/lib/share", () => ({ shareText: jest.fn(() => Promise.resolve("shared")) }));

jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ id: "u-me", displayName: "Ama Mensah" }),
  useIsAuthenticated: () => true,
}));

import { SavedPostsScreen } from "../SavedPostsScreen";

const wire = (over: Record<string, unknown> = {}) => ({
  post_id: "p-1",
  kind: "blog",
  author_user_id: "u-1",
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
  // Everything on this list is saved, by construction.
  bookmarked_by_me: true,
  ...over,
});

function render(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockGet.mockReset();
  mockDelete.mockReset().mockResolvedValue(undefined);
});

describe("SavedPostsScreen", () => {
  it("reads /me/bookmarks and renders the FEED's card, not a second one", async () => {
    mockGet.mockResolvedValue({ items: [wire()], next_offset: null });
    render(<SavedPostsScreen />);

    await waitFor(() => expect(screen.getByText("Managing blood pressure")).toBeTruthy());
    expect(mockGet).toHaveBeenCalledWith("/v1/social/me/bookmarks?limit=20&offset=0");
    // The same controls as the feed row, because it is the same component.
    expect(screen.getByLabelText("Remove bookmark")).toBeTruthy();
    expect(screen.getByLabelText("More options")).toBeTruthy();
  });

  it("says what fills the list when it is empty, naming the actual control", async () => {
    mockGet.mockResolvedValue({ items: [], next_offset: null });
    render(<SavedPostsScreen />);
    await waitFor(() => expect(screen.getByText("Nothing saved yet")).toBeTruthy());
    expect(screen.getByText(/Tap the bookmark on a post in Community/)).toBeTruthy();
  });

  it("offers a retry when the list fails, rather than an empty state that lies", async () => {
    mockGet.mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));
    render(<SavedPostsScreen />);
    await waitFor(() => expect(screen.getByText(/Couldn't load your saved posts/)).toBeTruthy());
    // An error rendered as "Nothing saved yet" would tell the user they have
    // saved nothing, which is a different and wrong claim.
    expect(screen.queryByText("Nothing saved yet")).toBeNull();
    expect(screen.getByLabelText("Retry loading saved posts")).toBeTruthy();
  });

  it("removes a row the moment it is unsaved from here", async () => {
    mockGet.mockResolvedValue({ items: [wire()], next_offset: null });
    render(<SavedPostsScreen />);
    await waitFor(() => expect(screen.getByLabelText("Remove bookmark")).toBeTruthy());

    // The server drops it from this list, and so must the cache — otherwise the
    // user unsaves something and watches it stay.
    mockGet.mockResolvedValue({ items: [], next_offset: null });
    fireEvent.press(screen.getByLabelText("Remove bookmark"));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/v1/social/posts/p-1/bookmark"));
    await waitFor(() => expect(screen.queryByText("Managing blood pressure")).toBeNull());
  });

  it("pages, and stops cleanly when next_offset is null", async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === "/v1/social/me/bookmarks?limit=20&offset=0") {
        return { items: [wire({ post_id: "p-1", title: "First" })], next_offset: 20 };
      }
      if (path === "/v1/social/me/bookmarks?limit=20&offset=20") {
        return { items: [wire({ post_id: "p-2", title: "Second" })], next_offset: null };
      }
      throw new Error(`unexpected page request: ${path}`);
    });

    render(<SavedPostsScreen />);
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy());

    const list = screen.UNSAFE_getByType(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("react-native").FlatList,
    );
    fireEvent(list, "endReached");
    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());

    const before = mockGet.mock.calls.length;
    fireEvent(list, "endReached");
    fireEvent(list, "endReached");
    // `next_offset: null` is the terminator — the throw above proves no third
    // page was ever requested.
    await waitFor(() => expect(mockGet.mock.calls.length).toBe(before));
  });
});
