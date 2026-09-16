# Practitioner features

This folder contains the patient-facing public clinician profile and reusable
parts of the specialist experience. It is not proof that all specialist screens
or role checks are complete; follow B03–B06 in the completion guide.

`PractitionerTelehealthProfileScreen` loads a doctor, nurse or pharmacist from its
single-resource directory endpoint. Route parameters identify the resource; the
saved profile supplies its name, biography, specialties, languages and fee. The
screen handles loading, missing profiles, retry and pull-to-refresh. Requests are
scoped to the active account because the gateway requires authentication.

Only active, listed doctors are offered the booking action. Nurse/pharmacist IDs
are never forwarded as booking doctor IDs. Missing biographies and unavailable
reviews have explicit states; the screen does not assert verified qualifications,
ratings, presence or a consultation duration without a supporting contract.

The B03 professional editor now loads the signed-in doctor or nurse through
`/v1/doctors/me` or `/v1/nurses/me`, preserving the distinction between user ID and
profile ID. It saves changed name/specialty/biography/language/listing fields,
previews drafts, prevents accidental discards and cancels pending edits on
unmount/account change. Doctor consulting-hour readback and account/sign-out
access are retained. Doctor home has a self-profile/role entry check and scoped
queries. This is groundwork, not completed specialist navigation or dashboards.

Credential verification, photo uploads, fee/currency controls, affiliations,
availability editing, onboarding provisioning, partner operations and full
reference/device acceptance remain tracked. `PractitionerSocialProfileScreen`
still needs real content and reference reconciliation.
See [the completion guide](../../../../../../docs/COMPLETION_GUIDE.md) and
[the screen inventory](../../../../../../docs/SCREEN_INVENTORY.md).
