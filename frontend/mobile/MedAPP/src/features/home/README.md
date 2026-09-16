# features/home/

Patient Home uses the established PatientShell and card/token treatment. It invites the
patient to MedAI and loads their next appointment and today's recorded sleep/steps from
the existing booking and wearable adapters. Loading, service failure and empty results
have distinct states. An error never becomes an empty schedule or a made-up reading.

Private query keys include the identity user ID and session revision. Requests and clinician
hydration carry cancellation/session guards; prefix invalidation (`appointments`, `wearables`)
still applies. Focus, app resume and pull-to-refresh refetch both independent sources. The
clock advances while mounted so ended bookings and yesterday's wellness stop appearing as current.

Quick Services opens Find Care, appointments, labs, the patient vitals timeline and medical-records
hub. Pharmacy discovery remains pending B11; its tile is non-interactive. The records hub does
not claim document upload, downloadable reports, prescribing or a completed specialist workflow.

The six Home/records/adapter/appointment suites provide behavior evidence; see
`docs/COMPLETION_BASELINE.md` for the final run and environment limits. Reference/theme/device
acceptance remains separate from component tests.
