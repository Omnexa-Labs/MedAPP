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
import { bylineFor, commentByline, initialsFor } from "../bylines";

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

describe("threaded replies", () => {
  const COMMENT_WIRE = {
    comment_id: "c-1",
    post_id: "p-1",
    author_user_id: "u-2",
    author_role: "user",
    author_name: "Ama Mensah",
    body: "This helped.",
    moderation_status: "approved",
    created_at: "2026-08-08T10:00:00Z",
    updated_at: "2026-08-08T10:00:00Z",
    parent_comment_id: null,
    reply_to_user_id: null,
    reply_to_name: null,
    reply_count: 2,
  };

  it("reads one parent's replies from /comments/{id}/replies, paged", async () => {
    mockGet.mockResolvedValue({ items: [COMMENT_WIRE], next_offset: 20 });
    const page = await communityApi.listReplies("c-1", { limit: 20, offset: 20 });
    // NOT nested under the post: a comment id is globally unique here.
    expect(mockGet).toHaveBeenCalledWith("/v1/social/comments/c-1/replies?limit=20&offset=20");
    expect(page.nextOffset).toBe(20);
    expect(page.items[0].id).toBe("c-1");
  });

  it("keeps a null next_offset as null on the replies pager too", async () => {
    mockGet.mockResolvedValue({ items: [], next_offset: null });
    expect((await communityApi.listReplies("c-1")).nextOffset).toBeNull();
  });

  it("maps the four threading fields, and derives isReply from the parent link", async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          ...COMMENT_WIRE,
          comment_id: "r-1",
          parent_comment_id: "c-1",
          reply_to_user_id: "u-3",
          reply_to_name: "Dr. Adjoa Boateng",
          reply_count: 0,
        },
      ],
      next_offset: null,
    });
    const reply = (await communityApi.listReplies("c-1")).items[0];
    expect(reply.parentCommentId).toBe("c-1");
    expect(reply.replyToUserId).toBe("u-3");
    expect(reply.replyToName).toBe("Dr. Adjoa Boateng");
    expect(reply.replyCount).toBe(0);
    expect(reply.isReply).toBe(true);
  });

  it("keeps a null reply_to_name NULL — there is no fallback to the id", async () => {
    // The renderer keys the "@" prefix off this field being non-null. Defaulting
    // it to the user id, or to a placeholder name, would mint the very identity
    // the null exists to withhold.
    mockGet.mockResolvedValue({
      items: [{ ...COMMENT_WIRE, parent_comment_id: "c-1", reply_to_user_id: "u-3" }],
      next_offset: null,
    });
    const reply = (await communityApi.listReplies("c-1")).items[0];
    expect(reply.replyToName).toBeNull();
    expect(reply.replyToUserId).toBe("u-3");
  });

  it("treats a pre-threading comment as top-level rather than as unknown", async () => {
    // A cached response or a fixture written before the migration has none of the
    // four fields. Every such row IS top-level with no replies, so these defaults
    // are the truth for them rather than a stand-in.
    const { parent_comment_id: _p, reply_to_user_id: _u, reply_to_name: _n, reply_count: _c, ...bare } =
      COMMENT_WIRE;
    mockGet.mockResolvedValue({ items: [bare], next_offset: null });
    const comment = (await communityApi.listComments("p-1")).items[0];
    expect(comment.parentCommentId).toBeNull();
    expect(comment.replyCount).toBe(0);
    expect(comment.isReply).toBe(false);
  });

  it("sends parent_comment_id only when there is one", async () => {
    mockPost.mockResolvedValue(COMMENT_WIRE);
    await communityApi.commentOnPost("p-1", "Top level");
    // OMITTED, not null: the top-level request stays exactly what it was before
    // threading shipped.
    expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/comments", { body: "Top level" });

    await communityApi.commentOnPost("p-1", "A reply", "c-1");
    expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/comments", {
      body: "A reply",
      parent_comment_id: "c-1",
    });
  });

  it("returns the parent the SERVER chose, which is not always the one sent", async () => {
    // The one-level rule is enforced in the service: a reply to a reply is filed
    // against that reply's own parent. A client that trusted its own request would
    // refresh the wrong thread.
    mockPost.mockResolvedValue({
      ...COMMENT_WIRE,
      comment_id: "r-2",
      parent_comment_id: "c-1",
      reply_to_user_id: "u-3",
      reply_to_name: "Dr. Adjoa Boateng",
      reply_count: 0,
    });
    const created = await communityApi.commentOnPost("p-1", "Agreed", "r-1");
    expect(mockPost).toHaveBeenCalledWith("/v1/social/posts/p-1/comments", {
      body: "Agreed",
      parent_comment_id: "r-1",
    });
    expect(created.parentCommentId).toBe("c-1");
    expect(created.replyToName).toBe("Dr. Adjoa Boateng");
  });

  it("keys each thread's replies separately from the comment list", () => {
    // One paged request per open thread. Keying them under the post would make one
    // thread's page invalidate every other thread's.
    expect(socialKeys.replies("c-1")).not.toEqual(socialKeys.replies("c-2"));
    expect(socialKeys.replies("c-1")).not.toEqual(socialKeys.comments("c-1"));
    // Still under the feature root, so the blanket invalidate that follows a report
    // or a delete reaches every open thread.
    expect(socialKeys.replies("c-1")[0]).toBe(socialKeys.all[0]);
  });
});

describe("bylines and initials", () => {
  it("does not call a failed comment lookup Anonymous, or MedApp member", () => {
    // A comment has no anonymous mode, so there is one un-named state — and it is
    // a ROLE rather than a name-shaped string, per the replies design notes.
    expect(commentByline("Ama Mensah")).toBe("Ama Mensah");
    expect(commentByline(null)).toBe("Community member");
    // The POST byline is a different claim and keeps its own wording.
    expect(bylineFor(null, false)).toBe("MedApp member");
    expect(bylineFor(null, true)).toBe("Anonymous");
  });

  it("derives initials from the stored name only, and strips an honorific", () => {
    expect(initialsFor("Ama Mensah")).toBe("AM");
    // Every clinician in the roster would otherwise share a "DR" disc.
    expect(initialsFor("Dr. Adjoa Boateng")).toBe("AB");
    expect(initialsFor("Kwabena")).toBe("K");
  });

  it("has NO initials for a null name, so the avatar falls to the silhouette", () => {
    // Initials cannot be derived from a null, and they must not be derived from the
    // byline fallback either — "CM" would dress a missing identity up as a present
    // one, and an empty coloured circle reads as a broken image.
    expect(initialsFor(null)).toBeNull();
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
