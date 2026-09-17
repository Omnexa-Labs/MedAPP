# Medication schedule revisions and reminders

Implemented in source on 2026-09-17 for B08/B09. This extends [patient medication tracking](MEDICATION_TRACKING.md). It is not reference-screen or production delivery acceptance. See [the validation baseline](COMPLETION_BASELINE.md) for executed checks and pending PostgreSQL/device checks.

## Future plans

`POST /v1/patients/{patient_user_id}/medications/{course_id}/schedule` accepts `{version, effective_date, end_date, daily_times, reason}` with the existing UUID `Idempotency-Key`. Patient ownership, optimistic versions, atomic receipts and retained activity apply as for other tracking writes.

- The effective date must be tomorrow or later **in the course's saved IANA timezone**, on/after the original start, and within 365 days. End date is optional; when supplied it must be on/after the effective date and within the original technical ten-year range. These are application limits, not prescribing rules.
- Up to twelve unique `HH:MM` times; an empty list switches future tracking to manual entries. The medicine snapshot, clinical directions, original start and timezone remain fixed. This version does not support timezone changes or backdated schedule corrections.
- Original plan columns remain unchanged. `schedule_changes` retains effective revisions. A new edit replaces the one pending revision; its previous values remain in `schedule_changed` activity. Up to 100 effective revisions are supported. Patients can replace a pending change with the current times/end date to retain their current plan.
- Course detail/list resolves today's plan. The tracker resolves the selected day. Retrospective dose writes validate against that day's plan, including when a course changed between manual and scheduled tracking. Existing dose slots, timestamps, outcomes and corrections never move.
- Active/paused courses may revise a plan; stopped/completed courses must resume first. Withdrawn prescriptions cannot get a new tracking plan. A future extension can leave an inactive interval after the old end date; it does not invent doses for that interval.
- Daylight-saving rules remain: nonexistent local time produces no slot; the repeated fall-back hour uses its first occurrence once.

## Saved opt-in and device registration

All endpoints below share the medication base path, patient-only ownership, and `Cache-Control: no-store`.

| Endpoint | Behavior |
| --- | --- |
| `POST /{course_id}/reminders` | `{version, enabled}` and UUID request key. Saved course preference, initially off; enabling requires active tracking and a current source prescription. It does not request OS permission or assert delivery. |
| `GET /reminder-capability` | Whether this deployment has enabled medication push. This flag is not a worker health or delivery check. |
| `POST /reminder-devices` | `{binding_id, push_token}` after explicit native opt-in and OS permission. Returns owner, binding, enabled state and expiry, never the token. Max five active devices per patient. |
| `POST /reminder-devices/{binding_id}/disable` | Disables only matching bindings belonging to the current patient; safe to repeat. |
| `GET /{course_id}/reminder-history` | Paged attempt time, state and sanitized error code. Default 25, max 50; `offset` / `next_offset`. Provider references and tokens are private. |

The mobile detail screen separates saved course preference from device registration. It requests OS permission only after the patient chooses **Enable or check this device**. Web and unconfigured native builds explain unavailability. A persisted installation binding allows a lost registration response to be retried and renewed on foreground/token rotation without prompting again. API calls capture the originating credential and have a 15-second abort timeout; late account responses cannot confirm a new account's device.

Device registration lasts seven days and renews when an opted-in patient opens the app. Disabling OS permission suppresses registration on the next foreground check. Signing out, switching account or explicitly locking sends a best-effort disable using the old credential, removes local opt-in and dismisses presented medication notifications. A new account registering the same push token replaces its former ownership; delayed old-binding disables cannot disable the new binding. After sign-out/lock, re-enable the device explicitly. Offline sign-out or an expired access token can prevent server revocation; generic notifications may continue until the seven-day registration expires. The app does not claim guaranteed remote revocation while offline.

## Delivery and cancellation

The dedicated EHR worker `python -m app.workers.medication_reminders` evaluates saved plans every 15 seconds. It does not use the older notification service's simulated `SENT` records and does not schedule repeating alarms on the phone.

It considers slots due within the previous five minutes, after reminder opt-in, registration/renewal and the latest resume. It requires current active tracking, a non-withdrawn source prescription, an active/unexpired device and no existing dose entry (including a voided entry). Paused/stopped/completed courses, elapsed end dates, manual periods, opt-out and withdrawal suppress sends. Resume does not catch up reminders from before the pause. Editing a future plan naturally changes the slots considered on its effective date.

An attempt is committed before contacting Expo and uniquely identifies course/device/scheduled instant. The worker reloads authoritative state under the patient's lock before sending, then locks the device in the same order used by writes. This also avoids loading a stale course into the session before acquiring the patient lock. A cancellation committed before dispatch suppresses it; a cancellation that races with an already-dispatching send waits for its bounded HTTP call (10-second phase timeouts). Already-submitted notifications cannot be recalled. Expo receives a 60-second TTL to reduce late delivery.

The notification contains only **MedApp reminder**, a generic instruction to open the tracker, and `{kind: "medication_reminder"}`. It contains no medicine, dose, patient identifier, prescription or external URL. Tapping opens the signed-in account's tracker; it never marks a dose taken. Foreground alerts are suppressed when signed out. Existing generic alerts can still appear in the OS background during an offline revocation gap.

Attempt states are `accepted` (valid Expo ticket), `rejected`, `suppressed`, or `unconfirmed`. **Accepted does not mean arrived on a phone.** HTTP ambiguity, a crash after committing an attempt, or a lost provider response is not automatically resent: avoiding duplicate dose prompts is prioritized over guaranteed reminder delivery. `DeviceNotRegistered` disables the token. Expo receipt polling, proactive operator alerting and guaranteed delivery are not implemented. Provider/native integration tests use doubles, not a real device.

## Deployment setup

Android is the selected first phone target. Follow [mobile build setup](MOBILE_BUILD_SETUP.md)
for the prepared EAS profiles, configuration checks and device acceptance record.

1. First run the pending isolated PostgreSQL migration/concurrency suite described below. Apply EHR migration **`20260917_0007`** after `20260916_0006` only after those checks pass. The migration defaults existing courses to no revisions/reminders off. Downgrade refuses to discard reminder devices, revised schedules, reminder events or command receipts using the new course response shape, including an on/off preference reverted to off. Do not reset a retained database to bypass that guard.
2. Install the mobile lockfile (`npm ci`). This change adds Expo SDK 55 `expo-notifications ~55.0.27` and its config plugin. A native rebuild is required. The external verification runtime has the dependency installed; no native build was produced in this milestone.
3. Link the intended EAS project and supply its public UUID as `EAS_PROJECT_ID` when building. For Android, supply the correct Firebase configuration path as `ANDROID_GOOGLE_SERVICES_FILE` and configure FCM v1 credentials for that app in EAS. Configure the matching Apple app and APNs push credentials for iOS. Keep private provider credentials in the secret store/EAS, not the repo or `EXPO_PUBLIC_*` values. Follow the [Expo SDK 55 notifications reference](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/) and [official push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).
4. Configure Expo enhanced push security for the project if used; supply the corresponding server-only `EHR_EXPO_ACCESS_TOKEN`. Set `EHR_MEDICATION_PUSH_ENABLED=true` for **both** the EHR API and the reminder worker after configuration. It defaults false. Use the Compose `ehr_medication_reminders` service or a supervised equivalent against the same EHR database. Do not scale until the PostgreSQL concurrency check passes.
5. Use a physical Android/iOS device running the configured development or production build. With a synthetic patient, create an active scheduled course, turn reminders on, enable the device and choose a future due time. Verify foreground/background delivery and tap navigation, compare attempt history, then test denial, opt-out, pause/resume, completion, source-prescription withdrawal, account switch, app restart, expiry and token changes. Repeat DST/timezone cases against the authoritative tracker.

The HTTP/PostgreSQL suite now includes concurrent schedule/preference writes, reopening persisted plans, legacy-course migration round trips and two reminder workers competing for the same due slot with a fake sender:

```powershell
./backend/integration_tests/run-hospital-qa.ps1 -Suite pharmacy
```

Its new image tag is `medapp-hospital-qa:reminders-20260917`. **The image was not built and the new suite did not execute in this milestone:** Docker Desktop failed on `sailor-ingest.sock`; automatic approval review rejected its targeted restart/cleanup as blocked by policy. Do not use the earlier medication milestone's PostgreSQL result as evidence for these new changes. Preview startup was also previously blocked by automatic approval review. Browser, physical-device and reference acceptance remain pending.
