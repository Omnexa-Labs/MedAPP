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
| author display name | NO - only `author_user_id` (a UUID) |
| author avatar | NO |
| like count | NO - reactions are write-only; there is no aggregate |
| comment count | NO - comments are write-only; there is no count or list route |
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
