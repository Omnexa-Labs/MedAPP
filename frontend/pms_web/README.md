# MedApp Pharmacy portal

A Next.js 16 / React 19 portal for one pharmacy's PMS deployment. Approved
MedApp owners sign in with their verified MedApp account, including authenticator
or recovery-code verification when enabled. Existing local staff can choose
**Local staff account**. MedApp-linked accounts cannot use a local password.

The portal's session flow and the admin deployment-assignment flow are implemented.
MedApp pharmacy workspace handoff/return and versioned profile/publication are
implemented. The dashboard, searchable catalog and batch receipt/adjustment/history
screens now use live PMS data. Cashiers have read-only inventory access.
Full operational and reference-screen acceptance remain in the
[completion guide](../../docs/COMPLETION_GUIDE.md).

Apply PMS migrations through `0007_medapp_delivery` before using the updated inventory
screens. Deploy the portal and PMS API together: creates/receipts/adjustments now
require a UUID request key, and edits/adjustments require the saved revision.

POS now reviews actual batch prices before recording a sale and opens a saved
receipt. Prescription creation, partial dispensing, cancellation of remaining
units and receipt corrections retain request keys during uncertain responses.
Existing transaction actions check the saved revision. Cashiers can sell
walk-in medicines; pharmacists/admins dispense and correct. Payment entries record
the pharmacy's external payment process and do not charge or refund instruments.
See the [transaction contract](../../docs/api/pms_service.md#pos-and-prescription-transaction-recovery).
Keep an uncertain form open and use **Retry same request**. Recovery after leaving
the page or restarting the browser is still pending. MedApp reports now use a
durable outbox and matching receiver acknowledgements. The prescription detail
shows queued, sending, received, retry and attention states; pharmacists/admins
can queue a versioned retry. Apply the directory migration and start the separate
worker using the [sync setup](../../docs/PHARMACY_SYNC.md). Refill fulfillment,
specialist issuing and payment-provider refunds remain open.
Receipt corrections distinguish medicines never collected from customer returns.
Only never-collected units return to original stock batches and reduce the linked
prescription's dispensed quantity; a cancelled prescription stays cancelled.
Customer returns remain outside usable stock and preserve clinical counts. Credits
retain original receipt totals and allocate original discounts/tax. Staff can record
completed external refunds against the remaining credit, and administrators can
mark an incorrect entry with a reason. No action here transfers money. Earlier
prescription receipts need explicit administrator review of their line links.
Reports separate credits from refund settlement to avoid subtracting both from sales.
See the [correction contract](../../docs/api/pms_service.md#receipt-corrections-and-completed-refund-records).
See the [inventory contract](../../docs/api/pms_service.md) for permissions,
currency/expiry rules, retry behavior and remaining operational work. In particular,
uncertain request keys survive only while their form is open; after a full reload,
check saved records/history before recording the operation again. Purchasing now
supports draft editing, marking an externally placed order, partial deliveries,
multiple batches, cancellation of unreceived quantities and recorded history.
Administrators can reconcile earlier batches with order lines; missing evidence
stays flagged for records review. Purchase writes also require replay keys and
saved revisions. The portal never sends an order to a supplier on your behalf.

## Configure and run

Use Node 24 and the checked-in dependency lockfile. From this directory:

~~~bash
npm ci
cp .env.example .env.local
npm run dev
~~~

Set the server-only values in the ignored environment file before signing in:

| Variable | Purpose |
| --- | --- |
| PMS_WEB_ORIGIN | Exact browser origin, including port; development defaults to http://127.0.0.1:3002. |
| PMS_WEB_API_URL | Trusted origin of this pharmacy's PMS, normally http://127.0.0.1:8030 locally. |
| PMS_WEB_MEDAPP_API_URL | Trusted MedApp gateway origin, normally http://127.0.0.1:8000 locally. |
| PMS_WEB_REDIS_URL | Private Redis connection for sessions and verification attempts. Required for both sign-in modes. |
| PMS_WEB_DEPLOYMENT_KEY | Exact assigned key, matching PMS_MEDAPP_DEPLOYMENT_KEY. Required for MedApp sign-in; leave blank for an unbound standalone PMS. |
| PMS_WEB_HANDOFF_SECRET | This deployment's separate 32+ character credential, matching its entry in USER_PMS_HANDOFF_DEPLOYMENTS on user_service. |
| PMS_WEB_RETURN_URIS | Exact comma-separated return destinations; defaults to medapp://pharmacy-workspaces. Match USER_PMS_RETURN_URIS. |

The portal does not use NEXT_PUBLIC_PMS_API_URL. Browser operations use finite
same-origin /api/pms routes. Service origins and signing keys belong on the
server. API origins must contain no credentials, path prefixes, query or fragment.

Start Redis, this PMS and the gateway/user service for MedApp sign-in. Apply the
[pharmacy activation contract](../../docs/api/pharmacy_service.md) first: approve
the application, assign its dedicated deployment in the admin console, then
continue account setup. The application must report active setup and the owner
must have verified their email. Do not seed shared demo staff into a MedApp-bound
PMS database. Standalone staff use accounts provisioned by their administrator.

## Session behavior

MedApp's **Pharmacy workspaces** screen lists the signed-in owner's approved,
activated pharmacy assignments. Selecting a pharmacy requests a short-lived,
single-use link bound to that pharmacy and its configured deployment. The portal
asks the owner to confirm the account, then verifies current MedApp identity and
PMS access before installing its own browser session. Another account or pharmacy
already signed into this browser must sign out first.

**Return to MedApp** closes only this browser session, then opens the saved,
allowlisted return route. The mobile session remains active. Cold and warm
returns refresh workspace access; the return marker never grants authorization.
Web MedApp uses same-tab navigation. Its exact HTTPS /pharmacy-workspaces return
address must be in both allowlists. No pharmacy secret or global PMS origin is
needed in the Expo bundle. Apply user-service migration 20260915_0011 and configure
the matching deployment maps described in the pharmacy activation contract.

- The browser receives an opaque HttpOnly, SameSite=Strict cookie. Production adds
  Secure and the __Host- prefix; serve production over HTTPS.
- MedApp access/refresh tokens, the separate PMS credential and MFA challenge stay
  in Redis. The client retains only pharmacy/staff identity and a session scope.
  Old pms_token and pms_user storage entries are removed during hydration.
- Every operation confirms current MedApp identity and PMS access. Short PMS
  credentials are renewed using the parent account. Parent refresh is serialized
  and saved before later requests. An uncertain refresh requires sign-in again.
- Sessions last at most eight hours. Local staff sessions also end when their PMS
  token expires. Role changes, account changes and sign-out clear query caches and
  remount forms. Delayed responses cannot populate a different account's cache.
- A failed or uncertain operation is never replayed automatically. Logout deletes
  its server record; a delayed logout response does not clear a newer cookie.

## Build and validation

~~~bash
npm run typecheck
npm test
npm run lint
npm run build
~~~

To include the real Redis cases, set PMS_WEB_TEST_REDIS=1 before npm test.
Those tests require Docker and create/remove their own Redis container with an
ephemeral loopback port. Other session tests substitute upstream API responses;
they do not certify live-provider consent or rendered browser/device behavior.

The Dockerfile uses Node 24 and npm ci. Its runtime listens on container port
3000; Compose maps port 3002 and supplies the server-side gateway/PMS/Redis origins.
Use npm run start behind HTTPS for production. Next's
[version 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
documents the framework/runtime changes.

## Existing operational routes

The **Pharmacy profile** page is available to the approved MedApp owner.
Apply directory migration 20260915_0004 first. Save a draft, review the saved
preview and confirm publication to make it visible to patients. Withdrawal
keeps the draft. Contact details, seven-day hours, services, pharmacist biography
and a pharmacy photo are editable; licensing and ownership stay read-only.
Choose a still JPEG, PNG or WebP up to 8 MB and 20 million pixels. Save other
edits before **Upload to draft**, review the saved preview and publish separately.
**Remove draft photo** takes effect on the saved draft after **Save draft**;
patients keep seeing the current photo until you publish the removal or withdraw.
Selections and text edits remain available after errors. An uncertain upload
requires a confirmed reload before another write. Preview requests use the
current session scope; original image files are not sent to third-party hosts.

On pharmacy_service set `PHARMACY_PUBLIC_API_ORIGIN` to the public HTTPS gateway
origin reachable by patient devices. The local default is `http://localhost:8000`.
The service stores bounded, normalized photo bytes with the draft in PostgreSQL;
include them in database backups. No extra storage secret is needed. See
the [photo contract](../../docs/api/pharmacy_service.md#managed-pharmacy-photos)
for formats, retention and publication access checks. Existing hosted URLs remain
readable until replaced; the editor no longer asks owners to supply image URLs.

Changing the draft leaves published details unchanged. If another session edits
the profile or the outcome of a write is uncertain, reload explicitly before
writing again. Inputs remain available until you confirm discarding them.
The page includes current-public details and a record of changes. Publishing
directory information does not add operational services, delivery, bookings or
practitioner verification.

Dashboard, inventory, batches, suppliers, purchase orders, prescriptions,
point of sale, customers, sales, reports and staff retain their existing PMS API
adapters. Settings now shows the verified pharmacy and signed-in account.
The sidebar limits administrator links; backend permissions enforce access.
Operational/reference, empty/error, responsive and theme acceptance remains
separate from the completed sign-in and deployment assignment software checks.
