// Q&A API — social_service, the `/v1/social/qa` half.
//
// ---------------------------------------------------------------------------
// THE LIST IS A BARE ARRAY. THE FEED IS `{ items }`. BOTH ARE CORRECT.
// ---------------------------------------------------------------------------
//   GET /v1/social/feed  200  { "items": [...], "next_offset": ... }
//   GET /v1/social/qa    200  [...]                     BARE ARRAY
//
// The asymmetry was confirmed against the running service, not inferred from the
// schemas, and `inbox_service` has the same split (threads enveloped, messages
// bare) — so it is a house pattern rather than a bug to normalise away. A mapper
// that reached for `.items` here would read `undefined`, and with a `?? []`
// fallback it would render an empty list forever while the server returned rows.
// That is the failure mode this file exists to make impossible.
//
// There is also NO PAGING on this route. It takes no `limit`/`offset` and
// returns no `next_offset`, so `listQA` returns `QAEntry[]` and not `Page<T>` —
// a paged signature over an unpaged route invents a stop condition the server
// never sends.
//
// ---------------------------------------------------------------------------
// `POST /v1/social/qa/{id}/answer` IS DELIBERATELY NOT WRAPPED
// ---------------------------------------------------------------------------
// It is doctor/admin only. This is the patient app — PatientShell, the five
// patient tabs, a patient token — and features/community/api.ts already
// established the rule for exactly this case with `GET /v1/social/moderation`:
// a client method is not neutral, because "shipping a client method first
// invites someone to bind it to a button an ordinary user can see". A patient
// reads questions and asks them. Answering belongs to the practitioner surface,
// which is a different shell and a different build.
//
// ---------------------------------------------------------------------------
// THESE ARE THE MOST SENSITIVE ROWS IN THE SERVICE
// ---------------------------------------------------------------------------
// People ask about sexual health, mental health and substance use here, and
// `is_anonymous` defaults **TRUE** server-side because of it. `QAOut` withholds
// `author_user_id` when the question is anonymous — but the guarantee cannot be
// "remember not to render the id", so `QAEntry` carries NO id field at all. The
// mapper below reads `author_user_id` only to answer whether a name is available
// and drops it on the floor; nothing downstream can print what it never
// received. See `bylineForQuestion`.
//
// ---------------------------------------------------------------------------
// DUPLICATION, DECLARED
// ---------------------------------------------------------------------------
// `listQA`, `askQuestion` and the `QAOut` -> `QAEntry` mapping also exist in
// `features/community/api.ts`, where they shipped before any screen consumed
// them. They are COPIED here rather than imported because this feature's domain
// type deliberately differs — community's `QAEntry` exposes `authorUserId` and
// `answeredByUserId`, and this one exposes neither. Importing would have pulled
// both ids back into reach of a component. The two copies should be reconciled
// by deleting community's, which nothing calls.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { client } from "@/lib/api/client";

export const QA_PATH = "/v1/social/qa";

// ---------------------------------------------------------------------------
// Wire type — app/schemas/, social_service
// ---------------------------------------------------------------------------

interface QAOutWire {
  question_id: string;
  /** NULL when `is_anonymous` — which is the DEFAULT for questions. */
  author_user_id?: string | null;
  author_role: string;
  question: string;
  is_anonymous: boolean;
  moderation_status: string;
  answer?: string | null;
  answered_by_user_id?: string | null;
  answered_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Domain type
// ---------------------------------------------------------------------------

/**
 * A question as this feature draws it.
 *
 * NO IDENTIFIERS FOR PEOPLE. Not the asker's, not the answerer's. `question_id`
 * is here because it is a row key; every user id is dropped by `toQA` below.
 *
 * The asker's id was a stable pseudonymous handle even before the service began
 * withholding it: the same id appears on that person's attributed posts and
 * comments, where the name IS populated, so two ordinary reads and a join
 * deanonymised any anonymous question. The answerer's id is dropped for a
 * duller reason — there is nothing to resolve it against on this screen, and a
 * raw UUID under a clinical answer is worse than no attribution at all.
 */
export interface QAEntry {
  id: string;
  /**
   * The asker's display name, or null.
   *
   * Null in TWO cases the UI must not conflate, which is why `isAnonymous` is a
   * separate field rather than being inferred from this one:
   *   - the question is anonymous, and no name exists in the row at all;
   *   - the question is attributed but the write-time lookup failed.
   * `bylineForQuestion` is the only place that decision is made.
   *
   * NOTE: `QAOut` carries no `author_name`. It is therefore always null today,
   * and the field exists so that adding one server-side does not require a
   * second pass over every call site. An attributed question currently falls
   * back to the neutral label, which is honest: the service knows the role, not
   * the name.
   */
  authorName: string | null;
  /** Free text on the wire (`patient`, `doctor`, ...). Do not switch on it exhaustively. */
  authorRole: string;
  question: string;
  /** TRUE by default. The UI states the default rather than making the user guess. */
  isAnonymous: boolean;
  /** Free text. Questions carry moderation status like posts and comments do. */
  moderationStatus: string;
  answer: string | null;
  answeredAtIso: string | null;
  createdAtIso: string;
  /**
   * Whether a clinician has answered.
   *
   * An unanswered question is a LEGITIMATE STATE, not a loading state. Derived
   * from the answer text rather than from `answered_at`, because the text is
   * what the screen renders — a row with a timestamp and no body would draw an
   * empty answer block, and a row with a body and no timestamp still has an
   * answer worth reading.
   */
  isAnswered: boolean;
}

/**
 * What to print above a question.
 *
 * Three cases, and they are not the same claim:
 *   - anonymous       -> "Anonymous". The name is absent from the row, not
 *                        merely hidden by this client.
 *   - attributed, named   -> the name.
 *   - attributed, no name -> "MedApp member". Someone real asked; we cannot say
 *                        who.
 *
 * There is no id fallback and there cannot be one — `QAEntry` has no id to fall
 * back to. Inventing a name for an anonymous asker, or deriving initials from
 * one, would be fabricating an identity for the most sensitive rows in the
 * service.
 */
export function bylineForQuestion(entry: QAEntry): string {
  if (entry.isAnonymous) return "Anonymous";
  return entry.authorName ?? "MedApp member";
}

/**
 * Query keys.
 *
 * VIEWER-FREE, unlike the feed's. `QAOut` carries no per-viewer field — no
 * `liked_by_me`, no `owned_by_me`, nothing computed from the caller — so this
 * cache is correct for anybody and survives an account switch. Baking a viewer
 * in anyway would silently refetch the whole list on every sign-in for no
 * correctness gain.
 */
export const qaKeys = {
  all: ["qa"] as const,
  list: () => ["qa", "list"] as const,
};

function toQA(w: QAOutWire): QAEntry {
  return {
    id: w.question_id,
    // `author_user_id` is READ AND DISCARDED. It is the only field on the wire
    // that could identify the asker, and the surest way to keep it out of a
    // <Text> is for the domain type never to carry it. See the header.
    authorName: null,
    authorRole: w.author_role,
    question: w.question,
    isAnonymous: w.is_anonymous,
    moderationStatus: w.moderation_status,
    answer: w.answer ?? null,
    answeredAtIso: w.answered_at ?? null,
    createdAtIso: w.created_at,
    // Trimmed: the server stores free text, and a whitespace-only answer is not
    // an answer. Without the trim such a row would render an empty tinted block
    // under "Answered by a clinician", which claims more than it delivers.
    isAnswered: Boolean(w.answer && w.answer.trim().length > 0),
  };
}

/** Longest question the server accepts. Restated so the composer can stop at it rather than 422. */
export const QUESTION_MAX_LENGTH = 4000;

export const qaApi = {
  /**
   * `GET /v1/social/qa` — a BARE ARRAY. See the header; this is not the feed's
   * `{ items }` envelope and must not be read as one.
   *
   * `?? []` guards a null body, not a missing envelope: there is no envelope to
   * miss. Newest first is the server's ordering and this client does not re-sort
   * — nor does it filter on `moderation_status`, which would be a second opinion
   * about moderation held in the wrong place.
   */
  async listQA(): Promise<QAEntry[]> {
    const w = await client.get<QAOutWire[]>(QA_PATH);
    return (w ?? []).map(toQA);
  },

  /**
   * `POST /v1/social/qa`.
   *
   * `isAnonymous` defaults TRUE here to match the server's own default. It is
   * passed EXPLICITLY rather than omitted so the two defaults cannot drift: if
   * the server's flips, this client keeps sending what the UI promised the user,
   * and getting this backwards deanonymises a patient health question.
   */
  async askQuestion(question: string, isAnonymous = true): Promise<QAEntry> {
    return toQA(
      await client.post<QAOutWire>(QA_PATH, {
        question,
        is_anonymous: isAnonymous,
      }),
    );
  },
};
