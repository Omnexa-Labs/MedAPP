# MedApp Storage Architecture

This document defines the backend storage model for the microservices architecture. The rule is simple: each service owns its source of truth, and agents read curated surfaces instead of raw operational tables.

## Core rules

- One service, one source of truth.
- No cross-service joins.
- Use the datastore that fits the data shape, but keep ownership inside the service boundary.
- Publish changes through the outbox pattern so projections and downstream services stay consistent.
- Agents should prefer summaries, timelines, and retrieval indexes over raw storage access.

## Datastore roles

- **PostgreSQL**: canonical transactional and clinical records.
- **GCS**: binaries and large documents.
- **MongoDB**: narrative and flexible semi-structured text.
- **Qdrant**: retrieval embeddings for RAG and document search.
- **Redis**: ephemeral state, locks, session state, and rate-limiting.
- **RabbitMQ**: domain events and cross-service sync.

## Service ownership map

| Service | Owns | Canonical store | Read surfaces | Efficient agent access |
|---|---|---|---|---|
| `user_service` | Accounts, auth tokens, profiles, KYC submissions, consented identity claims | PostgreSQL | `/v1/me`, `/v1/me/kyc`, auth claims | Agents should use the user summary or token claims, never raw auth tables |
| `doctor_service` | Doctor profile, specialties, fees, availability rules, slots | PostgreSQL | doctor profile/search APIs | Agents should use profile/search endpoints only |
| `nurse_service` | Nurse profile, service area, availability flags | PostgreSQL | nurse profile APIs | Agents should use nurse profile endpoints only |
| `hospital_service` | Hospital profile, facilities, staff links, reviews | PostgreSQL | hospital lookup/review APIs | Agents should use hospital summary APIs only |
| `booking_service` | Booking lifecycle, reschedules, cancellations, booking windows | PostgreSQL | booking summary APIs, booking events | Agents should consume booking summaries or events, not booking rows |
| `payment_service` | Payment intents, payment status, refunds, receipts | PostgreSQL | payment status APIs | Agents should use payment status endpoints; receipts stay in object storage if exported |
| `telemedicine_service` | Rooms, join/end state, room messages, access tokens | PostgreSQL | room state APIs | Agents should use room state APIs only; presence stays ephemeral in Redis |
| `notification_service` | Preferences, inbox delivery state, queued sends | PostgreSQL | preference/inbox APIs, delivery events | Agents should not read delivery internals directly |
| `inbox_service` | Threads, messages, read receipts, handoff threads | PostgreSQL | thread/message APIs | Agents should read the thread view, not message tables |
| `lab_service` | Lab orders, result metadata, upload state | PostgreSQL | lab result/order APIs | OCR text is indexed into Qdrant; binaries remain in GCS |
| `ehr_service` | Patient bundles, vitals timeline, consents, document metadata, access audit | PostgreSQL | bundle/timeline/signed URL APIs, retrieval summaries | Agents should read EHR summaries, timelines, and retrieval chunks only |
| `onboarding_service` | Partner applications, review state, team members, submitted documents | PostgreSQL | onboarding summary/review APIs | Admin tooling should use application summaries, not raw tables |
| `wearable_sync_service` | Device registrations, sync state, sync failures, write-through mapping to EHR | PostgreSQL | wearable device/sync APIs | Agents should read the EHR vitals that result from sync, not device internals |
| `social_service` | Posts, comments, reactions, Q&A, moderation state | PostgreSQL, MongoDB if text becomes highly flexible | feed/public APIs | Agents should only read social data if a workflow explicitly requires it |
| `analytics_service` | Domain event ingestion, aggregates, funnels, retention, scorecards | PostgreSQL or warehouse-style store later | aggregate/scorecard APIs | Agents should read pre-aggregated metrics only |

## Implementation checklist

Each service should satisfy the following before it is considered storage-complete:

- Define the canonical tables or document collections that belong to the service.
- Expose at least one summary endpoint for agents or orchestration layers.
- Expose one time-bounded list or timeline endpoint where the domain is append-heavy.
- Publish state changes through the outbox so projections and downstream readers stay consistent.
- Keep binary payloads out of rows and store only metadata in the service database.

| Service | Write model to implement | Read model to expose | Agent contract |
|---|---|---|---|
| `user_service` | `users`, `profiles`, `kyc_submissions`, `consents` | `/v1/me` and profile summary endpoints | Agents read identity and consent summaries only |
| `doctor_service` | `doctors`, `specialties`, `availability_rules`, `slots` | profile and search endpoints | Agents read doctor search/profile summaries only |
| `nurse_service` | `nurses`, `service_areas`, `availability_flags` | profile endpoints | Agents read nurse summary endpoints only |
| `hospital_service` | `hospitals`, `facilities`, `staff_links`, `reviews` | lookup and review endpoints | Agents read hospital summaries only |
| `booking_service` | `bookings`, `booking_events`, `cancellations`, `reschedules` | summary and timeline endpoints | Agents read booking summaries or event timelines only |
| `payment_service` | `payment_intents`, `payment_statuses`, `refunds`, `receipts` | payment status endpoints | Agents read payment status summaries only |
| `telemedicine_service` | `rooms`, `room_members`, `room_messages`, `access_tokens` | room state endpoints | Agents read room summaries only; presence stays in Redis |
| `notification_service` | `notification_preferences`, `delivery_jobs`, `inbox_items` | inbox and delivery summary endpoints | Agents read delivery summaries only |
| `inbox_service` | `threads`, `messages`, `read_receipts`, `handoff_threads` | thread and message timeline endpoints | Agents read thread views, not message tables |
| `lab_service` | `lab_orders`, `result_metadata`, `upload_state` | order/result summary endpoints | Agents read lab summaries and OCR text only |
| `ehr_service` | `patient_bundles`, `vitals`, `consents`, `document_metadata`, `access_audit` | bundle, timeline, and retrieval endpoints | Agents read patient summaries, vitals timelines, and retrieval chunks only |
| `onboarding_service` | `applications`, `application_reviews`, `team_members`, `submitted_documents` | application summary/review endpoints | Agents read onboarding summaries only |
| `wearable_sync_service` | `devices`, `sync_runs`, `sync_failures`, `sync_mappings` | device and sync status endpoints | Agents read the resulting EHR vitals, not wearable internals |
| `social_service` | `posts`, `comments`, `reactions`, `moderation_state` | feed and post summary endpoints | Agents read social summaries only when a workflow needs them |
| `analytics_service` | event projections and aggregate tables | scorecard and aggregate endpoints | Agents read aggregates only, never raw events |

## Agent reading pattern

The efficient agent pattern is:

1. Read a service summary endpoint first.
2. Read a time-bounded timeline or list endpoint if needed.
3. Use retrieval only for unstructured context that summary endpoints cannot provide.
4. Never start from raw tables unless the service is explicitly exposing that read path.

This keeps agent prompts small, avoids cross-service joins, and preserves service ownership.

## Recommended read models by agent

| Agent | Best read surfaces | Why |
|---|---|---|
| `concierge_agent` | user profile, booking summary, EHR summary, doctor search | Needs orchestration context, not raw data |
| `medical_chat_agent` | EHR summary, medications, allergies, conditions | Needs clinical context with minimal surface area |
| `smart_recommend_agent` | EHR timeline, medications, vitals trends, wearable-derived summaries | Needs trends, not individual storage records |
| `lab_reader_agent` | OCR text, lab result metadata, retrieval index | Needs extracted content rather than binaries |
| `vitals_watcher_agent` | vitals timeline, wearable sync result, anomaly history | Needs time-series data with bounded windows |
| `booking_agent` | doctor availability, booking windows, booking status | Needs scheduling surfaces only |

## Storage efficiency guidelines

- Index by the query shape, not the table shape. Typical indexes are `patient_id + recorded_at`, `owner_user_id + status`, or `doctor_id + day_of_week`.
- Partition high-volume append-only tables like vitals, events, and traces by time.
- Store large binaries in GCS and keep only metadata in Postgres.
- Push narrative text into MongoDB only when the schema is genuinely fluid.
- Build Qdrant embeddings from canonical text once, then query the vector index for retrieval.
- Use Redis for state that can be safely lost and recreated.
- Use outbox + RabbitMQ for reliable inter-service propagation.

## Practical summary

If the data is a source of truth, keep it in the owning service's canonical store.
If the data is a document or binary, keep it in object storage with metadata in the service DB.
If the data is for retrieval or agent context, index it separately from the canonical store.
If the data is transient, keep it in Redis.