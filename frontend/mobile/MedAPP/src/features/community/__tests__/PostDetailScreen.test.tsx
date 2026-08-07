// Post detail — Figma 1066:2025.
//
// The byline cases carry the weight here. Three distinct states collapse into
// one nullable field, and getting them wrong either deanonymises someone or
// prints a UUID at a patient.

import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";

const mockParams: { id?: string } = { id: "p-1" };
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));

const mockListComments = jest.fn();
const mockCommentOnPost = jest.fn();
jest.mock("../api", () => ({
  communityApi: {
    listComments: (...a: unknown[]) => mockListComments(...a),
    commentOnPost: (...a: unknown[]) => mockCommentOnPost(...a),
  },
}));

import { PostDetailScreen } from "../PostDetailScreen";

const post = (over: Record<string, unknown> = {}) => ({
  id: "p-1",
  kind: "blog",
  authorUserId: "u-1",
  authorRole: "doctor",
  authorName: "Dr. Kwabena Osei",
  title: "Managing blood pressure",
  body: "Take your reading at the same time each morning.",
  excerpt: null,
  tags: [],
  isAnonymous: false,
  moderationStatus: "approved",
  publishedAtIso: "2026-08-07T09:00:00Z",
  createdAtIso: "2026-08-07T09:00:00Z",
  likeCount: 3,
  commentCount: 1,
  isPublished: true,
  ...over,
});

const comment = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  postId: "p-1",
  authorUserId: "u-2",
  authorRole: "user",
  authorName: "Ama Mensah",
  body: "This helped, thank you.",
  moderationStatus: "approved",
  createdAtIso: "2026-08-07T10:00:00Z",
  ...over,
});

/** Renders with the feed already cached, which is how the screen is reached. */
function render(ui: ReactElement, feed: unknown[] | null = [post()]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (feed) qc.setQueryData(["social", "feed"], feed);
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("PostDetailScreen", () => {
  beforeEach(() => {
    mockListComments.mockReset().mockResolvedValue([]);
    mockCommentOnPost.mockReset().mockResolvedValue(comment());
    mockParams.id = "p-1";
  });

  it("renders the post in full, with no read-more to loop back on", async () => {
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("Managing blood pressure")).toBeTruthy());
    expect(screen.getByText("Take your reading at the same time each morning.")).toBeTruthy();
    expect(screen.queryByText("Read more")).toBeNull();
  });

  it("renders comments from the service", async () => {
    mockListComments.mockResolvedValue([comment()]);
    render(<PostDetailScreen />);
    await waitFor(() => expect(screen.getByText("This helped, thank you.")).toBeTruthy());
    expect(screen.getByText("Ama Mensah")).toBeTruthy();
  });

  it("says Anonymous for an anonymous post, and never the UUID", async () => {
    render(<PostDetailScreen />, [post({ isAnonymous: true, authorName: null })]);
    await waitFor(() => expect(screen.getByText("Anonymous")).toBeTruthy());
    expect(screen.queryByText("u-1")).toBeNull();
  });

  it("says MedApp member when the lookup failed — NOT Anonymous", async () => {
    // A failed lookup is not anonymity. Calling it Anonymous would tell the
    // reader the author chose to hide, which is a different claim.
    render(<PostDetailScreen />, [post({ isAnonymous: false, authorName: null })]);
    await waitFor(() => expect(screen.getByText("MedApp member")).toBeTruthy());
    expect(screen.queryByText("Anonymous")).toBeNull();
  });

  it("posts a comment and refetches rather than appending optimistically", async () => {
    render(<PostDetailScreen />);
    await waitFor(() => expect(mockListComments).toHaveBeenCalled());
    fireEvent.changeText(screen.getByLabelText("Comment input"), "Very helpful");
    fireEvent.press(screen.getByLabelText("Post comment"));
    await waitFor(() => expect(mockCommentOnPost).toHaveBeenCalledWith("p-1", "Very helpful"));
    // Refetched, because moderation may hold the comment back entirely.
    await waitFor(() => expect(mockListComments.mock.calls.length).toBeGreaterThan(1));
  });

  it("will not send an empty comment", async () => {
    render(<PostDetailScreen />);
    await waitFor(() => expect(mockListComments).toHaveBeenCalled());
    fireEvent.press(screen.getByLabelText("Post comment"));
    expect(mockCommentOnPost).not.toHaveBeenCalled();
  });

  it("admits it cannot load rather than spinning forever on a cold cache", async () => {
    // Deep link, process restart, cache eviction. There is no
    // GET /posts/{id}, so there is genuinely nothing to fetch.
    render(<PostDetailScreen />, null);
    await waitFor(() => expect(screen.getByText(/isn't loaded/)).toBeTruthy());

    // The comments request DOES still fire, and that is correct rather than a
    // leak: the id is present, only the cached post is missing, and hooks
    // cannot be made conditional on a value computed below them. The query is
    // gated on `postId`, not on the post — so if a single-post route is ever
    // added, the comments are already in flight by the time it resolves.
    expect(mockListComments).toHaveBeenCalledWith("p-1");
    // What must NOT happen is a spinner with no exit.
    expect(screen.queryByText("Comments")).toBeNull();
  });
});
