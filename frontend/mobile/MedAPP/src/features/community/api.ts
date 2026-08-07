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

import { client } from "@/lib/api/client";

export const SOCIAL_PATH = "/v1/social";

// ---------------------------------------------------------------------------
// Wire types — app/schemas/
// ---------------------------------------------------------------------------

interface PostOutWire {
  post_id: string;
  kind: string;
  author_user_id: string;
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
}

interface PostListWire {
  items: PostOutWire[];
}

interface QAOutWire {
  question_id: string;
  author_user_id: string;
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

interface CommentOutWire {
  comment_id: string;
  post_id: string;
  author_user_id: string;
  author_role: string;
  body: string;
  moderation_status: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Post {
  id: string;
  kind: string;
  authorUserId: string;
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
  authorUserId: string;
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
  body: string;
  moderationStatus: string;
  createdAtIso: string;
}

const APPROVED = "approved";

function toPost(w: PostOutWire): Post {
  return {
    id: w.post_id,
    kind: w.kind,
    authorUserId: w.author_user_id,
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
    isPublished: w.moderation_status === APPROVED && Boolean(w.published_at),
  };
}

function toQA(w: QAOutWire): QAEntry {
  return {
    id: w.question_id,
    authorUserId: w.author_user_id,
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
    body: w.body,
    moderationStatus: w.moderation_status,
    createdAtIso: w.created_at,
  };
}

export const communityApi = {
  /** `GET /v1/social/feed` — `{ items }`. */
  async listFeed(): Promise<Post[]> {
    const w = await client.get<PostListWire>(`${SOCIAL_PATH}/feed`);
    return (w.items ?? []).map(toPost);
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

  async commentOnPost(postId: string, body: string): Promise<Comment> {
    return toComment(
      await client.post<CommentOutWire>(`${SOCIAL_PATH}/posts/${postId}/comments`, { body }),
    );
  },

  /** `reaction_type` defaults to "like" server-side; it is free text (max 32). */
  async reactToPost(postId: string, reactionType = "like"): Promise<void> {
    await client.post(`${SOCIAL_PATH}/posts/${postId}/react`, {
      reaction_type: reactionType,
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
