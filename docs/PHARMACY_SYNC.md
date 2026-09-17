# Pharmacy reports delivered to MedApp

Implemented 2026-09-16. Dispensing, receipt corrections and cancellations now save
delivery records in the same PostgreSQL transaction as the pharmacy operation.
A separate worker sends complete snapshots to the MedApp pharmacy service. The
patient prescription-history route reads those saved reports without sample data.

This is a pharmacy-reported dispensing history. Specialist prescription issuing,
the patient's medicine course/adherence, refill authorization, order fulfillment
and delivery tracking still require their own B08/B11 contracts. A report marked
**Dispensed** does not establish that the patient finished taking the medicine.

## Deployment

1. Apply directory migration `20260916_0005` and PMS migration
   `0007_medapp_delivery` using the existing migration URLs. Upgrade the gateway,
   pharmacy service, PMS API, portal and mobile application together. Keep the
   worker stopped until both migrations and the receiver are available.
2. Complete the existing [pharmacy activation and deployment assignment](api/pharmacy_service.md).
   The pharmacy must be active and its permanent deployment confirmed. Each
   deployment uses its own database and integration key.
3. Set `PMS_MEDAPP_SYNC_URL` on the PMS API and worker to the exact receiver:
   `https://<medapp-gateway>/v1/pharmacy-sync/events`. Internal Compose defaults
   to `http://pharmacy_service:8015/v1/pharmacy-sync/events`. URLs cannot contain
   credentials, query strings, fragments or alternate paths. Use HTTPS across
   public networks. The old `PMS_MEDAPP_DISPENSE_WEBHOOK_URL` callback is no longer used.
4. Set the same `PMS_DATABASE_URL`, `PMS_MEDAPP_DEPLOYMENT_KEY` and
   `PMS_MEDAPP_WEBHOOK_SECRET` for API and worker. The last two must match the
   directory's assigned `PHARMACY_PMS_DEPLOYMENTS` entry and its `stock_secret`.
   Keep integration keys distinct from activation, session and handoff keys.
5. Start the worker using the existing Compose project:

   ```sh
   docker compose -f infra/docker/docker-compose.yml up -d --build pms_medapp_sync
   ```

   For a separately managed deployment, from `backend/services/pms_service`:

   ```sh
   python -m app.workers.medapp_sync
   ```

   `--once --limit 100` processes one bounded batch and exits. The continuous
   worker polls every two seconds. Multiple processes may share the same pharmacy
   database; claims use PostgreSQL `FOR UPDATE SKIP LOCKED`.

Check **Prescriptions → a MedApp prescription → MedApp delivery**. Queued/Sending
means receipt is still unconfirmed. **Received by MedApp** requires a matching
persisted acknowledgement, including event, pharmacy, prescription and sequence.
Confirm the latest update, not only an earlier successful delivery. Verify the
same pharmacy report appears in the intended patient's **Prescriptions** screen.

## Delivery and recovery

Each MedApp prescription has an independent, increasing delivery sequence. Events
are saved for ingestion, dispensing, both correction dispositions, cancellation
and receipt-line reconciliation. Full snapshots include the original line IDs,
prescribed and dispensed quantities, and quantities later returned by the customer.
Never-collected units reduce dispensing; customer returns preserve dispensing and
are shown separately. Local walk-in/internal prescriptions do not enter this queue.

Claims commit before HTTP, with a unique 60-second lease. A worker that exits
before completing delivery leaves an expiring lease for another worker. Completion
requires the current lease token, so a late worker cannot overwrite a newer
attempt. HTTP uses an eight-second timeout and never follows redirects.

Network failures, 408/425/429, server errors and invalid/mismatched acknowledgements
retry with exponential delay capped at 900 seconds. Every twelfth failed attempt
pauses for staff review; attempt counts are cumulative across manual retries.
Other responses, missing configuration or a deployment mismatch require attention.
Saved payloads remain unchanged across every attempt.

Pharmacists and administrators can select **Retry update**, review it and choose
**Queue retry**. This action is versioned, audited and requires a UUID
`Idempotency-Key`. Cashiers may view status. An uncertain portal response retains
the request key in the mounted form. After leaving the form, reload delivery
status before starting another retry. Queuing a retry never repeats dispensing,
stock deduction, a correction or payment.

Monitor delivery state, oldest pending/retry time, expired leases and
`attention_required` records in `medapp_deliveries`. The Compose worker has process
restart handling; deployment-specific queue-age alerts still need operator setup.
Logs and the status API do not include patient payloads or upstream error bodies.
Back up the PMS outbox and the directory's patient reports/receipts with their
databases. Populated migrations refuse destructive downgrade; use forward fixes.

## Patient linkage and inbound prescriptions

`POST /v1/integrations/medapp/prescriptions` still uses the signed inbound
prescription contract. It now accepts only a complete resolvable prescription:
1–100 items, positive whole quantities, bounded fields, and exactly one active
drug for each line. Invalid hints or missing/ambiguous matches reject the entire
request. A valid hint is the local drug identity. Use UUIDs for
`customer_medapp_user_id`. Request receipts serialize concurrent ingestion by
external reference; changing the payload under the same reference returns 409.

The patient UUID is frozen on the prescription when authenticated ingestion
succeeds. Editable customer records cannot redirect reports to another account.
Historical prescriptions are not backfilled or replayed automatically. A missing
verified patient link, unavailable workspace at enqueue time or invalid snapshot
requires explicit records reconciliation; the retry API cannot edit these payloads.
Legacy references cannot be re-ingested as new prescriptions. Duplicate MedApp
external references must be reconciled before applying the unique-index migration.

No ordinary PMS browser API can create `source=medapp` or select the destination
patient. This integration still requires a trusted upstream prescription sender;
the complete specialist prescribing service and issuance UI remain pending.

## Receiver and patient API

`POST /v1/pharmacy-sync/events` is passed through the gateway without a patient
JWT and authenticated by the receiving service with three headers:
`X-MedApp-Deployment`, `X-MedApp-Timestamp` (Unix seconds) and
`X-MedApp-Signature`. The signature is `sha256=` plus the HMAC-SHA256 of:

```text
<timestamp>\nPOST\n/v1/pharmacy-sync/events\n<exact request body>
```

The deployment's configured `stock_secret` signs the request. Timestamp skew is
limited to five minutes; keep server clocks synchronized. The body is bounded to
256,000 bytes and validated against
[`DispensingEvent`](../backend/shared/shared/pharmacy_sync.py).

The receiver locks the permanent deployment binding, checks the active pharmacy
and commits the event and acknowledgement together. Replaying the same event and
payload returns the original acknowledgement. Reusing an event/sequence for a
different payload, moving a prescription between patients, or changing original
line identity/instructions/quantities returns 409. Older snapshots are receipted
without replacing newer patient state. No stock or payment operation occurs here.

| Endpoint | Access and response |
| --- | --- |
| `GET /v1/me/pharmacy-prescriptions?limit=25&offset=0` | Current authenticated account only; default 25, maximum 100; total and paged pharmacy reports. |
| `GET /v1/me/pharmacy-prescriptions/{id}` | Current account's report, or 404. Includes pharmacy display name, report time, sequence and dispensing snapshot. |
| `GET /v1/prescriptions/{id}/medapp-deliveries` | PMS staff only; default 25, maximum 100; metadata and retry eligibility, never raw payloads. |
| `POST /v1/prescriptions/{id}/medapp-deliveries/{event_id}/retry` | PMS pharmacist/admin; saved delivery `version` and UUID `Idempotency-Key`. |

Patient reads use `Cache-Control: private, no-store`. No caller-supplied patient ID
can broaden access. Previously reported history remains readable if a pharmacy
later closes. Mobile queries are scoped to the current session, cancelled on
account change and cleared after unmount. Failures, empty history, refresh and
paging have distinct UI states.

See [the completion baseline](COMPLETION_BASELINE.md) for automated evidence and
remaining browser/device/reference acceptance. Neither P-043 nor S-031 is accepted
by this implementation milestone.

The subsequent [clinical prescribing milestone](PRESCRIBING.md) adds verified-doctor
issuing, patient clinical records and durable prescription handoff/withdrawal.
Its EHR delivery worker complements the PMS report worker described here.
