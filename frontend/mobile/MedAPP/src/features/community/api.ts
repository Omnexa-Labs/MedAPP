// Community API — social_service, `/v1/social`.
//
// ---------------------------------------------------------------------------
// THREE ENVELOPES, ALL VERIFIED LIVE — DO NOT NORMALISE THEM BY EYE
// ---------------------------------------------------------------------------
//   GET /v1/social/feed        200  { "items": [...] }     PostList
//   GET /v1/social/qa          200  [...]                  BARE ARRAY
//   GET /v1/social/moderation  401  for a patient token    moderator-only
//
// The feed/qa asymmetry is real and was confirmed against the running service
// on 2026-08-07, not inferred from the schemas. `inbox_service` has the same
// split (threads enveloped, messages bare), so this is a house pattern rather
// than a one-off.
//
// ---------------------------------------------------------------------------
// MODERATION IS NOT A CLIENT CONCERN YET
// ---------------------------------------------------------------------------
// `GET /v1/social/moderation` 401s for an ordinary user, correctly. It is a
// reviewer queue, and it is deliberately NOT wrapped here: a moderation screen
// needs a role gate in the navigation as well as the API, and shipping a client
// method first invites someone to bind it to a button an ordinary user can see.
//
// ---------------------------------------------------------------------------
// EVERY POST CARRIES A MODERATION STATUS. RESPECT IT.
// ---------------------------------------------------------------------------
// `moderation_status` is on posts, comments AND questions. This is health
// content written by patients, so an unreviewed or rejected item must not be
// rendered as though it were approved. `isPublished` below is the only thing a
// list screen should filter on, and it is derived rather than trusted from a
// single field — see the note on it.
//
// ---------------------------------------------------------------------------
// `PostOut` IS PER-VIEWER, SO ITS CACHE KEY MUST BE TOO
// ---------------------------------------------------------------------------
// `liked_by_me` and `bookmarked_by_me` are computed from the CALLER; every other
// field is the same for everyone. Any cache keyed only on post id — including a
// shared react-query key — serves one user's like state to another. That is why
// `socialKeys` below takes a viewer id, and why the comment keys deliberately do
// NOT (`CommentOut` carries no per-viewer field at all).
//
// ---------------------------------------------------------------------------
// PAGING IS OFFSET-BASED AND `next_offset` IS THE ONLY STOP SIGNAL
// ---------------------------------------------------------------------------
// The server proves a next page exists by fetching `limit + 1` rows and
// discarding the extra. A client that instead infers "a full page means more"
// loops forever when the total is an exact multiple of the limit — so
// `nextOffset === null` is the one terminator, and `Page` carries it verbatim.

import { client } from "@/lib/api/client";

export const SOCIAL_PATH = "/v1/social";

/**
 * Rows per page. The server's own default, restated because the client sends it
 * explicitly — `limit` is bounded at 100 by FastAPI (`Query(ge=1, le=100)`) and
 * an out-of-range value is a 422 rather than a silent clamp, so a hardcoded
 * number here is safer than one computed from a screen height.
 */
export const PAGE_LIMIT = 20;

// ---------------------------------------------------------------------------
// Wire types — app/schemas/
// ---------------------------------------------------------------------------

interface PostOutWire {
  post_id: string;
  kind: string;
  author_user_id: string | null;
  owned_by_me?: boolean;
  author_role: string;
  author_name: string | null;
  title: string;
  body: string;
  excerpt: string | null;
  tags: string[];
  is_anonymous: boolean;
  moderation_status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  like_count: number;
  comment_count: number;
  /** Per-viewer. TRUE for ANY reaction the viewer left, not only "like". */
  liked_by_me?: boolean;
  /** Per-viewer. Private to the caller — bookmarks feed no public count. */
  bookmarked_by_me?: boolean;
}

interface PostListWire {
  items: PostOutWire[];
  next_offset: number | null;
}

interface BookmarkOutWire {
  bookmark_id: string;
  post_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface ReportOutWire {
  report_id: string;
  reporter_user_id: string;
  target_type: "post" | "comment";
  target_id: string;
  reason: string;
  note: string | null;
  /** Always "flagged" on success — the report IS the state change. */
  target_moderation_status: string;
  created_at: string;
  updated_at: string;
}

interface QAOutWire {
  question_id: string;
  author_user_id: string | null;
  author_role: string;
  question: string;
  is_anonymous: boolean;
  moderation_status: string;
  answer: string | null;
  answered_by_user_id: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CommentListWire {
  items: CommentOutWire[];
  next_offset: number | null;
}

interface CommentOutWire {
  comment_id: string;
  post_id: string;
  author_user_id: string;
  author_role: string;
  author_name: string | null;
  body: string;
  moderation_status: string;
  created_at: string;
  updated_at: string;
  // Threading, added 2026-08-08. Optional on the wire type rather than
  // required: a cached response written before the migration shipped, or a
  // stubbed fixture, must still map instead of throwing.
  parent_comment_id?: string | null;
  reply_to_user_id?: string | null;
  reply_to_name?: string | null;
  reply_count?: number;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * One page of a paged list.
 *
 * `nextOffset` is the SERVER's answer to "is there more", not ours. Null means
 * last page — see the header for why a full page is not the same signal.
 */
export interface Page<T> {
  items: T[];
  nextOffset: number | null;
}

export interface Post {
  id: string;
  kind: string;
  /**
   * NULL on an anonymous post — the service withholds it, because the id is
   * stable and also appears on the same author's attributed posts and comments,
   * so returning it let two ordinary reads undo the anonymity.
   *
   * It is therefore NOT the way to decide ownership any more. Use `ownedByMe`.
   */
  authorUserId: string | null;
  /**
   * Ownership as the SERVER computed it, which is the only place it can still
   * be computed for an anonymous post. This is what gates Delete.
   */
  ownedByMe: boolean;
  authorRole: string;
  /**
   * Resolved from user_service at write time. NULL in two different cases the
   * UI must not conflate:
   *   - the post is anonymous, and the name is not merely hidden but absent
   *     from the database entirely;
   *   - the lookup failed when the post was written.
   *
   * Either way: fall back to initials via `AvatarWithFallback` and a neutral
   * label. NEVER print `authorUserId` — a raw UUID as a byline is worse than
   * no byline, and on an anonymous post it deanonymises the author outright.
   */
  authorName: string | null;
  title: string;
  body: string;
  excerpt: string | null;
  tags: string[];
  isAnonymous: boolean;
  /** Free text on the wire. Do not switch on it exhaustively. */
  moderationStatus: string;
  publishedAtIso: string | null;
  createdAtIso: string;
  /** Reaction total. Every reaction type counts, not just "like". */
  likeCount: number;
  /** APPROVED comments only — a pending one must not inflate a public number. */
  commentCount: number;
  /**
   * Whether THIS viewer reacted. True for any reaction type, matching
   * `likeCount` — the field name promises something narrower than it delivers,
   * and that is the server's naming, documented rather than papered over.
   *
   * This is the only initial state a like button may use. Local `useState`
   * makes the control lie the moment the screen remounts.
   */
  likedByMe: boolean;
  /** Whether THIS viewer saved it. Private; it feeds no public count. */
  bookmarkedByMe: boolean;
  /**
   * Safe to show in a public list.
   *
   * BOTH conditions, deliberately: a post is only public when moderation has
   * approved it AND a publish time exists. Either alone has been enough to leak
   * unreviewed content in products like this — an approved-but-unpublished
   * draft is still a draft, and a published-but-unapproved row is exactly what
   * moderation is for.
   */
  isPublished: boolean;
}

export interface QAEntry {
  id: string;
  /** NULL when the question is anonymous — which is the DEFAULT for questions. */
  authorUserId: string | null;
  authorRole: string;
  question: string;
  isAnonymous: boolean;
  moderationStatus: string;
  answer: string | null;
  answeredByUserId: string | null;
  answeredAtIso: string | null;
  createdAtIso: string;
  /** An unanswered question is a legitimate state, not a loading state. */
  isAnswered: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  authorUserId: string;
  authorRole: string;
  /**
   * Resolved at write time. Null ONLY when that lookup failed — unlike a post,
   * a comment has no anonymous mode, so null never means "withheld". Fall back
   * to initials; never print `authorUserId`.
   */
  authorName: string | null;
  body: string;
  moderationStatus: string;
  createdAtIso: string;
}

const APPROVED = "approved";

function toPost(w: PostOutWire): Post {
  return {
    id: w.post_id,
    kind: w.kind,
    authorUserId: w.author_user_id ?? null,
    ownedByMe: Boolean(w.owned_by_me),
    authorRole: w.author_role,
    authorName: w.author_name ?? null,
    title: w.title,
    body: w.body,
    excerpt: w.excerpt ?? null,
    tags: w.tags ?? [],
    isAnonymous: w.is_anonymous,
    moderationStatus: w.moderation_status,
    publishedAtIso: w.published_at ?? null,
    createdAtIso: w.created_at,
    likeCount: w.like_count ?? 0,
    commentCount: w.comment_count ?? 0,
    // `?? false`, not `?? true`: a viewer flag that defaults ON would paint a
    // filled heart on a post nobody liked, and the first tap would then issue
    // an UNLIKE. The same class of defect as the `like_count: 0` fallback the
    // backend shipped — a default indistinguishable from a real answer — except
    // this one is at least biased towards the harmless direction.
    likedByMe: w.liked_by_me ?? false,
    bookmarkedByMe: w.bookmarked_by_me ?? false,
    isPublished: w.moderation_status === APPROVED && Boolean(w.published_at),
  };
}

/**
 * Is this the signed-in user's own post?
 *
 * Lives HERE rather than in a screen so the comparison happens at the data
 * layer and only its boolean result travels into the UI. `authorUserId` is
 * present on an anonymous post too, and the delete affordance has to work for
 * one — so ownership is answered without the id ever reaching a component that
 * could render it.
 *
 * A null viewer is never an owner: an unauthenticated read must not offer
 * Delete on every row.
 */
export function isOwnPost(post: Post, viewerId: string | null | undefined): boolean {
  // `ownedByMe`, not an id comparison: `authorUserId` is null on an anonymous
  // post, and comparing null to a viewer id would silently take Delete away
  // from the one person entitled to it. The viewer check stays because an
  // unauthenticated read must never be offered Delete on every row.
  return Boolean(viewerId) && post.ownedByMe;
}

/** Same rule for a comment. Comments have no anonymous mode, but the id is still not a byline. */
export function isOwnComment(comment: Comment, viewerId: string | null | undefined): boolean {
  return Boolean(viewerId) && comment.authorUserId === viewerId;
}

/**
 * Query keys, in one place, with the VIEWER baked into everything per-viewer.
 *
 * See the header: `liked_by_me` / `bookmarked_by_me` come from the caller, so a
 * key that omits the viewer will hand one user's like state to the next one to
 * sign in on the device. Comments carry no per-viewer field, so their key is
 * deliberately viewer-free and survives an account switch.
 */
export const socialKeys = {
  /** Everything this feature caches. The root the optimistic patcher scans. */
  all: ["social"] as const,
  feed: (viewerId: string | null | undefined) => ["social", viewerId ?? "anon", "feed"] as const,
  bookmarks: (viewerId: string | null | undefined) =>
    ["social", viewerId ?? "anon", "bookmarks"] as const,
  post: (viewerId: string | null | undefined, postId: string | undefined) =>
    ["social", viewerId ?? "anon", "post", postId] as const,
  comments: (postId: string | undefined) => ["social", "comments", postId] as const,
};

/**
 * The reasons the report sheet offers.
 *
 * `reason` is FREE TEXT (max 64) on the wire, not an enum, so this list is the
 * client's own vocabulary and adding to it needs no migration. A fixed list
 * rather than a text box because one report flags the item outright — see the
 * hazard in docs/api/social_service.md — and a reviewer needs to know why.
 */
export const REPORT_REASONS = [
  "Medical misinformation",
  "Harassment or abuse",
  "Spam or advertising",
  "Private information",
  "Something else",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/** `?limit=&offset=`, only when asked for — an absent param is the server default. */
function pageQuery({ limit = PAGE_LIMIT, offset = 0 }: PageParams = {}): string {
  return `?limit=${limit}&offset=${offset}`;
}

export interface PageParams {
  limit?: number;
  offset?: number;
}

function toQA(w: QAOutWire): QAEntry {
  return {
    id: w.question_id,
    authorUserId: w.author_user_id ?? null,
    authorRole: w.author_role,
    question: w.question,
    isAnonymous: w.is_anonymous,
    moderationStatus: w.moderation_status,
    answer: w.answer ?? null,
    answeredByUserId: w.answered_by_user_id ?? null,
    answeredAtIso: w.answered_at ?? null,
    createdAtIso: w.created_at,
    isAnswered: Boolean(w.answer),
  };
}

function toComment(w: CommentOutWire): Comment {
  return {
    id: w.comment_id,
    postId: w.post_id,
    authorUserId: w.author_user_id,
    authorRole: w.author_role,
    authorName: w.author_name ?? null,
    body: w.body,
    moderationStatus: w.moderation_status,
    createdAtIso: w.created_at,
  };
}

export const communityApi = {
  /**
   * `GET /v1/social/feed` — `{ items, next_offset }`, newest first.
   *
   * Returns a PAGE, not an array. It used to return every row the first call
   * happened to bring back, which is the shape that made "no pagination on the
   * feed" true in the client long after the server grew it.
   */
  async listFeed(params?: PageParams): Promise<Page<Post>> {
    const w = await client.get<PostListWire>(`${SOCIAL_PATH}/feed${pageQuery(params)}`);
    return { items: (w.items ?? []).map(toPost), nextOffset: w.next_offset ?? null };
  },

  /**
   * `GET /v1/social/posts/{id}` — the same shape as a feed row, counts and
   * per-viewer flags included, so the feed's mapper is reused verbatim.
   *
   * 404s for a post that is missing OR flagged. A reported post is gone from
   * the feed, and letting a saved deep link still open it would make reporting
   * cosmetic.
   */
  async getPost(postId: string): Promise<Post> {
    return toPost(await client.get<PostOutWire>(`${SOCIAL_PATH}/posts/${postId}`));
  },

  /**
   * `DELETE /v1/social/posts/{id}` — AUTHOR ONLY, 403 otherwise, and a HARD
   * delete: there is no soft-delete column anywhere in this service and no
   * admin override. Comments and reactions cascade.
   */
  async deletePost(postId: string): Promise<void> {
    await client.delete(`${SOCIAL_PATH}/posts/${postId}`);
  },

  /** `GET /v1/social/qa` — a BARE ARRAY, unlike the feed. Verified live. */
  async listQA(): Promise<QAEntry[]> {
    const w = await client.get<QAOutWire[]>(`${SOCIAL_PATH}/qa`);
    return (w ?? []).map(toQA);
  },

  async createPost(input: {
    title: string;
    body: string;
    excerpt?: string;
    tags?: string[];
    isAnonymous?: boolean;
  }): Promise<Post> {
    return toPost(
      await client.post<PostOutWire>(`${SOCIAL_PATH}/posts`, {
        title: input.title,
        body: input.body,
        excerpt: input.excerpt ?? null,
        tags: input.tags ?? [],
        is_anonymous: input.isAnonymous ?? false,
      }),
    );
  },

  /**
   * `GET /v1/social/posts/{id}/comments` — `{ items }`, oldest first.
   *
   * APPROVED comments only, matching the `commentCount` on the feed card. A
   * list that disagreed with the number that led the user here would be worse
   * than no list.
   *
   * Oldest first, unlike the feed: a conversation reads in the order it
   * happened. Paged like everything else — `next_offset`, null on the last
   * page. Newer comments land at the END, so an offset window is far less
   * exposed to shifting here than on the feed.
   */
  async listComments(postId: string, params?: PageParams): Promise<Page<Comment>> {
    const w = await client.get<CommentListWire>(
      `${SOCIAL_PATH}/posts/${postId}/comments${pageQuery(params)}`,
    );
    return { items: (w.items ?? []).map(toComment), nextOffset: w.next_offset ?? null };
  },

  async commentOnPost(postId: string, body: string): Promise<Comment> {
    return toComment(
      await client.post<CommentOutWire>(`${SOCIAL_PATH}/posts/${postId}/comments`, { body }),
    );
  },

  /**
   * `DELETE /v1/social/posts/{postId}/comments/{commentId}` — author only.
   *
   * The post id is verified AGAINST the comment server-side, so a client cannot
   * delete a comment by pairing its id with an unrelated post; that is a 404,
   * not a silent success.
   */
  async deleteComment(postId: string, commentId: string): Promise<void> {
    await client.delete(`${SOCIAL_PATH}/posts/${postId}/comments/${commentId}`);
  },

  /** `reaction_type` defaults to "like" server-side; it is free text (max 32). */
  async reactToPost(postId: string, reactionType = "like"): Promise<void> {
    await client.post(`${SOCIAL_PATH}/posts/${postId}/react`, {
      reaction_type: reactionType,
    });
  },

  /**
   * `DELETE /v1/social/posts/{id}/react` — IDEMPOTENT. A delete with nothing to
   * delete is 204, not 404.
   *
   * That is what makes a like button honest over an unreliable network: the
   * second tap of a double tap, or a retry after a timeout, reports success for
   * the state the user already wanted rather than an error.
   */
  async unreactToPost(postId: string): Promise<void> {
    await client.delete(`${SOCIAL_PATH}/posts/${postId}/react`);
  },

  /**
   * `POST /v1/social/posts/{id}/bookmark` — idempotent, and returns the
   * EXISTING row with 201 rather than 409. A bookmark is a desired end state,
   * not an event.
   */
  async bookmarkPost(postId: string): Promise<void> {
    await client.post<BookmarkOutWire>(`${SOCIAL_PATH}/posts/${postId}/bookmark`);
  },

  /** `DELETE /v1/social/posts/{id}/bookmark` — 204 whether or not one existed. */
  async unbookmarkPost(postId: string): Promise<void> {
    await client.delete(`${SOCIAL_PATH}/posts/${postId}/bookmark`);
  },

  /**
   * `GET /v1/social/me/bookmarks` — the SAME `PostList` envelope as the feed,
   * so `toPost` and every card that renders it are reused unchanged.
   *
   * Ordered by when it was SAVED, not when the post was published: it is a
   * reading list. Filtered to approved, so a post reported after you saved it
   * disappears from here too — a bookmark is not a private back door to flagged
   * content.
   */
  async listBookmarks(params?: PageParams): Promise<Page<Post>> {
    const w = await client.get<PostListWire>(`${SOCIAL_PATH}/me/bookmarks${pageQuery(params)}`);
    return { items: (w.items ?? []).map(toPost), nextOffset: w.next_offset ?? null };
  },

  /**
   * `POST /v1/social/posts/{id}/report`.
   *
   * THERE IS NO THRESHOLD. One report sets the target to `flagged`, which
   * removes it from the feed and 404s its deep link — and there is no un-flag
   * route, so a moderator cannot undo it through the API. The UI must say the
   * post will disappear; a post vanishing with no explanation reads as a bug.
   *
   * Re-reporting is idempotent (unique on reporter+target) and returns the
   * original report rather than 409ing.
   */
  async reportPost(postId: string, reason: string, note?: string): Promise<void> {
    await client.post<ReportOutWire>(`${SOCIAL_PATH}/posts/${postId}/report`, {
      reason,
      note: note?.trim() ? note.trim() : null,
    });
  },

  /** `POST /v1/social/comments/{id}/report` — note the path is NOT nested under the post. */
  async reportComment(commentId: string, reason: string, note?: string): Promise<void> {
    await client.post<ReportOutWire>(`${SOCIAL_PATH}/comments/${commentId}/report`, {
      reason,
      note: note?.trim() ? note.trim() : null,
    });
  },

  /** `is_anonymous` defaults to TRUE on the server for questions — health questions. */
  async askQuestion(question: string, isAnonymous = true): Promise<QAEntry> {
    return toQA(
      await client.post<QAOutWire>(`${SOCIAL_PATH}/qa`, {
        question,
        is_anonymous: isAnonymous,
      }),
    );
  },
};
