# MedApp Backend API Contract

This document is the frontend-facing contract for the backend services. It groups endpoints by service and gives a short description of what each endpoint is for.

All services follow the `/v1/...` convention. The API gateway is the public entry point; the services below are the routed backend surfaces behind it.

Backend service map:

- Gateway routes `/v1/wearables` to the wearable sync service.
- Wearable samples are normalized by the wearable sync service and written into the EHR vitals timeline.
- The vitals watcher agent consumes the resulting vitals stream; it is not a direct frontend API.

## API Gateway

Base route: `/`

- `GET /healthz` — health check for the gateway.
- `/{any}` — routes requests to the correct backend service based on the `/v1/...` prefix.

## User Service

Base route: `/v1`

Auth and account access:

- `POST /auth/signup` — create a new user account.
- `POST /auth/login` — sign in and receive access and refresh tokens.
- `POST /auth/refresh` — rotate a refresh token and issue a new token pair.
- `POST /auth/logout` — revoke a refresh token.
- `POST /auth/otp/start` — send an OTP for login or verification.
- `POST /auth/otp/verify` — verify an OTP and log the user in.
- `POST /auth/password/forgot` — start a password reset flow.
- `POST /auth/password/reset` — complete a password reset.
- `POST /auth/password/change` — change the current password.

Profile and identity:

- `GET /me` — read the authenticated user profile.
- `PATCH /me` — update the authenticated user profile.
- `POST /me/kyc` — submit a KYC application.
- `GET /me/kyc` — read the latest KYC submission.

Admin KYC review:

- `GET /admin/kyc/pending` — list pending KYC submissions.
- `POST /admin/kyc/{submission_id}/review` — approve or reject a KYC submission.

## Doctor Service

Base route: `/v1/doctors`

- `POST /v1/doctors` — create a doctor profile.
- `GET /v1/doctors` — list doctors, with optional specialty filtering.
- `GET /v1/doctors/{doctor_id}` — read one doctor profile.
- `PATCH /v1/doctors/{doctor_id}` — update a doctor profile.
- `DELETE /v1/doctors/{doctor_id}` — deactivate or delete a doctor profile.
- `PUT /v1/doctors/{doctor_id}/availability` — replace availability rules.
- `GET /v1/doctors/{doctor_id}/availability` — read availability rules.
- `GET /v1/doctors/{doctor_id}/slots` — compute available booking slots for a date range.

## Nurse Service

Base route: `/v1/nurses`

- `POST /v1/nurses` — create a nurse profile.
- `GET /v1/nurses` — list nurses, with optional geo/specialty filters.
- `GET /v1/nurses/{nurse_id}` — read one nurse profile.
- `PATCH /v1/nurses/{nurse_id}` — update a nurse profile.
- `DELETE /v1/nurses/{nurse_id}` — deactivate or delete a nurse profile.
- `POST /v1/nurses/{nurse_id}/service_area` — set the service area for a nurse.

## Hospital Service

Base route: `/v1/hospitals`

- `POST /v1/hospitals` — create a hospital profile.
- `GET /v1/hospitals` — list hospitals, with optional specialty, insurance, city, or country filters.
- `GET /v1/hospitals/{id}` — read one hospital profile.
- `POST /v1/hospitals/{id}/staff` — add a staff member to a hospital.
- `GET /v1/hospitals/{id}/reviews` — list public reviews for a hospital.

## Booking Service

Base route: `/v1/bookings`

- `POST /v1/bookings` — create a booking.
- `GET /v1/bookings` — list bookings for the current user or, for admins, all bookings.
- `GET /v1/bookings/{booking_id}` — read a booking.
- `POST /v1/bookings/{booking_id}/cancel` — cancel a booking.

## Payment Service

Base route: `/v1/payments`

- `POST /v1/payments/intent` — create a payment intent.
- `GET /v1/payments/{payment_id}` — read a payment.
- `POST /v1/payments/{payment_id}/refund` — refund a payment.

Webhook surface:

- `POST /v1/webhooks/stripe` — receive Stripe payment events.
- `POST /v1/webhooks/mpesa` — receive M-Pesa payment events.

## Telemedicine Service

Base route: `/v1/rooms`

- `POST /v1/rooms` — create a telemedicine room.
- `GET /v1/rooms/{room_id}` — read a room.
- `GET /v1/rooms/{room_id}/token` — generate a room access token.
- `POST /v1/rooms/{room_id}/join` — join a room.
- `POST /v1/rooms/{room_id}/leave` — leave a room.
- `POST /v1/rooms/{room_id}/end` — end a room session.
- `GET /v1/rooms/{room_id}/messages` — list room messages.
- `POST /v1/rooms/{room_id}/messages` — post a room message.

## Notification Service

Base route: `/v1/notifications` and `/v1/me`

- `POST /v1/notifications/send` — send a notification to one or more users.
- `GET /v1/me/preferences` — read the current user notification preferences.
- `PUT /v1/me/preferences` — update notification preferences.
- `GET /v1/me/inbox` — list the user notification inbox.

## Inbox Service

Base route: `/v1/threads`

- `POST /v1/threads` — create a direct thread.
- `GET /v1/threads` — list the user threads.
- `GET /v1/threads/{thread_id}` — read one thread.
- `GET /v1/threads/{thread_id}/messages` — list messages in a thread.
- `POST /v1/threads/{thread_id}/messages` — send a message in a thread.
- `POST /v1/threads/{thread_id}/read` — mark a thread as read.
- `POST /v1/threads/handoff` — create a support handoff thread.

## Lab Service

Base route: `/v1/lab` and `/v1/me/lab`

- `POST /v1/lab/orders` — create a lab order.
- `POST /v1/lab/results/upload` — upload a lab result.
- `GET /v1/lab/results/{id}` — read a specific lab result.
- `GET /v1/me/lab/results` — list the current patient lab results.

## EHR Service

Base route: `/v1/patients`

- `GET /v1/patients/{patient_id}/records` — read the patient record bundle.
- `POST /v1/patients/{patient_id}/vitals` — record a vital measurement.
- `GET /v1/patients/{patient_id}/vitals` — read a patient vital timeline.
- `POST /v1/patients/{patient_id}/consents` — grant a consent record.
- `DELETE /v1/patients/{patient_id}/consents/{consent_id}` — revoke a consent record.

## Wearable Sync Service

Base route: `/v1/wearables`

- `POST /v1/wearables/devices` — register or update a wearable device for the current user.
- `GET /v1/wearables/devices` — list the current user's connected wearables.
- `GET /v1/wearables/devices/{device_id}/samples` — read synced wearable samples for one device.
- `POST /v1/wearables/sync` — ingest wearable vitals and forward them into the EHR timeline.

## Social Service

Base route: `/v1/social`

- `POST /v1/social/posts` — create a social post or blog entry.
- `GET /v1/social/feed` — read the public feed.
- `POST /v1/social/posts/{id}/comments` — comment on a post.
- `POST /v1/social/posts/{id}/react` — react to a post.
- `POST /v1/social/qa` — create a question.
- `GET /v1/social/qa` — list questions.
- `POST /v1/social/qa/{id}/answer` — answer a question.
- `GET /v1/social/moderation` — read the moderation queue.

## Analytics Service

Base route: `/v1/internal` and `/v1/admin`

- `POST /v1/internal/events` — ingest internal domain events.
- `GET /v1/admin/metrics/funnel` — read funnel metrics.
- `GET /v1/admin/metrics/retention` — read retention metrics.
- `GET /v1/admin/doctors/{id}/scorecard` — read a doctor performance scorecard.

## Onboarding Service

Base route: `/v1/onboarding`

- `POST /v1/onboarding/applications` — create a partner onboarding application.
- `GET /v1/onboarding/applications` — list applications.
- `GET /v1/onboarding/applications/{application_id}` — read one application.
- `POST /v1/onboarding/applications/{application_id}/documents` — attach a document to an application.
- `POST /v1/onboarding/applications/{application_id}/team-members` — attach a team member to a hospital application.
- `POST /v1/onboarding/applications/{application_id}/submit` — submit an application for review.
- `POST /v1/onboarding/applications/{application_id}/review` — review, approve, or reject an application.

## Notes for frontend integration

- The gateway is the only URL the frontend should call directly.
- Authenticated requests should send `Authorization: Bearer <JWT>`.
- The gateway forwards `X-Request-Id` and strips internal headers automatically.
- For patient and partner flows, the frontend should treat `draft -> submitted -> under_review -> approved/rejected` as the canonical onboarding state machine.