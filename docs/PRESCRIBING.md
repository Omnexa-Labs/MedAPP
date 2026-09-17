# Clinical prescribing and pharmacy handoff

Implemented 2026-09-16. This is the prescribing milestone within B08, not acceptance of the whole medication module or its reference screens.

## Ownership and access

EHR owns clinical prescriptions. PMS owns dispensing and stock; pharmacy_service owns deployment routing and patient-visible dispensing reports. The MedApp prescription ID becomes the PMS `external_ref`. Patient credentials never become pharmacy staff credentials.

Only **verified doctors** may prescribe, as confirmed by the product owner. Each action checks the current active account role through user_service, an active doctor profile and its immutable onboarding activation receipt through doctor_service, and a current patient consent. A legacy profile, JWT doctor role alone, nurse role or administrator role does not grant prescribing rights.

The patient explicitly grants `records_and_prescriptions` to a named doctor in care-team sharing, for 7, 30 or 90 days. This permits EHR summary/vitals reading, clinical prescription reading, and prescribing; it does not grant vital writing. Existing `records` and `records_and_vitals` grants do not gain prescription access. Only the original author can change, issue, cancel, replace or route their prescription. Patients see their own issued records; drafts remain private to the author. Patient locks serialize consent revocation with clinical reads/writes. An already authorized request can finish before revocation takes effect.

## API and clinical states

Base: `/v1/patients/{patient_user_id}/prescriptions`, through the existing EHR gateway prefix. Responses carry `Cache-Control: no-store`.

| Method and suffix | Behavior |
| --- | --- |
| `GET` base | Bounded history: limit 1–50 (default 25), offset and next_offset. |
| `GET /{id}` | Authorized saved detail and pharmacy delivery states. |
| `POST` base | Create an author-owned draft. |
| `PUT /{id}` | Update a draft with its current version. |
| `POST /{id}/issue` | Require version and `clinical_review_confirmed: true`; record issuing time and approval receipt. |
| `POST /{id}/cancel` | Require version and reason; withdraw clinically and queue pharmacy withdrawal when routed. |
| `POST /{id}/correct` | Withdraw the original and create one linked replacement draft; require reason and current version. |
| `POST /{id}/route` | Queue one pharmacy_id for an issued, unexpired prescription. |
| `POST /{id}/retry` | Author retries deliveries needing attention. |

Every write requires a UUID `Idempotency-Key`. Actor, patient, operation, resource and payload are bound to a receipt in the same transaction. Exact retries return their saved result; changed commands and stale versions fail with 409. Authorization is rechecked before replay.

Each of 1–20 medicines has a name, strength, form, dose, route, frequency, duration, quantity and optional instructions. Quantity is entered explicitly. `valid_until` must be today or within 365 days, UTC; this is a technical bound, not a jurisdictional prescribing rule. Clinical goal is optional. There is no automated dose, allergy or interaction decision. Issued contents are immutable; a correction preserves the original and requires a separately reviewed and issued replacement.

A routed prescription must be cancelled and have **confirmed pharmacy withdrawal** before replacement. Changing destination or silently editing a sent prescription is unsupported. Cancellation retains supplied quantities, receipts and stock movements; it does not reverse sales, return stock, refund payment or indicate treatment completion.

## Delivery and recovery

`python -m app.workers.prescriptions` runs separately from EHR HTTP requests. It claims rows with `FOR UPDATE SKIP LOCKED`, commits a 60-second lease, performs network I/O outside that transaction, and finalizes only its own lease token. Retry delays cap at 900 seconds; every 12 failed attempts pause for attention. Permanent rejections and configuration errors also need attention. Status does not expose clinical payloads or raw upstream errors.

EHR calls pharmacy_service's private `POST /internal/clinical-prescriptions` using a separate shared credential. The gateway does not expose this route. pharmacy_service uses a configured, activated PMS deployment for an active pharmacy; callers cannot supply a URL. It signs the request method, path and body using the deployment's existing partner secret. Both relays validate prescription, pharmacy, operation and accepted item count. HTML or an unrelated successful response is not delivery confirmation.

PMS receives `/v1/integrations/medapp/clinical-prescriptions`. It validates workspace and patient identity, then matches **name, strength and form** to exactly one active catalog item per line. Unresolved/ambiguous lines reject the whole prescription. PMS stores the dispensing expiry and refuses expired dispensing.

Sending and withdrawal share a PostgreSQL transaction lock keyed by prescription reference. PMS persists a cancellation marker even if the first send has not arrived. A delayed first delivery cannot reopen the withdrawn prescription, including through the legacy ingestion endpoint. Repeated matching sends/withdrawals return their original acknowledgements. The existing [pharmacy sync worker](PHARMACY_SYNC.md) reports receipt, dispensing and cancellation to the correct patient.

For a delivery needing attention, fix deployment/catalog configuration, refresh the doctor's prescription and select **Retry pharmacy handoff**. Retry cannot edit its clinical contents or destination. For a correction, cancel, confirm pharmacy withdrawal, then prepare a replacement. Pending urgent withdrawals explicitly direct the doctor to contact the pharmacy; the app does not report unconfirmed withdrawal as complete.

## Deployment and screens

1. Apply EHR `20260916_0005` and PMS `0008_clinical_handoff` after the pharmacy-sync migrations. Downgrades refuse to discard prescribing or handoff evidence.
2. Configure EHR's user, doctor and pharmacy service URLs. Set a distinct random secret of at least 32 characters as `EHR_CLINICAL_HANDOFF_SECRET` and `PHARMACY_CLINICAL_HANDOFF_SECRET`. Compose maps `CLINICAL_HANDOFF_SECRET` to both. Never expose this credential to clients.
3. Deploy doctor_service, EHR, pharmacy_service, PMS and the clients. Retain confirmed pharmacy bindings and separate per-deployment partner credentials.
4. Run `ehr_prescription_delivery` and `pms_medapp_sync` with the same databases/settings as their HTTP services. Neither worker publishes a host port.
5. Grant explicit patient prescribing permission and exercise an approved-doctor/test-patient/confirmed-pharmacy journey before release.

Specialists open **Patient record → Prescriptions**. Patients use **Prescription history** and ID-based new/details/share routes. Clinical URL fields cannot reconstruct a prescription. Text export refreshes the saved record and identifies it as a patient copy without a verification signature. Pharmacy reports remain separate from medication-course/adherence state.

## Evidence and remaining acceptance

See [COMPLETION_BASELINE.md](COMPLETION_BASELINE.md) for current reports. The isolated HTTP/PostgreSQL journey covers real accounts, approval receipts, concurrent duplicate creation/issuing, patient isolation, failed delivery and competing workers, partial dispensing, withdrawal, replacement and revocation. Component tests use mocked APIs and do not establish device acceptance.

S-023/S-024 and P-042/P-043/P-049/P-050 remain in progress and unaccepted. Rendered browser/device/reference comparison is pending. Medication-course state, adherence, scanning, interaction providers, legal signature/verification requirements, refill/order/delivery flows and notifications remain in B08 and adjacent batches. Production prescription routes contain no sample patient or medicine.

The subsequent [medication tracking milestone](MEDICATION_TRACKING.md) implements
patient-owned course states and dose reports. It retains these prescription and
dispensing boundaries and leaves reference acceptance, scanning, interaction
providers, notifications and the other listed integrations open.
