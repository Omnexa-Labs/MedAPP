# API contract - `notification_service`

**Prefixes:** `/v1/me` (inbox, preferences) and `/v1/notifications`
**Source:** `backend/services/notification_service/app/schemas/`
**Client:** `frontend/mobile/MedAPP/src/features/notifications/api.ts`

> No new endpoints created; the gateway already routed `/v1/me/inbox` and `/v1/me/preferences`.

## Routes

| Method | Path | Returns | Verified live |
| --- | --- | --- | --- |
| GET | `/v1/me/inbox` | `InboxList` - `{items}` | 200 |
| GET | `/v1/me/preferences` | `NotificationPreferenceOut` | 200 |
| PUT | `/v1/me/preferences` | `NotificationPreferenceOut` | 200, persisted |
| POST | `/v1/notifications/send` | `NotificationDeliveryOut` | service-to-service |
| GET | `/v1/notifications` | - | **404 through the gateway**, with and without a trailing slash |

`/v1/me/inbox` and `/v1/me/preferences` are longer prefixes than `/v1/me`, so they resolve to this
service rather than user_service. That is the same shadowing that broke `/v1/me/lab` - the entries
happened to already exist here.

## Schemas

**`InboxMessageOut`** - `delivery_id`, `event_id`, `event_type`, `title`, `body`, `channel`,
`status`, `delivered_at?`.

**`NotificationPreferenceOut`** - `preference_id`, `user_id`, `locale`, `push_enabled`,
`sms_enabled`, `email_enabled`, `in_app_enabled`.

**`SendNotificationIn`** - `event_id`, `recipient_user_id`, `event_type`, `title`, `body`,
`channels[]`, `locale`, `actor_user_id?`.

## Gaps and hazards

- **PUT REPLACES THE WHOLE OBJECT.** Every flag defaults to `true` in the schema, so a partial
  update silently RE-ENABLES a channel the user switched off. Read, spread, then write. The client
  requires all five fields for this reason.
- **A new user is opted IN to push, SMS, email and in-app.** `GET /preferences` creates the row on
  first read with everything enabled, so there is no "unset" state - but the default is
  opt-out-later rather than opt-in. That is a consent question for the PO, not a client detail, and
  in a health product it deserves an explicit answer.
- **`delivery_id` is not the event.** Several deliveries of one happening (push AND in-app) share
  `event_id`. A bell showing one row per delivery will double-count; de-duplicate on `event_id`.
- **`delivered_at` is null while queued or failed**, not merely old. Sorting by it silently drops
  undelivered notices to the bottom.
- **`status` and `event_type` are free text**, not enums.
- **`POST /send` takes `recipient_user_id`** and is deliberately NOT wrapped in the client: it is
  how one SERVICE asks this one to notify a user, and a client method would be a way to send a
  notification to someone else from a phone.
- **No pagination** on the inbox, and no unread/read state at all - nothing marks a notification
  seen, so a bell badge cannot be built from this contract today.

## Wiring status

| Screen | State |
| --- | --- |
| Client (`features/notifications/api.ts`) | Written; inbox, get and put preferences all verified live. |
| Notification bell / list screen | **Not wired** - no notifications screen exists in the app. |
| Settings > notification toggles | **Not wired** - the Settings page ships Appearance and Sign out only. |

The client is ready. Both consumers need design first: there is no notifications screen, and the
Settings page has no notifications section (deliberately - see docs/PIPELINE.md 5y, rows were not
invented for preferences that had no backing).
