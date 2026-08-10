# API contract - `social_service`

**Prefix:** `/v1/social` | **Source:** `backend/services/social_service/app/schemas/`
**Client:** `frontend/mobile/MedAPP/src/features/community/api.ts`

> Gateway routes the whole `/v1/social` prefix to the service, so routes added here need no gateway
> change. Every route below was exercised live through the gateway on 2026-08-07 with real seeded
> tokens - see "Live verification" at the bottom.

## Routes

Legend: **NEW** = added 2026-08-07 in the completion pass.

| Method | Path | Auth | Returns | Verified live |
| --- | --- | --- | --- | --- |
| GET | `/v1/social/feed` | optional* | `PostList` | 200, paged |
| GET | `/v1/social/posts/{post_id}` | optional* | `PostOut` | 200 / 404 — **NEW** |
| POST | `/v1/social/posts` | creator role | `PostOut` | 201, `approved` — **behaviour changed** |
| DELETE | `/v1/social/posts/{post_id}` | author | 204 | 204 / 403 — **NEW** |
| GET | `/v1/social/posts/{post_id}/comments` | required | `CommentList` | 200, paged, **top-level only — behaviour changed 2026-08-08** |
| POST | `/v1/social/posts/{post_id}/comments` | required | `CommentOut` | 201; **takes optional `parent_comment_id` — changed 2026-08-08** |
| GET | `/v1/social/comments/{comment_id}/replies` | required | `CommentList` | 200, paged — **NEW 2026-08-08** |
| DELETE | `/v1/social/posts/{post_id}/comments/{comment_id}` | author | 204 | 204 / 403; **deletes replies too — changed 2026-08-08** |
| POST | `/v1/social/posts/{post_id}/react` | required | `ReactionOut` | 201 |
| DELETE | `/v1/social/posts/{post_id}/react` | required | 204 | 204, idempotent — **NEW** |
| POST | `/v1/social/posts/{post_id}/bookmark` | required | `BookmarkOut` | 201, idempotent — **NEW** |
| DELETE | `/v1/social/posts/{post_id}/bookmark` | required | 204 | 204, idempotent — **NEW** |
| GET | `/v1/social/me/bookmarks` | required | `PostList` | 200 — **NEW** |
| POST | `/v1/social/posts/{post_id}/report` | required | `ReportOut` | 201 — **NEW** |
| POST | `/v1/social/comments/{comment_id}/report` | required | `ReportOut` | 201 — **NEW** |
| GET | `/v1/social/qa` | none | **bare array** | 200 |
| POST | `/v1/social/qa` | required | `QAOut` | 201 |
| POST | `/v1/social/qa/{id}/answer` | doctor/admin | `QAAnswer` | 200 |
| GET | `/v1/social/moderation` | admin roles | reviewer queue | **403 for a doctor token** (correct) |

\* **"optional" is theoretical through the gateway.** `api_gateway` treats only `/v1/auth` and
`/v1/webhooks` as public (`PUBLIC_ROUTE_PREFIXES` in its `main.py`), so a tokenless call to
`/v1/social/feed` is **401 at the gateway** and never reaches the service. The service itself
returns 200 with both viewer flags `false` — confirmed by calling `social_service:8011` directly.
Treat the optional-auth path as defence in depth, not as a shipped anonymous-reader feature.

**Envelope asymmetry is real**: feed is `{items}`, qa is a bare array. Confirmed against the running
service, not inferred. `inbox_service` has the same split, so treat it as a house pattern.

## Schemas

**`PostOut`** - `post_id`, `kind`, `author_user_id?` (**null when `is_anonymous`**), `owned_by_me`, `author_role`, `author_name?`, `title`, `body`,
`excerpt?`, `tags[]`, `is_anonymous`, `moderation_status`, `published_at?`, `created_at`,
`updated_at`, `like_count`, `comment_count`, **`liked_by_me`**, **`bookmarked_by_me`**.

**`PostList`** - `{ items: PostOut[], next_offset: int | null }`.
**`CommentList`** - `{ items: CommentOut[], next_offset: int | null }`.

**`QAOut`** - `question_id`, `author_user_id?` (**null when `is_anonymous`**, which is the DEFAULT), `author_role`, `question`, `is_anonymous`,
`moderation_status`, `answer?`, `answered_by_user_id?`, `answered_at?`, timestamps.

**`CommentOut`** - `comment_id`, `post_id`, `author_user_id`, `author_role`, `author_name?`, `body`,
`moderation_status`, timestamps, **`parent_comment_id?`**, **`reply_to_user_id?`**,
**`reply_to_name?`**, **`reply_count`**.

**`CommentCreate`** - `body` (max 4000), **`parent_comment_id?`** (added 2026-08-08).

**`BookmarkOut`** - `bookmark_id`, `post_id`, `user_id`, `created_at`, `updated_at`.

**`ReportOut`** - `report_id`, `reporter_user_id`, `target_type` (`"post"`|`"comment"`), `target_id`,
`reason`, `note?`, `target_moderation_status` (always `"flagged"` on success), timestamps.

**`PostCreate`** - `title`, `body` (max 10k), `excerpt?`, `tags[]`, `is_anonymous` (default FALSE).
**`QAQuestionCreate`** - `question`, `is_anonymous` (**default TRUE** - health questions).
**`ReactionCreate`** - `reaction_type` (default "like", free text max 32).
**`ReportCreate`** - `reason` (required, max 64), `note?` (max 4000).

**Paging query params** on `/feed`, `/posts/{id}/comments`, `/comments/{id}/replies` and
`/me/bookmarks`: `limit` (default 20, **max 100**, out-of-range is 422) and `offset` (default 0).

---

## 2026-08-07: THE PUBLISH BUG, and what it forced

### The bug
`create_post` wrote `moderation_status='pending'` with `published_at=NULL`. `list_feed` selects
`moderation_status='approved'`. **No route in this service ever set a post to approved.**

So no post created through the API could ever appear in the feed — in a service whose only read
surface *is* the feed. Six of the seven rows in the live database were stranded this way.

**Why no test caught it.** `test_feed_returns_only_approved_posts` flipped the status by hand inside
the test body — performing the exact step no real caller can perform, and then asserting on the
result. The test was green and the feature was dead. There is now
`test_created_post_is_immediately_visible_in_the_feed`, which touches the database only over HTTP.

### The fix: auto-publish, moderation becomes report-driven
`create_post` now sets `moderation_status='approved'` and `published_at=now()`. Moderation runs
**after** publication: a report pulls content back to `flagged`, which removes it from the feed.

**This is a real trade and it should be stated plainly: unreviewed, patient-written health content is
publicly readable the instant it is written.** The alternative shipped state was that nothing was
readable at all, and there was no reviewer route to approve anything, so review-first was not an
option that existed — it was just an outage. If pre-moderation is wanted, it needs an approve route
on `/v1/social/moderation`, and that is a product decision plus a UI, not a flag flip.

### The data migration
`20260807_publish` sets `moderation_status='approved'`, `published_at = created_at` for rows that
were `pending` with `published_at IS NULL` and `kind='blog'`.

- **`published_at = created_at`, not `now()`.** Stamping the migration time would bunch six posts at
  the top of a feed sorted by `published_at` and rewrite their history.
- **`flagged` rows are untouched.** This publishes what was stranded; it does not overturn a
  moderation decision.
- **Downgrade is a deliberate no-op.** Nothing records which rows were touched, so the only
  mechanical undo would un-publish every approved post, including ones published legitimately
  afterwards. Losing the fix on downgrade beats hiding real content.

---

## Gaps and hazards

### HAZARD: one report hides a post
There is **no threshold**. A single call to `POST /posts/{id}/report` sets the target to `flagged`,
which removes it from the feed *and* 404s its deep link. **One malicious or mistaken user can hide
any post or comment in the product** until a moderator restores it.

This is chosen knowingly. On a patient health forum, leaving reported content up while a quorum
accumulates is the worse failure, and `/v1/social/moderation` already surfaces flagged items for a
human. Raising the bar later is a threshold in `create_report` and a `COUNT` — no migration.

**What is missing to make it safe:** there is no *un*-flag route. A moderator can see the flagged
item and cannot restore it through the API; that takes SQL today. That gap is the reason this hazard
matters more than it otherwise would.

### HAZARD: `like_count` counts every reaction type
`ReactionType` has `like`, `love`, `support`, `insightful`, and `like_count` is
`COUNT(post_reactions)` over **all** of them. A post with three "support" reactions and no likes
reports `like_count: 3`. `liked_by_me` is likewise true for *any* reaction the viewer left.

Deliberate — the feed card renders one engagement number and every reaction is engagement — but the
field name promises something narrower than it delivers. Renaming it to `reaction_count` is a
breaking client change and was not taken on unilaterally.

### HAZARD: per-viewer fields make `PostOut` uncacheable by id
`liked_by_me` and `bookmarked_by_me` are computed from the **caller**. Every other field is the same
for everyone. Any cache keyed only on post id — HTTP cache, CDN, a shared react-query key — will
serve one user's like state to another. The client must key on user + post.

### Deletion is HARD, and there is no admin override
`DELETE /posts/{id}` and `DELETE /posts/{id}/comments/{id}` **hard delete**. This service has no
soft-delete column on any table, and adding one here would make `social_posts` deletable two ways
with only one of them honoured by `list_feed`, the moderation queue, and the name-refresh event
consumer. Comments and reactions cascade by FK. `content_reports` deliberately has **no FK**, so the
audit trail outlives the content it reported.

**Author only.** A moderator cannot delete through these routes — flagging is the moderator's tool.

### Ownership failures are 403, never 404
Acting on someone else's post or comment returns **403** with `{"detail": "not the author of this
post"}`. A 404 would tell an author their own content had vanished. `SocialForbidden` exists as a
distinct exception type precisely so the router cannot collapse it into the 404 branch.

Verified live: non-author DELETE → 403, and the post still reads 200 immediately afterwards.

### Pagination is offset-based, and the sort key is not unique
`limit`/`offset` with a server-computed `next_offset`, which is `null` on the last page. The server
proves a next page exists by fetching `limit + 1` rows and discarding the extra — a client that
instead infers "a full page means more" loops forever when the total is an exact multiple of the
limit.

**Offset, not a keyset cursor, and the reason is specific:** the feed's sort key pair
`(published_at, created_at)` **is not unique** — two posts published in the same transaction share
both — so a cursor would need `id` as a tiebreaker and a composite `(published_at, created_at, id) <
(...)` comparison. The known cost of offset paging stands: a row inserted while a reader pages can
shift the window and repeat or skip an item. Comments are less exposed, because they are ordered
oldest-first so new ones land at the end.

### What was explicitly NOT built
Recorded so nobody assumes these are somewhere else in the service:

| Not built | Note |
| --- | --- |
| **Groups / communities** | No table, no route. `CommunityHubScreen` depends on this. |
| **Follow graph** | No table, no route. The Following tab was dropped for this reason. |
| **Mute / hide / block** | No per-viewer suppression of an author or a post. Report is the only lever, and it is global, not personal. |
| **Edit post / edit comment** | Create and delete only. There is no `PATCH`, and no edit history. |
| ~~**Comment threading**~~ | **BUILT 2026-08-08** — two levels, see below. |
| **Share counts** | Nothing records or returns a share. The client's share button is local-only. |
| **Recommendations / ranking** | The feed is strict reverse-chronological. No personalisation, no scoring. |
| **Un-flag / approve route** | See the report hazard above — moderation can flag, and cannot undo. |
| **Bookmark folders / notes** | A bookmark is a bare (post, user) pair. |

### Carried-over hazards, still true
- **`moderation_status`, `kind`, `source`, `reaction_type` and `target_type` are FREE TEXT**, not
  database enums.
- **`is_anonymous` defaults TRUE for questions and FALSE for posts.** Getting that backwards
  deanonymises a patient health question.
- **Author names are snapshots** and go stale unless `user.profile.updated` arrives. A service that
  boots before RabbitMQ silently stops publishing for the life of the process (see below).
- **`/v1/social/moderation` is not wrapped in the client on purpose** — it needs a navigation role
  gate as well as an API one.

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

**VERIFIED END TO END 2026-08-07.** Renamed a seeded doctor via `PATCH /v1/me` and watched the
snapshots follow:

| | before | after |
| --- | --- | --- |
| post | `Kwabena Osei` | `Kwabena Boateng-Osei` |
| comment | `Kwabena Osei` | `Kwabena Boateng-Osei` |

And the anonymity guard holds across a rename — the case that actually matters:

```
 is_anonymous -> author_name
 true         -> <NULL>          <- unchanged by the rename
 false        -> Kwabena Osei
 false        -> Kwabena Osei
```

### Two real faults this shook out
1. **`EventBus(source=...)` does not exist.** The constructor takes the AMQP url positionally. My
   consumer failed to subscribe and logged "names will go stale" — the non-fatal design worked, the
   API served throughout, and the failure was visible rather than silent.
2. **`user_service` had no broker connection.** It starts before RabbitMQ is ready, `connect_failed`
   is swallowed, `app.state.event_bus` stays `None`, and `publish` becomes a silent no-op **for the
   life of the process**. The first rename therefore did nothing, and nothing anywhere said so
   except a startup warning scrolled off the log.

   **That second one is a live operational hazard, not a test artifact.** Any service that boots
   before RabbitMQ silently stops publishing until someone restarts it. There is no reconnect and
   no health signal. Restarting `user_service` after the broker was up is what made the rename
   work. Worth a `depends_on: rabbitmq: condition: service_healthy`, or a reconnecting bus, before
   anyone relies on events in production.

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

### ~~THERE IS NO `GET /v1/social/posts/{id}`~~ SHIPPED 2026-08-07
The screen was written against the react-query cache under `["social", "feed"]`, with an explicit
"open it from Community" dead end for a cold cache — deep link, process restart, eviction.

**`GET /v1/social/posts/{post_id}` now exists** and returns the same shape as a feed row, counts and
per-viewer flags included, precisely so the client can reuse its feed mapper. That makes
`PostDetailScreen` a `useQuery` and **deletes the cold-cache branch**.

`404` for a post that is missing **or not approved**. A flagged post is gone from the feed, and
letting a saved URL still open it would make reporting cosmetic. Note this applies to the author of
a flagged post too: a "your post was hidden" view is a legitimate feature, but it needs its own
route, not a quiet exception in the public read.

**The client change is not done in this pass** — the backend route is live and verified; rewiring
`PostDetailScreen` remains open.

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

---

## Backend completion pass, 2026-08-07 — logic notes per feature

Team rule: document each **logic** and the **API contract**. The contract is the route table and
schemas at the top; this is the reasoning behind each piece.

### Like / unlike
`POST /posts/{id}/react` already existed and upserts (a second call with a different
`reaction_type` mutates the existing row — `post_reactions` is unique on `(post_id, user_id)`).
**Added `DELETE /posts/{id}/react`.**

**Idempotent: a delete with nothing to delete is 204, not 404.** A like button is a toggle over an
unreliable network. 404ing the second tap of a double tap, or a retry after a timeout, reports an
error for the state the user already wanted. The delete is issued as a single `DELETE ... WHERE
post_id AND user_id`; there is no read-then-write, so two concurrent unlikes cannot race.

**`liked_by_me`** is a correlated `EXISTS`, not a `COUNT` and not an outer join — an outer join
against a child table multiplies rows the same way a counting join does. It matches how
`like_count`/`comment_count` were already built. With no viewer it compiles to a SQL literal
`false`, rather than a subquery against a null user id that would work only by accident.

### Bookmarks
New table `post_bookmarks` — id, `post_id` (FK CASCADE, indexed), `user_id` (indexed), timestamps,
unique `(post_id, user_id)`.

**A separate table, not a new `reaction_type`.** A reaction is public and feeds `like_count`; a
bookmark is private and must never appear in anyone else's count. Sharing the table would have made
that distinction a `WHERE` clause somebody eventually forgets.

**`POST` is idempotent and returns the EXISTING row with 201, not 409.** A bookmark is a desired end
state, not an event. Verified live: two calls returned the same `bookmark_id`.

**`GET /me/bookmarks` returns `PostList`** — the same envelope and item shape as the feed,
deliberately, so the client reuses one mapper. Ordered by **when it was saved**, not when the post
was published: it is a reading list, and the thing you just saved belongs at the top even if the
post is old. Filtered to `approved`, so a post reported after you saved it disappears from here too
— a bookmark must not become a private back door to flagged content.

### Reporting
New table `content_reports` — `reporter_user_id`, `target_type` (`post`|`comment`), `target_id`,
`reason`, `note?`, timestamps, unique `(reporter_user_id, target_type, target_id)`.

`ModerationStatus.FLAGGED` existed in the enum and was read by the moderation queue while **nothing
in the service ever wrote it**. This gives it a writer.

**Polymorphic by `(target_type, target_id)` with no foreign key.** Posts and comments hard-delete,
and a report that vanishes with the content it reported is not an audit trail.

**One report flags the item** — see the hazard section above; this is the single most consequential
choice in the pass. **Reporting your own content is allowed**, no special case: "I posted this and
want it down" is legitimate, and the author can already delete outright. **Re-reporting is
idempotent** — the unique constraint means one report per user per item, and a repeat returns the
original rather than 409ing, while still re-asserting `flagged` so a report is never a no-op against
an item a moderator has since restored.

Reporting a **comment** flags it, which drops it from `GET /posts/{id}/comments` *and* from
`comment_count` — both already filter to `approved`, so the list and the number cannot disagree.

### Deleting your own content
See "Deletion is HARD" and "Ownership failures are 403" above. One detail worth stating: the
`post_id` in `DELETE /posts/{post_id}/comments/{comment_id}` is **verified against the comment**, so
a client cannot delete a comment by pairing its id with an unrelated post it happens to have open.
That is a 404.

### Pagination
See "Pagination is offset-based" above for the keyset trade-off. `limit` is bounded at 100 by
FastAPI (`Query(ge=1, le=100)`), so an out-of-range value is a **422 rather than a silently clamped
surprise** — verified live, `limit=500` gives 422. The service layer clamps as well, for callers
that reach it directly.

---

## Live verification, 2026-08-07

Rebuilt `social_service`, restarted it, ran `alembic upgrade head` in the container, then exercised
**every new route through `api_gateway` on :8010 with real seeded bearer tokens**
(`kwabena.osei@medapp.dev` doctor, `yaw.darko@medapp.dev` second doctor, `ama.mensah@medapp.dev`
patient).

**Migrations applied:** `20260807_cauthor` to `20260807_publish` to `20260807_bkmrep` (head).

### The stranded posts, before and after

Before — 6 of 7 pending with no `published_at`:

```
 kind | is_anonymous | moderation_status |         published_at          |       author_name        |       title
 blog | f            | pending           |                               |                          | Counts check
 blog | f            | approved          | 2026-08-07 12:20:19.233685+00 |                          | Counts verified
 blog | f            | pending           |                               | Kwabena Subscriber-Retry | Named
 blog | t            | pending           |                               |                          | Anon
 blog | f            | pending           |                               | Kwabena Subscriber-Retry | Comments list
 blog | f            | pending           |                               | Kwabena Subscriber-Retry | Rename test
 blog | t            | pending           |                               |                          | Anon rename guard
```

After the migration — all 7 approved, all with `published_at`, and every backfilled row has
`published_at = created_at`:

```
 moderation_status | count | with_published_at        still_stranded
 approved          |     7 |                 7                     0
```

### Anonymity held through all of it

```
 is_anonymous | count | with_name
 f            |     9 |         7      <- 2 predate author_name, as expected
 t            |     3 |         0      <- INVARIANT: never a name on an anonymous post
```

### Route-by-route results

| Check | Result |
| --- | --- |
| `POST /posts` | 201, `moderation_status: "approved"`, `published_at` set |
| new post in `GET /feed` immediately | **yes** — the regression is fixed |
| `GET /posts/{id}` | 200, identical shape to the feed row |
| `GET /posts/{unknown}` | 404 |
| `liked_by_me` per viewer | patient `true` / other doctor `false`, `like_count` **1 for both** |
| `DELETE /posts/{id}/react` twice | 204, 204 — idempotent |
| after unlike | `liked_by_me false`, `like_count 0` |
| `POST /posts/{id}/bookmark` twice | 201, 201, **same `bookmark_id`** |
| `GET /me/bookmarks` | 1 item, `bookmarked_by_me: true`; other user's list **0 items** |
| `DELETE /posts/{id}/bookmark` twice | 204, 204 |
| `POST /posts/{id}/report` | 201, `target_moderation_status: "flagged"` |
| post in feed before / after report | `True` / `False` |
| deep link to reported post | **404** — reporting is not cosmetic |
| repeat report | 201, same `report_id` |
| `POST /comments/{id}/report` | 201; `comment_count` 1 to 0, comment list 1 to 0 items |
| `DELETE /posts/{id}` as non-author | **403** `{"detail":"not the author of this post"}`, post still 200 |
| `DELETE /posts/{id}` as author | 204, then 404 |
| `DELETE .../comments/{id}` non-author / author | **403** / 204 |
| `GET /feed?limit=2` | 2 items, `next_offset: 2` |
| `GET /feed?limit=100` | 10 items, **`next_offset: null`** |
| `GET /feed?limit=500` | **422** |
| anonymous post via API | `is_anonymous true`, `author_name None` |
| tokenless `GET /feed` at the gateway | **401** (gateway gate) |
| tokenless `GET /feed` direct to :8011 | 200, both viewer flags `false` |
| `GET /moderation` with a doctor token | **403** — role gate holds |

**Tests:** `backend/services/social_service/tests` — **24 passed**.

### Two things this pass shook out that were not on the list

1. **`tests/conftest.py` overrode only `get_current_principal`.** The new feed dependency is
   `get_optional_principal`, and the fixtures send no `Authorization` header — so `liked_by_me` came
   back `false` for a user who had just liked the post, in an otherwise green suite. Both
   dependencies are now overridden, and a separate `anonymous_client` fixture (only `get_db`
   overridden) exercises the genuinely tokenless path for real. **This is the same class of failure
   as the `like_count: 0` bug**: a per-viewer flag stuck off is indistinguishable from a truthful
   answer, so only a two-user test can catch it.

2. **`docker compose` must be invoked with BOTH compose files.** Running
   `docker compose up -d social_service` from `infra/docker` with only `docker-compose.yml` made
   Compose treat the running containers as config-drifted and **recreate postgres** — which
   published `5432` instead of the override's `5442`, and another project's container on this
   machine took the port in the gap, leaving the database down. Data survived (named volume
   `medapp_pgdata`), and the correct invocation is the one `docker-compose.ports.yml` documents in
   its own header:

   ```
   docker compose -f infra/docker/docker-compose.yml \
                  -f infra/docker/docker-compose.ports.yml up -d <services>
   ```

   Worth pinning via `COMPOSE_FILE` in the repo `.env`; the failure mode is a recreated database
   container, which is not what "I forgot a `-f`" sounds like it should cost.


---

# Threaded comment replies — 2026-08-08

Migration **`20260808_replies`** (head, `down_revision = 20260807_bkmrep`). Applied live and
exercised end to end through `api_gateway` on :8010 — see "Live verification" at the bottom of this
section.

## The contract

| Method | Path | Body / params | Returns |
| --- | --- | --- | --- |
| POST | `/v1/social/posts/{post_id}/comments` | `{body, parent_comment_id?}` | `CommentOut`, 201 |
| GET | `/v1/social/posts/{post_id}/comments` | `limit`, `offset` | `CommentList` — **top-level only** |
| GET | `/v1/social/comments/{comment_id}/replies` | `limit`, `offset` | `CommentList` — replies of one parent |
| DELETE | `/v1/social/posts/{post_id}/comments/{comment_id}` | — | 204; **replies go with it** |

No new endpoint duplicates an old one: the comment routes were extended, and only the replies read
is new. It sits at `/comments/{id}/...`, next to the `POST /comments/{id}/report` that was already
there, rather than under `/posts/{post_id}/...` — a comment id is globally unique here and a second
path segment the caller must keep consistent buys no integrity.

### `CommentOut`, the four new fields

| Field | Type | Meaning |
| --- | --- | --- |
| `parent_comment_id` | `UUID \| null` | `null` = top-level. Set = a reply, and **always a top-level id**. |
| `reply_to_user_id` | `UUID \| null` | Author of the comment actually answered. |
| `reply_to_name` | `string \| null` | That author's name, for the `@name` prefix. **Null means render no prefix.** |
| `reply_count` | `int` | Approved replies under this comment. Always `0` on a reply. |

`CommentCreate` gains `parent_comment_id?`. Absent or `null` → a top-level comment.

### Columns added to `post_comments`

```
parent_comment_id  uuid          NULL  FK -> post_comments(id) ON DELETE CASCADE, indexed
reply_to_user_id   uuid          NULL  indexed
reply_to_name      varchar(255)  NULL
```

All nullable, no backfill: every pre-existing comment is top-level, and `parent_comment_id IS NULL`
is exactly how the read path spells that. The NULL is the answer, not a gap.

The migration also **re-asserts `server_default now()` on `post_comments.created_at`/`updated_at`**,
idempotently. It creates no table and so introduces no timestamp column, but omitting that default
is the single most repeated defect in this repo — it has 500d `POST /posts/{id}/comments` in
production before (see `20260807_ts`) and no test can catch it, because the suite builds its schema
from model metadata, which has the default. One statement closes the door on this table. Verified
live: `\d post_comments` shows `now()` on both.

## The one-level rule, and why it is server-side

**A thread is exactly two levels deep. Never three.**

- A reply attaches to a top-level comment.
- A reply to a *reply* attaches to **that reply's own parent** — same thread, same depth.
- Therefore `parent_comment_id` always points at a row whose own `parent_comment_id` is `NULL`.

`create_comment` does the re-pointing: `parent_comment_id = target.parent_comment_id or target.id`.
**The `parent_comment_id` on the response is therefore not always the one that was sent.** That is
the contract, not a surprise: the client sends who it is replying to and the server decides where
the row lives.

**Why enforced in the service layer and not in the client.** This is a data invariant, and an
invariant a client can decline to apply is not an invariant. There will be more than one client —
mobile today, web and any integration later — each free to be old, buggy or hostile, and one of them
passing a reply's id through would put a row in the table that every reader afterwards (the
top-level list, `reply_count`, the replies route) has to cope with forever. A bad client should
produce a bad request, never a bad row.

**Why two levels and not N.** Product: unbounded nesting is what makes a comment thread unreadable
on a phone — indentation runs out of screen and the reader loses the argument. TikTok, which is the
model the PO asked for, does exactly this. Engineering: it also makes every query non-recursive.
`reply_count` is one correlated subquery, the replies route is one `WHERE`, and deleting a parent
reaches every descendant in a single statement. A recursive CTE and a depth guard are things this
service now never needs.

**Then why keep `reply_to_user_id`/`reply_to_name` at all?** Because flattening the structure must
not flatten *who was addressed*. When you reply to a reply, the parent is the top-level comment
while the person you answered is a sibling at the same depth — the parent link cannot express that,
so the answered author is recorded separately. This is exactly the case TikTok renders as an "@name"
prefix. Verified live: a reply-to-a-reply came back with `parent_comment_id` = the top-level
comment and `reply_to_name` = the sibling's author.

**Cross-post parents are 404.** The parent is checked against the post in the path, the same way
`DELETE .../comments/{id}` checks its own, so a reply cannot be smuggled onto a thread it does not
belong to.

## `reply_count`: a subquery, deliberately not a column

Computed as a **correlated scalar subquery** over `post_comments`, exactly like `like_count` and
`comment_count` on `PostOut` — not a join with `GROUP BY` (which multiplies rows) and not a per-row
query (the N+1 the pattern exists to avoid).

**No stored counter column, and that is a hard call rather than a preference.** A counter needs a
writer on insert, on delete, on report, and on any future un-report path. This service has no
counter column on any table, and a counter with a missing writer is a documented failure mode here:
it drifts silently and reads as a perfectly plausible number. A subquery cannot drift — it is
recomputed from the rows themselves.

**Approved only, matching `GET /comments/{id}/replies` exactly.** The count and the list are the
same predicate, so "View 3 replies" can never open onto two. Verified live: reporting one of two
replies moved `reply_count` 2 → 1 and the list from two items to one, in the same breath.

`reply_count` is `0` on a reply. Not a default standing in for an unknown — the one-level rule means
a reply can never have children. It is still *computed* rather than hardcoded, so if the rule were
ever loosened the number would tell the truth rather than a stale constant.

### `comment_count` on the post counts replies; the top-level list does not

These two numbers are allowed to disagree and it is intentional:

| Number | Counts |
| --- | --- |
| `PostOut.comment_count` | **all** approved comments on the post, replies included |
| items in `GET /posts/{id}/comments` | top-level only |
| `CommentOut.reply_count` | approved replies under that one comment |

The feed card shows one number for "how much discussion is on this post", and a reply is discussion.
Verified live: 1 top-level + 2 replies gave `comment_count: 3` and a one-item top-level list.

**This is a contract change for any caller written before 2026-08-08.** A thread with 4 top-level
comments and 6 replies used to return 10 items from `GET /posts/{id}/comments` and now returns 4.
Nothing in `frontend/mobile/MedAPP` consumes it yet (`PostDetailScreen` is written but not rewired,
see above), so no client breaks today — but a client written against the old shape would silently
lose the replies rather than error.

## Replies are fetched per parent, on demand

`GET /v1/social/comments/{comment_id}/replies`, `limit` (default 20, max 100) / `offset`, with the
server-computed `next_offset` that is `null` on the last page — the same envelope, the same bounds
and the same oldest-first ordering as the top-level list, so the client reuses one pager and one
mapper.

**Not inlined into the top-level list.** Inlining would make a page of 20 mean an unbounded number
of rows, would nest reply pagination inside an item of an already paginated list, and would download
an entire argument nobody asked to read. `reply_count` is all "View 3 replies" needs.

**Passing a *reply's* id returns the thread it belongs to**, not an empty list. Read mirrors write:
an id at depth 2 resolves to the depth-1 row above it, on both paths. An empty list would be a wrong
answer that looks exactly like a right one ("this reply has no replies"), and that class of silent
default has already cost this service two shipped bugs (`like_count: 0`, `liked_by_me: false`).

**Unknown comment → 404**, never an empty array. "No replies yet" and "no such comment" are
different answers and must not look the same.

## Delete a parent: CASCADE, not a tombstone

**Decision: deleting a comment deletes its replies.** Hard, unrecoverable, no tombstone row and no
"[deleted]" placeholder.

**Why.** A tombstone means a soft-delete flag, and this service has **no soft-delete column on any
table**. Adding the first one here would make `post_comments` deletable two ways with only one of
them honoured by `list_comments`, `comment_count`, `reply_count`, the moderation queue and the
`user.profile.updated` consumer — five readers, each a chance to forget. A flag some readers respect
and others do not is the shape of every bug this service has already shipped, and the deletion
section above records why the same reasoning kept `social_posts` hard-deleting.

**The cost, stated rather than buried: deleting your own comment removes replies other people
wrote.** That is a real loss and the honest alternative was worse. The two mitigations that make it
tolerable are that the author's delete right is already absolute here (there is no admin override —
flagging is the moderator's tool), and that a two-level thread bounds the blast radius to one
comment's direct replies rather than an arbitrary subtree.

**The children are deleted EXPLICITLY in the service layer even though the FK says `ON DELETE
CASCADE`.** SQLite — the test engine — has foreign key enforcement **off by default**, so relying on
the constraint alone would have the suite prove orphans are fine while Postgres cascades. One
statement, identical behaviour on both engines. The FK stays as the backstop for deletes that do not
go through this function (a post cascade, a DBA). Verified live in Postgres: after deleting a parent
with two replies, `comment_count` fell by 3, and a table-wide query returned **0 orphans and 0
depth-3 rows**.

**Downgrade does not delete anything.** Dropping `parent_comment_id` turns replies back into
top-level comments — lossy but visible. Silently deleting other people's writing to undo a schema
change is not a trade this service makes.

## Anonymity: `reply_to_name` copies a null, it never resolves one

**Decision: `reply_to_name` is copied verbatim from the target comment's already-stored
`author_name`, and is never re-resolved from user_service. Null in, null out.**

`author_name IS NULL` is how this whole service spells "this author is not to be named". An
anonymous post never has a name written to its row at all — absent, not present-and-filtered,
because a name that exists in a table is one a future query, export, admin screen or log line can
leak. The rename consumer honours the same rule, refusing to write a name into a null.

A reply is where that invariant could have been broken, and the break would have been nasty: if the
reply looked the target's name up instead of copying it, replying to un-named content would **mint
the very name that anonymity depends on not existing** — and it would then live on a *different
row*, one that no anonymity filter anywhere in this service inspects. `_reply_to_name()` in the
service layer is one function precisely so there is one place to audit that.

**A null `reply_to_name` collapses two states on purpose** — "anonymous" and "the write-time lookup
failed" — because both mean the same thing to the renderer: *we cannot name this person*.

**The client must render NO `@` prefix when `reply_to_name` is null. It must never substitute
`reply_to_user_id`.** A UUID in an `@` prefix is worse than no prefix, and against content whose
author chose not to be named it is a deanonymisation outright. Same rule as the byline table above.

Verified live: a comment with `author_name = NULL` was replied to through the gateway, and the reply
came back — and was stored — with `reply_to_name: null`.

**`reply_to_user_id` IS returned.** It is no more revealing than the `author_user_id` that
`CommentOut` has always carried on the parent row itself, and the client needs it to link a mention.
Comments have no anonymous mode, so there is no case where this id is a secret the parent row was
keeping. **See the hazard below — that is not true of posts.**

### The rename consumer now refreshes `reply_to_name` too

`reply_to_name` is a **second snapshot of the same identity, on a different row** — every reply
rendering "@Kwabena" holds its own copy. Refreshing only `author_name` would leave a renamed user
correctly named on everything they wrote and **deadnamed on every reply addressed to them**: the
exact harm the consumer exists to prevent, one column over. `user.profile.updated` now updates both,
each under the same `IS NOT NULL` guard.

## A flagged parent does not silently hide its replies

`GET /comments/{id}/replies` requires the parent to **exist** (404 otherwise) but **does not consult
its moderation status**. A flagged parent still serves its replies.

**Why.** A report against a parent is not a report against the replies — those are other people's
words, unreported, and hiding them punishes them for a stranger's action. That matters more here
than it would elsewhere, because in this service **one report is enough to flag anything, with no
threshold and no un-flag route** (see the hazard above). And nothing flagged is disclosed by
serving them: this route returns the **children**; the flagged parent's own body is never in the
response, and it is already gone from `list_comments` and from `comment_count`.

**The honest consequence.** A flagged parent disappears from the top-level list, so its replies are
only reachable by a caller that already holds the parent id. **The thread is removed whole rather
than quietly rewritten to look shorter than it is** — which is the misrepresentation worth avoiding.
The count a client last saw is the count this route still returns.

Verified live: a reported parent vanished from `GET /posts/{id}/comments` while
`GET /comments/{parent}/replies` continued to return its one approved reply.

## What was NOT built

| Not built | Note |
| --- | --- |
| **Three or more levels** | The point. `parent_comment_id` always names a top-level row. |
| **Reply notifications** | Nothing tells you someone answered you. `reply_to_user_id` is the field an inbox integration would key on; no event is published. |
| **Reactions on comments** | `post_reactions` is FK'd to `social_posts`. There is no comment like, and so no way to sort replies by anything but time. |
| **"Top replies" / ranked ordering** | Strictly oldest-first, like the top-level list. No scoring. |
| **Reply-count on the post** | `comment_count` is a single total. There is no separate top-level-vs-reply breakdown on `PostOut`. |
| **Editing a reply** | Comments still have no `PATCH`. Create and delete only. |
| **Anonymous comments** | Unchanged and still deliberate — see the frame `1066:2025` ruling above. The anonymity work here is about not *leaking* a null, not about adding a mode. |
| **Client wiring** | `frontend/mobile/MedAPP` is untouched by this pass. `PostDetailScreen` was already un-rewired and still is. |

## Live verification, 2026-08-08

Rebuilt `social_service`, ran `alembic upgrade head` in the container
(`20260807_bkmrep` → **`20260808_replies` (head)**, confirmed with `alembic current`), then
exercised every new and changed route through `api_gateway` on :8010 with real seeded bearer tokens
(`kwabena.osei@medapp.dev` and `yaw.darko@medapp.dev` doctors, `ama.mensah@medapp.dev` patient).

| Check | Result |
| --- | --- |
| `POST .../comments` with no parent | 201, `parent_comment_id: null`, `reply_count: 0` |
| `POST .../comments` with a top-level parent | 201, `parent_comment_id` = that parent, `reply_to_name: "Ama Mensah"` |
| `POST .../comments` with **a reply** as parent | 201, `parent_comment_id` = **the top-level id, not the reply** |
| ...and who was answered | `reply_to_name` = the **sibling's** author, not the parent's |
| `GET /posts/{id}/comments` | **1 item** (the top-level), `reply_count: 2` |
| `PostOut.comment_count` on the same post | **3** — replies counted, by design |
| `GET /comments/{id}/replies` | 2 items, oldest first, `next_offset: null` |
| `?limit=1` / `?limit=1&offset=1` | `next_offset: 1` then **`null`** |
| `?limit=500` | **422** |
| `GET /comments/{a_reply_id}/replies` | byte-identical to the parent's thread |
| `POST /comments/{reply}/report` | 201 `flagged`; `reply_count` 2 → 1, list 2 → 1 items |
| replies of a **flagged parent** | **200**, still served |
| top-level list with a flagged parent | thread removed whole, `items: []` |
| `DELETE .../comments/{someone else's reply}` | **403** `{"detail":"not the author of this comment"}`, reply still listed |
| parent id from **another post** | **404** `{"detail":"parent comment not found"}` |
| `GET /comments/{unknown}/replies` | **404** `{"detail":"comment not found"}` |
| reply to a parent with `author_name = NULL` | 201, **`reply_to_name: null`** on the wire *and* in Postgres |
| `DELETE` a parent with 2 replies | 204; `comment_count` 4 → 2, replies gone, `/replies` → 404 |
| `DELETE` a reply | 204; parent survives, `reply_count` back to 0 |

Postgres, table-wide after the run:

```
 orphans | depth_3_rows
       0 |            0
```

```
\d post_comments
 created_at        | timestamp with time zone | not null | now()
 updated_at        | timestamp with time zone | not null | now()
 parent_comment_id | uuid                     |          |
 reply_to_user_id  | uuid                     |          |
 reply_to_name     | character varying(255)   |          |
Foreign-key constraints:
    "fk_post_comments_parent_comment_id" FOREIGN KEY (parent_comment_id)
        REFERENCES post_comments(id) ON DELETE CASCADE
```

**Tests:** `backend/services/social_service/tests` — **36 passed** (24 existing, 12 new).

## RESOLVED 2026-08-08 — the anonymous author id is no longer returned

`author_user_id` is now **null whenever `is_anonymous` is true**, on `PostOut` and on `QAOut`.
One helper, `_anonymised_author_id(row)`, is applied at all three build sites, and the two
hand-written QA dicts were collapsed into a single `_qa_out()` — the duplication is how the leak
survived in both copies at once, and is exactly what `_post_out`'s own docstring warns about.

**This required a second change, and shipping the first without it would have been a regression.**
`isOwnPost` decided ownership by comparing `authorUserId` to the viewer, which is how the author of
an anonymous post got a Delete affordance. Withhold the id and that comparison silently fails for
the one person entitled to delete. So `PostOut` gained **`owned_by_me`**, computed server-side in
`_attach_engagement` from the viewer — the same per-viewer pattern as `liked_by_me`. The client now
gates Delete on that boolean, and the id never has to leave the database.

`owned_by_me` defaults **false** on `create_post`, which returns a row with no per-viewer columns.
False is the safe direction: it hides a Delete the author is entitled to for one render, rather than
offering one they are not.

**Contract change.** `PostOut.author_user_id` and `QAOut.author_user_id` are now nullable, and
`PostOut` has a new `owned_by_me: bool`. `CommentOut.author_user_id` is unchanged and non-null —
comments have no anonymous mode. A client that compares ids to decide ownership must move to
`owned_by_me`; `frontend/mobile/MedAPP/src/features/community/api.ts` has.

Moderation is unaffected: `list_moderation_queue` reads ORM rows, not these shapes.

Covered both directions in `tests/test_social.py` — anonymous post and question return no id,
attributed ones still do, and the author of an anonymous post can still delete it while another user
gets 403.

### The original finding, kept for the reasoning

**`PostOut` returned `author_user_id` on an anonymous post.** `_post_out` in `routers/social.py`
includes it unconditionally, alongside `is_anonymous: true`. The byline rules above tell the *client*
never to print `authorUserId` — but the API hands it over anyway, next to a flag announcing that
this row is the one where identity was supposed to be withheld.

The database invariant holds (`author_name` really is absent), so this is not a name leak. It is a
**stable pseudonymous identifier**, and the correlation is trivial: the same user id appears on
their non-anonymous posts and on every comment they write, where `author_name` **is** populated. Two
rows and a join, both from ordinary API responses, deanonymise any anonymous post. The same applies
to `SocialQuestion` / `QAOut`, where `is_anonymous` defaults **true** — health questions, the most
sensitive content in the service.

Not fixed in this pass, because nulling it is a breaking change to a field four routes return and
`liked_by_me`-style per-viewer logic may rely on it client-side; that needs its own decision. The
fix is to omit `author_user_id` when `is_anonymous` — in `_post_out` and in the QA builders — and it
is one place each, because both already funnel through a single dict.
