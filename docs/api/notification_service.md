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
| Notification bell / list screen | **Designed 2026-08-07** (`1073:1433`, dark proof `1074:17968`, page 548:615). Not built. |
| Settings > notification toggles | **Not wired** - the Settings page ships Appearance and Sign out only. |

The client is ready. Both consumers need design first: there is no notifications screen, and the
Settings page has no notifications section (deliberately - see docs/PIPELINE.md 5y, rows were not
invented for preferences that had no backing).

---

## Screen designed 2026-08-07

`notifications — inbox` `1073:1433`, dark proof `1074:17968`, page `548:615` (Messaging).
Measured: light 242.9 mean / 94.9% light, dark 37.5 / 91.8% dark, colours 619 -> 562.

### Designed to the contract, not past it
- **NO unread badge or read/unread styling.** The API has no read state at all - nothing marks a
  notification seen - so an unread dot would be a promise the backend cannot keep, and a bell badge
  cannot be built from this contract today. That is the single biggest thing to add server-side if
  the bell is meant to count anything.
- **A queued row says "Sending..." instead of a time.** `delivered_at` is NULL while queued or
  failed, and inventing a timestamp there would state something untrue about whether the patient
  was actually told.
- Day grouping is Today / Earlier, which needs only `delivered_at`.

### FLAGGED - glyph contrast on the appointment tile
The `icon/calendar` instance reads as nearly invisible on `primary-container`: its own fill is dark
and the tone behind it is dark in light mode. `icon/chrome-mail` on the same tone is fine (light
glyph), so this is per-icon, not per-tile. Either the calendar glyph needs an `on-primary-container`
fill binding or the tile needs a lighter tone. Recorded rather than patched blind - the icons are
shared components and changing one affects every screen that uses it.

### Not designed
Swipe-to-dismiss, mark-all-read, and per-notification actions. None has an endpoint: there is no
read state, no delete, and no action payload on `InboxMessageOut`.
