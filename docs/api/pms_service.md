# Pharmacy operations contract

Updated 2026-09-16. This describes the implemented dashboard, inventory,
purchasing, POS, prescription, correction and refund-record workflows.
Ownership, deployment assignment, sign-in, workspace handoff and directory
publication are covered by [pharmacy_service.md](pharmacy_service.md).

Each pharmacy uses its own PMS database. Requests below require a current PMS
staff token and active membership. The browser uses its opaque portal session
through `/api/pms/*`; the portal checks the origin and session scope, restricts
paths, and forwards the server-held PMS token. Browser-supplied authorization
headers are discarded.

## Database rollout

Apply PMS Alembic migrations through `0008_clinical_handoff` before deploying the new
API and portal together. Existing drugs and batches start at revision 1. The
inventory migration adds `inventory_requests` for atomic mutation receipts. The
purchasing migration adds order revisions, received quantities, saved drug/supplier
labels and explicit batch-to-order-item allocations. Earlier orders with receipt
evidence or a received status are flagged for reconciliation. The transaction
migration adds sale/prescription revisions, sale notes and cancellation reasons.
The correction migration adds separate credit/refund records and exact prescription
line links for new dispensing receipts; earlier links remain null. The delivery
migration adds the outbox, event sequences and frozen patient links. The clinical
handoff migration adds durable send/withdrawal receipts and prescription expiry.
The signed `POST /v1/integrations/medapp/clinical-prescriptions` endpoint accepts
the verified-doctor prescription contract described in [PRESCRIBING.md](../PRESCRIBING.md).
It requires a confirmed MedApp pharmacy workspace and the deployment partner
signature, rather than a staff token. Cancellation markers prevent delayed sends
from reopening withdrawn prescriptions; dispensing refuses expired prescriptions.
Apply directory
migration `20260916_0005` and configure the [MedApp worker](../PHARMACY_SYNC.md).
Historical patient links remain unknown; duplicate MedApp external references
require reconciliation before upgrade. Downgrading
refuses to discard receipts or changed revisions; retain database backups and
use a forward migration for a populated deployment. Use UTC for the PMS process
and database session timezone so inventory dates and sales periods align.

## Catalog

| Request | Behavior |
| --- | --- |
| `GET /v1/drugs` | Filter by `search` (literal name, brand or SKU), `active` (default true), `category`, and `low_stock_only`. `limit` is 1–200, default 200; `offset` starts at 0. Returns `items`, `total`, `limit`, `offset`, and pharmacy `currency`. |
| `GET /v1/drugs/{id}` | Current catalog record, revision and non-expired stock total, including archived drugs. |
| `POST /v1/drugs` | Create with a UUID `Idempotency-Key`. Required name, category, dosage form, strength and stock unit. Optional brand/SKU/notes, reorder level, prescription requirement and selling price. Returns 201. |
| `PATCH /v1/drugs/{id}` | Send the current `version` and changed fields. Stale versions return 409; successful changes increment the version and record before/after audit data. `is_active=false` archives while preserving batches and history. |

Reads allow administrators, pharmacists and cashiers. Writes allow administrators
and pharmacists. Blank required fields, unknown fields, invalid amounts and
duplicate SKUs are rejected. Currency is derived from the pharmacy; an explicit
different currency is rejected. Reorder levels are whole units from 0 to 1,000,000.
Amounts are integer cents from 0 to 2,147,483,647. Catalog edits do not change
physical stock or reprice existing batches. Archived drugs cannot be received,
sold or dispensed. Prescription-only drugs use the prescription dispensing flow.

## Batches and stock history

| Request | Behavior |
| --- | --- |
| `GET /v1/batches` | Optional `drug_id`, `purchase_order_id`, `state=all/available/expiring/expired/empty`, `limit` and `offset`. Returns items, pagination totals and authoritative `inventory_date`. Expiring means positive stock with expiry from today through 90 days. |
| `POST /v1/batches` | Receive physical stock with UUID `Idempotency-Key`; requires drug ID, batch number, positive whole quantity, received and expiry dates. Optional active supplier, unit cost and selling price. Returns 201. |
| `POST /v1/batches/{id}/adjust` | UUID `Idempotency-Key`, saved `version`, nonzero integer `delta`, `reason=adjust/expire/return`, and a 5–255 character note. Expiry removes units; returns add units. Stale versions and negative resulting balances return 409. |
| `GET /v1/batches/{id}/movements?offset=0` | Administrators/pharmacists receive the latest 50 movements with `has_more`. Entries include quantity change, reason, note, time and recorded staff name when available. |

Receipts allow 1–1,000,000 units. New stock cannot already be expired or have a
future received date. A blank/null selling price takes the catalog default;
explicit zero stays zero. A batch's currency must match its drug and pharmacy.
Expiry before today excludes stock from availability and dispensing; units remain
in the physical balance and ledger until an authorized removal is recorded.

Manual receipts, adjustments, POS sales, sale voids, uncollected corrections, prescription dispensing and
purchase-order receipts serialize stock writes using parent drug locks in sorted
ID order. Balance changes increment batch revisions and record the acting staff
member in the movement ledger within the transaction. Concurrent writers cannot
overwrite another writer's balance. Existing legacy ledger gaps are not repaired
by this migration and require explicit reconciliation.

## Retries and errors

Use one new UUID per logical create/receive/adjust operation. Keep the same UUID
and payload after a lost response. A committed retry by the same staff member
returns the original response without another write. Reusing a UUID with another
actor, operation or payload returns 409. Validation and failed transactions do not
commit a receipt. After a replay, refetch the current record: its balance may have
changed since the original response. Authorization is checked again on every retry.

The portal freezes form values after an uncertain response and offers **Retry
same request**. The request UUID is retained only while that form remains mounted;
recovery across a full reload/browser restart is not implemented. After leaving
an uncertain form, reconcile the saved catalog/batch history before starting a new
write. Drug edits use version checks: a retry after an unconfirmed successful edit
may return 409 and requires reload. There is no automatic background write replay.

## Dashboard

`GET /v1/reports/dashboard?period=today|week` returns current active catalog and
pending/partly dispensed prescription counts, low-stock/expiring/expired counts,
up to five pending prescriptions and five entries of each stock task type, and
sales activity. Today has 24 hourly buckets; week includes today and six preceding
dates. The portal aggregates today's display into four-hour bars and provides an
accessible data table. Empty periods are explicitly empty.

Sales totals and activity include completed sales in the pharmacy currency,
using completion time with a creation-time fallback; voided sales are excluded.
The response identifies its dates, currency, timezone and refresh time. Credits,
sales after credits and completed refund entries appear separately. Historical
foreign currency is not converted.

## Remaining completion work

S-031 is in progress, with reference/device/theme acceptance pending. Scanning,
refill orders, fulfillment/delivery and clinical interaction alerts require real
contracts and remain in B08/B11; the dashboard does not invent their counts.
Purchase-order partial deliveries and cancellation of the unreceived remainder are
implemented below. Quantity corrections and external refund records are also
implemented below; actual payment-provider refunds and supplier credits remain open.
Prescription-linked sales use the correction workflow and cannot be voided.
POS/dispensing retries now use atomic
request receipts as described below. Recovery after leaving the form or restarting
the browser remains open, along with patient refill/order/fulfillment contracts.
Pharmacy dispensing and correction reports now use [durable MedApp delivery](../PHARMACY_SYNC.md).

Verification and local report paths are recorded in
[COMPLETION_BASELINE.md](../COMPLETION_BASELINE.md).

## Purchasing and partial deliveries

Deploy the API and portal together after applying `0004_partial_receiving`.
All purchasing writes require a UUID `Idempotency-Key`, including draft edits.
All writes to an existing order also require its saved integer `version`.
The same actor, operation, key and payload replay the original committed result.
A changed payload or stale version returns 409. Authorization is rechecked on
replay. After a lost response, the portal retains the form values and key for
**Retry same request**; keys currently last only while the form remains mounted.

| Request | Behavior |
| --- | --- |
| `GET /v1/purchase-orders` | `search` matches saved supplier name or order number; `status` filters draft/sent/partially_received/received/cancelled. `limit` 1–200 (default 25) and `offset` provide server paging. Returns items, total, limit, offset and pharmacy currency. |
| `GET /v1/purchase-orders/{id}` | Order, saved supplier label, revision, receipt reconciliation flag, cancellation reason and item-level ordered/received/outstanding/cancelled quantities. A missing order returns 404. |
| `POST /v1/purchase-orders` | Save a draft with `supplier_id`, optional `expected_at` and notes, and 1–100 items containing drug ID, positive whole quantity and integer unit cost in cents. One line per drug. The server derives currency and saves drug/supplier labels. |
| `PATCH /v1/purchase-orders/{id}` | Replace the draft details and items using the create shape plus `version`. Only a draft without receipts is editable. Before/after snapshots remain in history even though draft item IDs are replaced. |
| `POST /v1/purchase-orders/{id}/send` | Body `{ "version": n }` records that the order has already been placed with the supplier. The portal labels this **Mark as ordered**. No email, supplier API call or other external message is sent. |
| `POST /v1/purchase-orders/{id}/receive` | Body `version`, `received_at`, optional `delivery_reference`, and 1–200 batch lines. Receive any subset of outstanding items; multiple batches can target one item. Combined quantities cannot exceed its outstanding amount. |
| `POST /v1/purchase-orders/{id}/cancel` | Body `version` and a 5–255 character `reason`. Cancels remaining quantities on a draft, ordered or partly received order. Preserves stock and recorded deliveries. |
| `GET /v1/purchase-orders/{id}/history?offset=0` | Administrators/pharmacists read 50 recorded changes plus `has_more`. Entries include staff name, time, action and before/after order snapshots; delivery entries identify batches and references. History follows order revision, newest first. |

Administrators and pharmacists can create, edit, mark, receive and cancel orders.
Cashiers can read orders and delivered batches. New or edited drafts require an
active supplier and active drugs in the pharmacy currency. Quantities are bounded
to 1–1,000,000 per order item; unit costs and total order cost are bounded to
2,147,483,647 cents. Unknown fields, duplicate drug lines and invalid numeric
types are rejected. A draft becomes `sent` when marked as ordered. A receipt
changes it to `partially_received` until every item has arrived, then `received`.
Closed orders cannot receive further deliveries.

Each receipt line contains `purchase_order_item_id`, `batch_number`,
`quantity_received`, `expiry_date`, optional `unit_cost_cents` and optional
`selling_price_cents`. **The received date belongs at the request root.** Blank/null
cost uses the order price; blank/null selling price uses the current catalog
price. Explicit zero remains zero. Expiry is read from packaging, not guessed by
the UI. Received dates cannot be in the future and new stock cannot be expired.
The delivery's total cost is bounded to 2,147,483,647 cents.

The PO row lock serializes edits, status changes and deliveries; sorted parent
drug locks coordinate receipts with sales and stock adjustments. Batches, item
received counters, order status/revision, movement ledger, audit and request receipt
commit together. `quantity_received` records original deliveries and is independent
of subsequent stock consumption. Delivered batch records expose
`purchase_order_item_id` and `delivery_reference`. Cancelling a partial order sets
its unreceived amount as cancelled; it does not reverse an earlier delivery or
process a supplier credit. The ordered total remains the saved original order
value; each batch records its actual receipt cost.

### Earlier purchase receipts

The migration never infers item allocations from an old `received` status.
Orders with earlier batches or received status have `receiving_reconciled=false`;
their received/outstanding/cancelled quantities are returned as null until reviewed.
Edits, status changes and further receipt are blocked during that review.

`POST /v1/purchase-orders/{id}/reconcile` is restricted to pharmacy administrators.
Send `version`, a 5–1000 character `note` and `allocations`, each mapping one
`batch_id` to a matching `purchase_order_item_id`. Every existing batch belonging
to the order must be mapped exactly once to an item for the same drug. The portal
loads all earlier batches, asks the administrator to check the delivery records
and records the review note. It preserves physical stock, prices and movement
history. Only allocation metadata and received counters change; batch revisions
advance to detect concurrent edits. A partially fulfilled old received order
becomes partly received; a cancelled order stays cancelled. Historical over-receipt
is retained and labelled rather than silently reduced.

An order with missing batch evidence, invalid historical quantities/drug matches,
or more than 500 historical batches requires a separate records review. The UI
keeps it flagged and does not invent receipts or silently truncate allocations.
This remains part of legacy reconciliation in the completion guide.

## POS and prescription transaction recovery

Apply `0005_transaction_recovery` after the earlier PMS migrations and deploy the
API and portal together. Existing sales and prescriptions start at revision 1;
existing status, amounts and prescription notes remain intact. New sale notes,
void reasons and prescription cancellation reasons are retained. Downgrade refuses
to discard populated revisions, sale notes or cancellation evidence.

Every sale creation, sale void, manual prescription creation, dispense and
prescription cancellation requires a UUID `Idempotency-Key`. Authorization is
checked before replay. The same actor, operation, key and payload return the
original committed response, even if the current record has changed since then.
A fresh GET shows current status. Reusing a key with a different payload or actor
returns 409. Stock, sale, prescription counters, audit and request receipt commit
in one transaction; a failure before commit rolls all of them back.

| Request | Behavior |
| --- | --- |
| `GET /v1/sales` | Optional `status` completed/voided, `payment_method`, `prescription_id` and sale-number `search`. Returns items, total, limit and offset. Page size defaults to 25, maximum 200. |
| `GET /v1/sales/{id}` | Saved receipt, actual batch allocations, amount breakdown, payment details, notes, version and void reason. |
| `POST /v1/sales/quote` | Review a walk-in sale using the same body as sale creation. Returns FEFO batch allocations, batch prices, pharmacy currency and totals. No request key needed; no stock is reserved or deducted. |
| `POST /v1/sales` | Record a walk-in sale with 1–100 distinct drug lines, positive whole quantities, optional customer, discount/tax in cents and payment details. Optional `unit_price_cents` is an explicit API override; the portal omits it and uses batch prices. Optional `expected_total_cents` detects a changed reviewed total and returns 409 before saving. The portal always supplies it after review. |
| `POST /v1/sales/{id}/void` | Legacy whole-sale endpoint: requires saved `version` and a 3–255 character reason. Restores all units to their original batches and advances the sale revision once. Missing original batches, prescription-linked sales, and sales with any correction/refund records are rejected. The portal uses the disposition-aware correction workflow below. |
| `GET /v1/prescriptions` | Optional status, source and prescription-number search; same paging envelope as sales. Statuses: pending, partially_dispensed, dispensed, cancelled. |
| `GET /v1/prescriptions/{id}` | Saved prescription, revision, prescriber, instructions, prescribed/dispensed quantities and cancellation reason. |
| `POST /v1/prescriptions` | Record 1–100 prescription lines from supplied instructions. Validates active drugs and customer existence. Manual source is walk_in/internal; MedApp ingestion remains separate. |
| `POST /v1/prescriptions/{id}/quote` | Body contains saved `version`, selected prescription-item IDs, positive quantities and payment details. Returns current batch prices without deduction. No request key needed. |
| `POST /v1/prescriptions/{id}/dispense` | Same body as quote plus the replay key. The portal also submits the reviewed `expected_total_cents`. Duplicate item IDs, quantities above the remainder, unavailable stock and stale revisions are rejected. Saves a sale receipt, advances prescription quantities/status/version and returns sale ID/number, amount, allocations and prescription revision. |
| `POST /v1/prescriptions/{id}/cancel` | Saved `version` plus a reason cancels further dispensing. Prior dispenses and sales remain intact. A partial prescription shows its undispensed units as cancelled. |

All authorized PMS roles can read receipts/prescriptions and create walk-in sales.
Only administrators/pharmacists can create, quote, dispense or cancel prescriptions,
or void sales. Inputs reject unknown fields, invalid payment methods, fractional
quantities and oversized amounts/text. Payment methods are cash, card, mobile_money
and insurance; references are bounded to 128 characters, transaction notes to 2000.
Recording payment details does not charge an instrument or issue a refund.

The portal keeps values and the request key while a failed form remains mounted.
An uncertain response locks editing and offers **Retry same request**. A conflict
requires closing and reviewing the current record again. Query/session changes
cannot apply a delayed response to another account. Keys are not yet recoverable
after route departure or browser restart; check saved receipts before starting
another transaction after losing a form. No clinical drafts are persisted in
browser local storage by this workflow.

MedApp dispensing reports now commit to an outbox with the transaction. A separate
worker sends versioned full snapshots and requires a matching persisted MedApp
acknowledgement. The former callback URL/payload is retired; use the
[delivery contract and setup](../PHARMACY_SYNC.md). Patient refill fulfillment/delivery,
specialist issuing, supplier credits and payment-provider refunds remain open.

## Receipt corrections and completed refund records

Apply `0006_sale_corrections` before the API/portal update. The original receipt,
quantities, prices and total remain immutable. `SaleOut` adds `credited_cents`,
`refunded_cents` and `refundable_cents`; each line adds `corrected_quantity` and
nullable `prescription_item_id`. Credits do not change the original completed
status. New dispensing records the exact prescription line even when several
lines contain the same drug. Migration does not infer links on older receipts.

All writes below require a UUID `Idempotency-Key` and the saved sale `version`.
Correction/reconciliation requests for prescription sales also require the saved
`prescription_version`. Keys, authorization, replay and conflicts follow the
transaction rules above. Corrections, stock movements, prescription changes,
audit evidence and request receipts commit atomically. The sale lock precedes the
prescription lock and sorted drug locks. Customer returns preserve clinical counts.

| Request | Behavior |
| --- | --- |
| `GET /v1/sales/{id}/corrections` | Paged credit/disposition history with reason, staff attribution, time and line quantities/credits. `limit` defaults to 25, maximum 100; `offset` starts at zero. |
| `POST /v1/sales/{id}/corrections/quote` | Preview a correction using its complete body without a request key. Returns currency, total credit and line credits; no records or stock change. |
| `POST /v1/sales/{id}/corrections` | Body: `version`, optional `prescription_version`, `kind`, 3–255 character `reason`, `stock_confirmed: true`, and 1–200 distinct `items` with `sale_item_id` and positive whole `quantity`. Quantities cannot exceed the receipt remainder. Returns 201 and a numbered credit record. |
| `GET /v1/sales/{id}/refunds` | Paged refund-entry history, including entries marked incorrect; same limits as correction history. |
| `POST /v1/sales/{id}/refunds` | Body: `version`, positive integer `amount_cents`, `payment_method`, 3–128 character `payment_ref`, 3–255 character `reason`, and `payment_confirmed: true`. Records a refund already completed externally; performs no payment call. Returns 201. |
| `POST /v1/sales/{id}/refunds/{refund_id}/void` | Administrator only. Body: `version`, `reason`, `entry_was_incorrect: true`. Retains the entry with its correction reason, time and actor. Does not reverse any real payment. |
| `POST /v1/sales/{id}/reconcile-prescription` | Administrator only. Body: `version`, `prescription_version`, `reason`, and explicit `allocations` mapping every `sale_item_id` to a `prescription_item_id`. Existing verified links cannot be replaced. |

Cashiers may read history. Only pharmacists/administrators can quote, correct or
record refunds. Choose the disposition explicitly:

- `not_collected`: the units never left pharmacy custody. Restore their original
  batches; expiry/archive rules still control availability. Subtract those units
  from their verified prescription lines. A cancelled prescription stays cancelled;
  otherwise its status becomes pending or partly dispensed according to its balance.
- `customer_return`: the goods came back from the customer. Record their quantities
  and credit but keep them outside usable stock for the pharmacy's return/disposal
  process. Preserve original prescription dispensing quantities and stock movements.

Credit includes original receipt discount and tax, allocated using integer largest
remainders. Cumulative partial corrections allocate each cent once and exhaust
exactly the original total. Inconsistent historical amounts, missing original
batches or unsupported clinical balances block the affected correction for review.

Refunds cannot exceed the credited amount less active recorded refunds. Legacy
voided receipts use their original total as the entitlement. Repeated active
method/reference pairs on the same receipt are rejected. Marking an entry incorrect
removes it from the active refund total and preserves its audit evidence. These
records track the pharmacy's existing external payment process; they neither send
money nor establish payment-provider reconciliation.

Earlier prescription links require review of the original dispensing records.
Every link must belong to the same prescription and drug; linked sale quantities
across receipts, less never-collected corrections, cannot exceed the recorded
dispensed balance. Reconciliation changes links and revisions only. Unknown or
inconsistent legacy status, balances or missing evidence require further records
review and remain in scope. MedApp-origin corrections and line reconciliation
save a delivery event atomically. Staff check its receipt or attention state in
the prescription's **MedApp delivery** section. Unknown patient identities require
explicit records review and are never inferred from mutable customer records.

### Sales and credit reports

Summary and daily reports expose recorded sales, credits, active refund entries
and `net_sales_cents = sales - credits` in the pharmacy currency. Each credit or
refund appears on its recorded UTC date, including days with no new sale. Refunds
settle credits and are not deducted from sales again. Voided sale receipts are
excluded. An incorrect refund entry is excluded from report totals but remains in
receipt history. Top-drug quantities subtract all corrections against receipts
in the selected period; item value is before tax and receipt discounts.

Downgrade refuses to erase any correction/refund evidence or verified dispense-line
links. Use a forward migration after these records exist. Request recovery after
route departure or browser restart remains open.
