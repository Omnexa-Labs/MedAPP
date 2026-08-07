# API contract - `social_service`

**Prefix:** `/v1/social` | **Source:** `backend/services/social_service/app/schemas/`
**Client:** `frontend/mobile/MedAPP/src/features/community/api.ts`

> No new endpoints created. Gateway already routed `/v1/social`.

## Routes

| Method | Path | Returns | Verified live |
| --- | --- | --- | --- |
| GET | `/v1/social/feed` | `PostList` - `{items}` | 200 |
| GET | `/v1/social/qa` | **bare array** | 200 |
| GET | `/v1/social/moderation` | reviewer queue | **401 for a patient token** (correct) |
| POST | `/v1/social/posts` | `PostOut` | - |
| POST | `/v1/social/posts/{id}/comments` | `CommentOut` | - |
| POST | `/v1/social/posts/{id}/react` | `ReactionOut` | - |
| POST | `/v1/social/qa` | `QAOut` | - |
| POST | `/v1/social/qa/{id}/answer` | `QAOut` | - |

**Envelope asymmetry is real**: feed is `{items}`, qa is a bare array. Confirmed against the running
service, not inferred. `inbox_service` has the same split, so treat it as a house pattern.

## Schemas

**`PostOut`** - `post_id`, `kind`, `author_user_id`, `author_role`, `title`, `body`, `excerpt?`,
`tags[]`, `is_anonymous`, `moderation_status`, `published_at?`, `created_at`, `updated_at`.

**`QAOut`** - `question_id`, `author_user_id`, `author_role`, `question`, `is_anonymous`,
`moderation_status`, `answer?`, `answered_by_user_id?`, `answered_at?`, timestamps.

**`CommentOut`** - `comment_id`, `post_id`, `author_user_id`, `author_role`, `body`,
`moderation_status`, timestamps.

**`PostCreate`** - `title`, `body` (max 10k), `excerpt?`, `tags[]`, `is_anonymous` (default FALSE).
**`QAQuestionCreate`** - `question`, `is_anonymous` (**default TRUE** - health questions).
**`ReactionCreate`** - `reaction_type` (default "like", free text max 32).

## THE BLOCKER: the feed contract cannot populate the feed screen

`CommunityScreen`s `FeedPost` needs `author` (display name), `avatarUri`, `role`, `ago`, `likes`,
`comments` and `followedByUser`. `PostOut` supplies **none of the identity or engagement fields**:

| Screen needs | On the wire? |
| --- | --- |
| author display name | **YES since 2026-08-07** - `author_name` on `PostOut` |
| author avatar | NO, and not planned for v1 - **initials instead** (no avatar exists anywhere for patients) |
| like count | **YES since 2026-08-07** - `like_count` on `PostOut` |
| comment count | **YES since 2026-08-07** - `comment_count` on `PostOut` (approved only) |
| follow state | NO - there is no follow graph at all |

Wiring the screen today would render a feed of UUID-authored posts with zero likes and zero
comments. That is worse than the seed it replaces, so **the screen was NOT wired**. This is the same
call made for `PatientRecordScreen`, for the same reason: a screen that renders untruthfully is
worse than one honestly marked as pending.

### What would unblock it - additive, no new routes
```python
author_name: str | None       # resolved, or None when is_anonymous
author_avatar_url: str | None
like_count: int
comment_count: int
```
Plus either `GET /posts/{id}/comments` or an embedded first page of comments. A follow graph is a
larger product question and the Following tab depends on it.

## Other gaps and hazards

- **`moderation_status` is on posts, comments AND questions.** This is health content written by
  patients. The client derives `isPublished` as `moderation_status == "approved" AND published_at
  is set` - both, because an approved draft is still a draft and a published-but-unapproved row is
  exactly what moderation exists to stop.
- **`moderation_status`, `kind`, `source` and `reaction_type` are all FREE TEXT**, not enums.
- **`is_anonymous` defaults TRUE for questions and FALSE for posts.** Getting that backwards
  deanonymises a patient health question.
- **`/v1/social/moderation` is not wrapped in the client on purpose.** A moderation screen needs a
  role gate in navigation as well as in the API; shipping the method first invites binding it to a
  button an ordinary user can see.
- **No pagination on the feed.**

## Wiring status

| Screen | State |
| --- | --- |
| Client (`features/community/api.ts`) | Written, verified live: feed and qa both 200. |
| `CommunityScreen` (766 lines) | **Not wired** - contract cannot populate `FeedPost`, see above. |
| `CommunityHubScreen`, `ExploreScreen` | Not wired; groups and follow have no backend at all. |

---

## Step 1 done and verified 2026-08-07: engagement counts

`PostOut` now carries `like_count` and `comment_count`, computed as correlated scalar subqueries in
`list_feed` - not a join with GROUP BY (which multiplies rows across two child tables) and not a
per-post query (the N+1 this avoids). Only APPROVED comments count: the feed card is public and a
pending comment must not inflate a number implying it was published.

**Verified live**: a post with one reaction and one comment reported `likes=1 comments=1`, and a
second comment moved it to `comments=2`.

### The bug this shipped with, and the lesson
The first version reported **0 for a post that had one of each**. `list_feed` attaches the counts as
transient attributes on the ORM instance, but `read_feed` builds `PostOut` from an EXPLICIT DICT,
so `from_attributes` never runs and the omitted fields fell back to their defaults.

The default for a count is `0` - **indistinguishable from a real answer**. Nothing errored, nothing
was typed wrong, and the endpoint returned 200 with a plausible payload. Any field added to
`PostOut` must also be added to that dict in `read_feed`; a default that looks like valid data is
the worst kind to rely on.

Remaining for the feed screen: `author_name` and `author_avatar_url` (step 2), which are blocked -
the JWT carries no display name, `Principal` is only subject+role, and `user_service` has no
lookup-by-id, so denormalising at write needs a new internal endpoint or a name claim in the token.

---

## Step 2 done 2026-08-07: `author_name`, and initials instead of avatars

`PostOut` now carries `author_name`, resolved from user_service at WRITE time and snapshotted onto
the row.

**Why a snapshot and not a join:** identity lives in another service with no shared database.
Resolving at read time would be an N+1 across the network on every feed paint, and would take
Community down whenever user_service blinked. Writes are rare; feeds are read constantly.

**The lookup runs as the AUTHOR.** The caller's bearer token is forwarded to
`GET http://user_service:8001/users/{id}`, so a caller can never resolve a name they could not have
resolved themselves, and social_service needs no service identity of its own.

**Failure is non-fatal.** If user_service is unreachable the post is still created with a null name.
Losing a display name is a degraded feed row; losing the post is losing what someone wrote.

### Anonymity holds in the DATABASE, not the serialiser
An anonymous post never gets a name written at all - it is absent from the row, not present and
filtered on the way out. A name that exists in the table is one a future query, export, admin screen
or log line can leak.

Verified against Postgres directly:

| title | is_anonymous | author_name |
| --- | --- | --- |
| Anon | t | `<NULL>` |
| Named | f | `Kwabena Osei` |

### Avatars: initials for v1 (PO decision)
There is **no avatar anywhere for a patient** - `User` has no such column, and only clinicians have
one, on `doctor_service.photo_url`. Rather than block Community on an avatar-upload feature nobody
has scoped, v1 renders initials through the existing `AvatarWithFallback`.

`authorName` is null in two cases the UI must not conflate - anonymous, and lookup-failed - and in
both the client must fall back to initials and a neutral label. **It must never print
`authorUserId`**: a raw UUID as a byline is worse than no byline, and on an anonymous post it
deanonymises the author outright.

### ~~KNOWN STALENESS~~ ADDRESSED 2026-08-07 (code written, NOT yet verified)
`user_service` now publishes `user.profile.updated` from `PATCH /me` **only when the display name
actually changed** — a PATCH touching allergies must not make every consumer rewrite its rows.

`social_service` is the **first consumer in this codebase** (everything else only published). It
subscribes on startup and rewrites `author_name` on both `social_posts` and `post_comments`.

**Anonymous posts are excluded**: the UPDATE is scoped to rows where `author_name IS NOT NULL`. An
anonymous post has no name by construction, and writing one during a rename would deanonymise its
author through the back door — the exact leak `create_post` avoids by never storing it.

Subscription failure is non-fatal: a broker outage must not stop the feed serving. `consume_events`
turns it off where there is no broker.

**NOT VERIFIED.** Docker Desktop's daemon went down before the rebuild, so neither the publisher nor
the consumer has been exercised against a running stack. The obvious end-to-end check: rename a
seeded doctor via `PATCH /v1/me`, then re-read `/v1/social/feed` and confirm the byline changed on
their existing posts.

### Feed gaps now
| Field | State |
| --- | --- |
| author name | DONE |
| like count | DONE |
| comment count | DONE |
| avatar | initials for v1, by decision |
| follow state | deferred - no follow graph |

---

## Step 4 done 2026-08-07: `GET /posts/{post_id}/comments`

`{items}`, oldest first, **approved only** — matching the `comment_count` aggregate. A list that
disagreed with the number that led the user there would be worse than no list, and returning
pending comments would publish a flagged one by the back door.

Oldest first, unlike the feed: a conversation reads in the order it happened.

An unknown post **404s** rather than returning an empty array — "no comments yet" and "no such post"
are different answers and must not look the same.

`post_comments` gained the same `author_name` snapshot as posts, resolved at write time through the
forwarded caller token. Verified live: two comments returned with `Kwabena Osei` on both, and an
unknown id returned `404 {"detail":"post not found"}`.

Authenticated, like the feed. This is patient-written health discussion, not open web content.

**No pagination**, consistent with the rest of the service. Fine at tens of comments; revisit before
thousands.

### ~~A DESIGN DEFECT THIS EXPOSED~~ RESOLVED 2026-08-07 — frame `1066:2025`
The post-detail frame draws an **anonymous comment**. A comment has no `is_anonymous` field:
`CommentCreate` is `{body}` only, and comments are always attributed. The frame promises a state the
backend cannot produce.

**PO ruled: redraw with a real name**, rather than adding `is_anonymous` to comments. Questions are
anonymous because asking about your own symptoms is exposing; commenting on someone else's post is
not the same act, and inventing an anonymity mode to satisfy a frame would have been the tail
wagging the dog.

The row is now **Dr. Adjoa Boateng** — in the seeded roster, and the cardiologist, so a
blood-pressure clarification is hers to give. The copy changed with her: it had been a patient
asking a question, and leaving a question under a clinician's name would have swapped one wrong
state for another. The `?` initials disc, which existed so an anonymous commenter would not borrow
a real person's initials, becomes ordinary initials.

Frame and API now agree: every comment is attributed, and `author_name` is null only when the
write-time lookup failed.

---

## Post detail BUILT 2026-08-07

`src/features/community/PostDetailScreen.tsx`, route `/(app)/post-detail`, frame `1066:2025`.
The feed card's "Read more" and comment count now both open it — they were the last two
live-looking controls on that card with no handler.

### THERE IS NO `GET /v1/social/posts/{id}`, and it shapes the screen
The service exposes the FEED and the COMMENTS, but no single-post read. The post is therefore taken
from the react-query cache under `["social", "feed"]`, which Community has populated by the time
anyone can tap through.

A **cold cache** — deep link, process restart, eviction — leaves nothing to render, and that case
shows an explicit "open it from Community" state rather than a spinner with no exit. A fabricated
placeholder would be worse than admitting we cannot load it.

Adding a single-post route would make this a `useQuery` and delete the cold-cache branch; nothing
else in the file would change.

### Byline rules, which carry real weight
Three states collapse into one nullable `authorName`, and they are not interchangeable:

| State | Renders |
| --- | --- |
| anonymous post | `Anonymous` — the name is absent from the DB, not hidden by the client |
| lookup failed | `MedApp member` — someone real wrote it, we could not resolve who |
| resolved | the name |

A COMMENT can only ever hit the middle case; comments have no anonymous mode. Calling a failed
lookup "Anonymous" would tell the reader the author chose to hide, which is a different claim.
`authorUserId` is **never** a fallback — a UUID byline is worse than none, and on an anonymous post
it deanonymises outright. Both directions are covered by tests.

### Sending a comment refetches, deliberately
No optimistic row. The server assigns the id, timestamp and resolved name, and **moderation may hold
the comment back entirely** — an optimistic append would show the author a comment that never
publishes. `onSettled` also invalidates the feed, because `comment_count` moved.

77 suites / 986 tests pass.
