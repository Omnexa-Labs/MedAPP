# features/profile/

Own-profile view with the signed-in account identity and saved personal details.
Signup stores DOB, gender, optional self-reported blood type and primary health goal
in `user_service`; the auth adapter restores them from `/v1/me` after login/refresh.
`PersonalDetailsCard` displays those values and labels missing fields "Not provided".
The profile's **Edit profile** button opens `/(app)/edit-patient-profile`. That route
loads a fresh `/v1/me` response before presenting the editor; first and last names
are read separately without guessing from the display name. `EditPatientProfileScreen`
edits names, DOB, gender, blood type and primary goal. Only changed fields are PATCHed;
cleared optional details use explicit null, and an empty last name supports mononyms.

Successful saves refresh the auth store and editor cache from the server response.
Failed saves preserve the draft; unsaved back navigation offers keep/discard choices.
Late saves cannot restore an account after sign-out or replace a different patient's
identity. Avatar upload, contact changes, emergency contacts and provider linking
remain separate, unfinished capabilities. Rendered and native-device acceptance is pending.
