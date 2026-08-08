// communityApi — paths, paging and the snake_case -> camelCase mapping.
//
// A screen suite mocks this module, so nothing else in the tree asserts that
// `POST /posts/{id}/bookmark` is not `/posts/{id}/bookmarks`, or that
// `liked_by_me` reaches the domain type at all. That is the `/v1/appointments`
// class of defect: green screens over a path that does not exist.
//
// Two things here are specifically defended:
//   1. `next_offset: null` survives as `nextOffset: null`. It is the ONLY stop
//      signal for pagination, and a mapper that dropped it would leave a client
//      inferring "a full page means more" — which loops forever when the total
//      is an exact multiple of the limit.
//   2. The per-viewer flags default to FALSE, not true, when absent.
//
// SEAM: `@/lib/api/client`.

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

import { communityApi, isOwnComment, isOwnPost, socialKeys, type Comment, type Post } from "../api";

const POST_WIRE = {
  post_id: "p-1",
  kind: "blog",
  author_user_id: "u-1",
  author_role: "doctor",
  author_name: "Dr. Kwabena Osei",
  title: "Managing blood pressure",
  body: "Take your reading at the same time each morning.",
  excerpt: "A short summary.",
  tags: ["cardiology"],
  is_anonymous: false,
  moderation_status: "approved",
  published_at: "2026-08-07T09:00:00Z",
  created_at: "2026-08-07T09:00:00Z",
  updated_at: "2026-08-07T09:00:00Z",
  like_count: 3,
  comment_count: 2,
  liked_by_me: true,
  bookmarked_by_me: false,
};

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(undefined);
});

describe("feed", () => {
  it("sends limit and offset, and returns a page carrying next_offset", async () => {
    mockGet.mockResolvedValue({ items: [POST_WIRE], next_offset: 20 });
    const page = await communityApi.listFeed({ limit: 20, offset: 0 });

    expect(mockGet).toHaveBeenCalledWith("/v1/social/feed?limit=20&offset=0");
    expect(page.nextOffset).toBe(20);
    expect(page.items[0].id).toBe("p-1");
  });

  it("keeps a null next_offset as null — the last page must be distinguishable", async () => {
    mockGet.mockResolvedValue({ items: [POST_WIRE], next_offset: null });
    const page = await communityApi.listFeed();
    expect(page.nextOffset).toBeNull();
  });

  it("maps the per-viewer flags, and defaults them OFF when the server omits them", async () => {
    mockGet.mockResolvedValue({ items: [POST_WIRE], next_offset: null });
    const withFlags = (await communityApi.listFeed()).items[0];
    expect(withFlags.likedByMe).toBe(true);
    expect(withFlags.bookmarkedByMe).toBe(false);

    const { liked_by_me: _l, bookmarked_by_me: _b, ...bare } = POST_WIRE;
    mockGet.mockResolvedValue({ items: [bare], next_offset: null });
    const withoutFlags = (await communityApi.listFeed()).items[0];
    // ON by default would paint a filled heart on a post nobody liked, and the
    // first tap would then issue an UNLIKE.
    expect(withoutFlags.likedByMe).toBe(false);
    expect(withoutFlags.bookmarkedByMe).toBe(false);
  });
});

describe("the routes added in the completion pass", () => {
  it("reads one post from /posts/{id} with the feed's own mapper", async () => {
    mockGet.mockResolvedValue(POST_WIRE);
    const post = await communityApi.getPost("p-1");
    expect(mockGet).toHaveBeenCalledWith("/v1/social/posts/p-1");
    expect(post.title).toBe("Managing blood pressure");
    expect(post.excerpt).toBe("A short summary.");
    expect(post.isPublished).toBe(true);
  });

  it("likes with POST and unlikes with DELETE on the same path", async () => {
    await communityApi.reactToPost("p-1");
    expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/react", { reaction_type: "like" });
    await communityApi.unreactToPost("p-1");
    expect(mockDelete).toHaveBeenCalledWith("/v1/social/posts/p-1/react");
  });

  it("bookmarks with POST and unbookmarks with DELETE", async () => {
    await communityApi.bookmarkPost("p-1");
    expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/bookmark");
    await communityApi.unbookmarkPost("p-1");
    expect(mockDelete).toHaveBeenCalledWith("/v1/social/posts/p-1/bookmark");
  });

  it("reads bookmarks from /me/bookmarks with the SAME envelope as the feed", async () => {
    mockGet.mockResolvedValue({ items: [POST_WIRE], next_offset: null });
    const page = await communityApi.listBookmarks({ limit: 20, offset: 20 });
    expect(mockGet).toHaveBeenCalledWith("/v1/social/me/bookmarks?limit=20&offset=20");
    expect(page.items[0].id).toBe("p-1");
  });

  it("reports a post under the post, and a comment NOT under one", async () => {
    await communityApi.reportPost("p-1", "Spam or advertising");
    expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/report", {
      reason: "Spam or advertising",
      note: null,
    });
    // The comment report route is top-level: /comments/{id}/report.
    await communityApi.reportComment("c-1", "Harassment or abuse", "  context  ");
    expect(mockPost).toHaveBeenCalledWith("/v1/social/comments/c-1/report", {
      reason: "Harassment or abuse",
      note: "context",
    });
  });

  it("deletes a comment through its post, which the server verifies the pairing of", async () => {
    await communityApi.deletePost("p-1");
    expect(mockDelete).toHaveBeenCalledWith("/v1/social/posts/p-1");
    await communityApi.deleteComment("p-1", "c-1");
    expect(mockDelete).toHaveBeenCalledWith("/v1/social/posts/p-1/comments/c-1");
  });

  it("pages the comments list too", async () => {
    mockGet.mockResolvedValue({ items: [], next_offset: null });
    const page = await communityApi.listComments("p-1", { limit: 20, offset: 40 });
    expect(mockGet).toHaveBeenCalledWith("/v1/social/posts/p-1/comments?limit=20&offset=40");
    expect(page.nextOffset).toBeNull();
  });
});

describe("ownership", () => {
  const post = (over: Partial<Post> = {}) =>
    ({ ...({} as Post), authorUserId: "u-1", ownedByMe: false, ...over }) as Post;

  it("comes from the SERVER's answer, not from comparing ids", () => {
    // The id is no longer a reliable ownership signal: it is null on an
    // anonymous post. `ownedByMe` is computed server-side, where the author is
    // still known.
    expect(isOwnPost(post({ ownedByMe: true }), "u-1")).toBe(true);
    expect(isOwnPost(post({ ownedByMe: false }), "u-1")).toBe(false);
  });

  it("never offers Delete to a signed-out viewer, whatever the server said", () => {
    // Belt and braces: an unauthenticated read must not show Delete on every
    // row even if a stale or hostile payload claims ownership.
    expect(isOwnPost(post({ ownedByMe: true }), null)).toBe(false);
    expect(isOwnPost(post({ ownedByMe: true }), undefined)).toBe(false);
  });

  it("holds for an ANONYMOUS post, whose author id is withheld", () => {
    // The case the server-side flag exists for. `authorUserId` is null — an id
    // comparison would silently take Delete away from the only person entitled
    // to it.
    expect(
      isOwnPost(post({ isAnonymous: true, authorName: null, authorUserId: null, ownedByMe: true }), "u-1"),
    ).toBe(true);
  });

  it("applies the same rule to comments", () => {
    const comment = { authorUserId: "u-9" } as Comment;
    expect(isOwnComment(comment, "u-9")).toBe(true);
    expect(isOwnComment(comment, "u-1")).toBe(false);
  });
});

describe("cache keys", () => {
  it("bake the VIEWER into every per-viewer key", () => {
    // `liked_by_me` / `bookmarked_by_me` are computed from the caller, so a key
    // shared between two accounts serves one user's like state to the other.
    expect(socialKeys.feed("u-1")).not.toEqual(socialKeys.feed("u-2"));
    expect(socialKeys.bookmarks("u-1")).not.toEqual(socialKeys.bookmarks("u-2"));
    expect(socialKeys.post("u-1", "p-1")).not.toEqual(socialKeys.post("u-2", "p-1"));
  });

  it("leaves comments viewer-free — CommentOut has no per-viewer field", () => {
    expect(socialKeys.comments("p-1")).toEqual(socialKeys.comments("p-1"));
    expect(socialKeys.comments("p-1")).not.toEqual(socialKeys.comments("p-2"));
  });
});
