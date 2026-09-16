# MedApp screen inventory

Updated: 2026-09-16. Execution order and acceptance criteria: [COMPLETION_GUIDE.md](COMPLETION_GUIDE.md). Structured tracking: [SCREEN_INVENTORY.json](SCREEN_INVENTORY.json).

## Reading the register

- **76 patient-facing + 32 specialist-facing = 108 screen references.** All 109 source HTML files are accounted for; the remaining file is an animation asset.
- All specialist entries started **not implemented**, as confirmed by the product owner. S-001 through S-005 now have partial implementation evidence; all remain unaccepted. A route in the reuse column alone does not change a status.
- Patient entries distinguish related existing code, confirmed partial behavior, and references that still need reconciliation. No entry is accepted by this planning pass.
- Every row's API and QA status starts **not verified**. Use the JSON register's `accepted`, `acceptance_evidence`, `disposition`, and `covered_by_id` fields to record progress and approved variant coverage.
- Reuse links identify related code to inspect. Several variants can map to one route; the link does not prove that the specific variant is already implemented.
- **†** marks a specialist reference physically stored in the patient folder. Grouping follows the user's role and screen actions. The source files have not moved.
- Keep these IDs stable. New references receive new IDs; existing entries must not be renumbered or silently deleted.

## 1. Patient-facing screens (76)

### P01 — Access and onboarding (5)

Complete recovery, verification, social sign-in, legal links, and session recovery using the existing authentication screens.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| P-001 | [login](<../UI_screens/Patient_facing_screens/login/code.html>) · [image](<../UI_screens/Patient_facing_screens/login/progress1.png>) · [image 2](<../UI_screens/Patient_facing_screens/login/progress2.png>) · [image 3](<../UI_screens/Patient_facing_screens/login/progress3.png>) · [image 4](<../UI_screens/Patient_facing_screens/login/screen.png>) | Existing code — verify | [(public)/sign-in.tsx](<../frontend/mobile/MedAPP/src/app/(public)/sign-in.tsx>) | B01 |
| P-002 | [sign_up_create_account](<../UI_screens/Patient_facing_screens/sign_up_create_account/code.html>) · [image](<../UI_screens/Patient_facing_screens/sign_up_create_account/screen.png>) | Existing code — verify | [(public)/sign-up.tsx](<../frontend/mobile/MedAPP/src/app/(public)/sign-up.tsx>) | B01 |
| P-003 | [sign_up_personal_details](<../UI_screens/Patient_facing_screens/sign_up_personal_details/code.html>) · [image](<../UI_screens/Patient_facing_screens/sign_up_personal_details/screen.png>) | Existing code — verify | [(public)/sign-up-step-2.tsx](<../frontend/mobile/MedAPP/src/app/(public)/sign-up-step-2.tsx>) | B01 |
| P-004 | [sign_up_security_setup](<../UI_screens/Patient_facing_screens/sign_up_security_setup/code.html>) · [image](<../UI_screens/Patient_facing_screens/sign_up_security_setup/screen.png>) | Existing code — verify | [(public)/sign-up-step-3.tsx](<../frontend/mobile/MedAPP/src/app/(public)/sign-up-step-3.tsx>) | B01 |
| P-005 | [splash_screen](<../UI_screens/Patient_facing_screens/splash_screen/code.html>) · [image](<../UI_screens/Patient_facing_screens/splash_screen/screen.png>) | Existing code — verify | [(public)/splash.tsx](<../frontend/mobile/MedAPP/src/app/(public)/splash.tsx>) | B01 |

### P02 — Home and personal profile (6)

Finish the new-user and active-care states, profile editing, summaries, and navigation with real account data.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| P-006 | [patient_dashboard](<../UI_screens/Patient_facing_screens/patient_dashboard/code.html>) · [image](<../UI_screens/Patient_facing_screens/patient_dashboard/screen.png>) | Existing code — verify | [(app)/index.tsx](<../frontend/mobile/MedAPP/src/app/(app)/index.tsx>) | B01 |
| P-007 | [patient_home_active_care_focus](<../UI_screens/Patient_facing_screens/patient_home_active_care_focus/code.html>) · [image](<../UI_screens/Patient_facing_screens/patient_home_active_care_focus/screen.png>) | Existing code — verify | [(app)/index.tsx](<../frontend/mobile/MedAPP/src/app/(app)/index.tsx>) | B01 |
| P-008 | [patient_home_new_user_experience_updated_nav](<../UI_screens/Patient_facing_screens/patient_home_new_user_experience_updated_nav/code.html>) · [image](<../UI_screens/Patient_facing_screens/patient_home_new_user_experience_updated_nav/screen.png>) | Existing code — verify | [(app)/index.tsx](<../frontend/mobile/MedAPP/src/app/(app)/index.tsx>) | B01 |
| P-009 | [patient_home_premium_refinement_updated_nav](<../UI_screens/Patient_facing_screens/patient_home_premium_refinement_updated_nav/code.html>) · [image](<../UI_screens/Patient_facing_screens/patient_home_premium_refinement_updated_nav/screen.png>) | Existing code — verify | [(app)/index.tsx](<../frontend/mobile/MedAPP/src/app/(app)/index.tsx>) | B01 |
| P-010 | [patient_profile_overview](<../UI_screens/Patient_facing_screens/patient_profile_overview/code.html>) · [image](<../UI_screens/Patient_facing_screens/patient_profile_overview/screen.png>) | Existing code — verify | [(app)/patient-profile-overview.tsx](<../frontend/mobile/MedAPP/src/app/(app)/patient-profile-overview.tsx>) | B01 |
| P-011 | [patient_profile_with_trends](<../UI_screens/Patient_facing_screens/patient_profile_with_trends/code.html>) · [image](<../UI_screens/Patient_facing_screens/patient_profile_with_trends/screen.png>) | Existing code — verify | [(app)/patient-profile-overview.tsx](<../frontend/mobile/MedAPP/src/app/(app)/patient-profile-overview.tsx>) | B01 |

### P03 — Find care and booking (12)

Complete directory variants, provider profiles, hospital departments, authoritative slots, booking, cancellation, and rescheduling.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| P-012 | [appointment_management](<../UI_screens/Patient_facing_screens/appointment_management/code.html>) · [image](<../UI_screens/Patient_facing_screens/appointment_management/screen.png>) | Existing code — verify | [(app)/appointments.tsx](<../frontend/mobile/MedAPP/src/app/(app)/appointments.tsx>) | B02 |
| P-013 | [booking_confirmed](<../UI_screens/Patient_facing_screens/booking_confirmed/code.html>) · [image](<../UI_screens/Patient_facing_screens/booking_confirmed/screen.png>) | Existing code — verify | [(app)/booking-confirmed.tsx](<../frontend/mobile/MedAPP/src/app/(app)/booking-confirmed.tsx>) | B02 |
| P-014 | [contacts_directory_standardized_nav](<../UI_screens/Patient_facing_screens/contacts_directory_standardized_nav/code.html>) · [image](<../UI_screens/Patient_facing_screens/contacts_directory_standardized_nav/screen.png>) | Existing code — verify | [(app)/find-care.tsx](<../frontend/mobile/MedAPP/src/app/(app)/find-care.tsx>) | B02 |
| P-015 | [doctor_profile](<../UI_screens/Patient_facing_screens/doctor_profile/code.html>) · [image](<../UI_screens/Patient_facing_screens/doctor_profile/screen.png>) | Existing code — verify | [(app)/practitioner-telehealth-profile.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-telehealth-profile.tsx>) | B02 |
| P-016 | [find_care_advanced_directory](<../UI_screens/Patient_facing_screens/find_care_advanced_directory/code.html>) · [image](<../UI_screens/Patient_facing_screens/find_care_advanced_directory/screen.png>) | Existing code — verify | [(app)/find-care.tsx](<../frontend/mobile/MedAPP/src/app/(app)/find-care.tsx>) | B02 |
| P-017 | [find_care_blue_theme_standardized_nav](<../UI_screens/Patient_facing_screens/find_care_blue_theme_standardized_nav/code.html>) · [image](<../UI_screens/Patient_facing_screens/find_care_blue_theme_standardized_nav/screen.png>) | Existing code — verify | [(app)/find-care.tsx](<../frontend/mobile/MedAPP/src/app/(app)/find-care.tsx>) | B02 |
| P-018 | [find_care_enhanced_directory_updated_nav](<../UI_screens/Patient_facing_screens/find_care_enhanced_directory_updated_nav/code.html>) · [image](<../UI_screens/Patient_facing_screens/find_care_enhanced_directory_updated_nav/screen.png>) | Existing code — verify | [(app)/find-care.tsx](<../frontend/mobile/MedAPP/src/app/(app)/find-care.tsx>) | B02 |
| P-019 | [hospital_department_directory](<../UI_screens/Patient_facing_screens/hospital_department_directory/code.html>) · [image](<../UI_screens/Patient_facing_screens/hospital_department_directory/screen.png>) | Existing code — verify | [(app)/hospital-detail.tsx](<../frontend/mobile/MedAPP/src/app/(app)/hospital-detail.tsx>) | B02 |
| P-020 | [review_appointment](<../UI_screens/Patient_facing_screens/review_appointment/code.html>) · [image](<../UI_screens/Patient_facing_screens/review_appointment/screen.png>) | Existing code — verify | [(app)/review-appointment.tsx](<../frontend/mobile/MedAPP/src/app/(app)/review-appointment.tsx>) | B02 |
| P-021 | [select_time_consultation_type](<../UI_screens/Patient_facing_screens/select_time_consultation_type/code.html>) · [image](<../UI_screens/Patient_facing_screens/select_time_consultation_type/screen.png>) | Existing code — verify | [(app)/select-time-slot.tsx](<../frontend/mobile/MedAPP/src/app/(app)/select-time-slot.tsx>) | B02 |
| P-022 | [specialist_profile](<../UI_screens/Patient_facing_screens/specialist_profile/code.html>) · [image](<../UI_screens/Patient_facing_screens/specialist_profile/screen.png>) | Existing code — verify | [(app)/practitioner-social-profile.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-social-profile.tsx>) | B02 |
| P-023 | [specialist_profile_with_detailed_reviews](<../UI_screens/Patient_facing_screens/specialist_profile_with_detailed_reviews/code.html>) · [image](<../UI_screens/Patient_facing_screens/specialist_profile_with_detailed_reviews/screen.png>) | Existing code — verify | [(app)/practitioner-telehealth-profile.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-telehealth-profile.tsx>) | B02 |

### P04 — Patient messages and consultations (6)

Complete persistent messages, attachments, consented record sharing, waiting-room checks, and a real two-party consultation.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| P-024 | [clinical_consultation_hub_rich_data_sharing](<../UI_screens/Patient_facing_screens/clinical_consultation_hub_rich_data_sharing/code.html>) · [image](<../UI_screens/Patient_facing_screens/clinical_consultation_hub_rich_data_sharing/screen.png>) | Existing code — verify | [(app)/chat-thread.tsx](<../frontend/mobile/MedAPP/src/app/(app)/chat-thread.tsx>) | B06 |
| P-025 | [clinical_consultation_refined_messaging_sharing](<../UI_screens/Patient_facing_screens/clinical_consultation_refined_messaging_sharing/code.html>) · [image](<../UI_screens/Patient_facing_screens/clinical_consultation_refined_messaging_sharing/screen.png>) | Existing code — verify | [(app)/chat-thread.tsx](<../frontend/mobile/MedAPP/src/app/(app)/chat-thread.tsx>) | B06 |
| P-026 | [messages_overview](<../UI_screens/Patient_facing_screens/messages_overview/code.html>) · [image](<../UI_screens/Patient_facing_screens/messages_overview/screen.png>) | Existing code — verify | [(app)/inbox.tsx](<../frontend/mobile/MedAPP/src/app/(app)/inbox.tsx>) | B06 |
| P-027 | [messages_overview_standardized_nav](<../UI_screens/Patient_facing_screens/messages_overview_standardized_nav/code.html>) · [image](<../UI_screens/Patient_facing_screens/messages_overview_standardized_nav/screen.png>) | Existing code — verify | [(app)/inbox.tsx](<../frontend/mobile/MedAPP/src/app/(app)/inbox.tsx>) | B06 |
| P-028 | [telemedicine_consultation](<../UI_screens/Patient_facing_screens/telemedicine_consultation/code.html>) · [image](<../UI_screens/Patient_facing_screens/telemedicine_consultation/screen.png>) | Partial — no video transport | [(app)/telemedicine-consultation.tsx](<../frontend/mobile/MedAPP/src/app/(app)/telemedicine-consultation.tsx>) | B06 |
| P-029 | [waiting_room](<../UI_screens/Patient_facing_screens/waiting_room/code.html>) · [image](<../UI_screens/Patient_facing_screens/waiting_room/screen.png>) | Existing code — verify | [(app)/waiting-room.tsx](<../frontend/mobile/MedAPP/src/app/(app)/waiting-room.tsx>) | B06 |

### P05 — Records, labs, and reports (9)

Complete history, uploads, lab detail, trends, report preview/export, and access controls using persisted records.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| P-030 | [export_settings](<../UI_screens/Patient_facing_screens/export_settings/code.html>) · [image](<../UI_screens/Patient_facing_screens/export_settings/screen.png>) | Existing code — verify | [(app)/overview.tsx](<../frontend/mobile/MedAPP/src/app/(app)/overview.tsx>) | B07 |
| P-031 | [lab_result_detail](<../UI_screens/Patient_facing_screens/lab_result_detail/code.html>) · [image](<../UI_screens/Patient_facing_screens/lab_result_detail/screen.png>) | Existing code — verify | [(app)/lab-results.tsx](<../frontend/mobile/MedAPP/src/app/(app)/lab-results.tsx>) | B07 |
| P-032 | [medical_history](<../UI_screens/Patient_facing_screens/medical_history/code.html>) · [image](<../UI_screens/Patient_facing_screens/medical_history/screen.png>) | Existing code — verify | [(app)/overview.tsx](<../frontend/mobile/MedAPP/src/app/(app)/overview.tsx>) | B07 |
| P-033 | [medical_records_overview](<../UI_screens/Patient_facing_screens/medical_records_overview/code.html>) · [image](<../UI_screens/Patient_facing_screens/medical_records_overview/screen.png>) | Existing code — verify | [(app)/medical-records.tsx](<../frontend/mobile/MedAPP/src/app/(app)/medical-records.tsx>) | B07 |
| P-034 | [report_preview](<../UI_screens/Patient_facing_screens/report_preview/code.html>) · [image](<../UI_screens/Patient_facing_screens/report_preview/screen.png>) | Existing code — verify | [(app)/overview.tsx](<../frontend/mobile/MedAPP/src/app/(app)/overview.tsx>) | B07 |
| P-035 | [report_preview_with_detailed_charts](<../UI_screens/Patient_facing_screens/report_preview_with_detailed_charts/code.html>) · [image](<../UI_screens/Patient_facing_screens/report_preview_with_detailed_charts/screen.png>) | Existing code — verify | [(app)/overview.tsx](<../frontend/mobile/MedAPP/src/app/(app)/overview.tsx>) | B07 |
| P-036 | [report_preview_with_health_trends](<../UI_screens/Patient_facing_screens/report_preview_with_health_trends/code.html>) · [image](<../UI_screens/Patient_facing_screens/report_preview_with_health_trends/screen.png>) | Existing code — verify | [(app)/overview.tsx](<../frontend/mobile/MedAPP/src/app/(app)/overview.tsx>) | B07 |
| P-037 | [upload_medical_record](<../UI_screens/Patient_facing_screens/upload_medical_record/code.html>) · [image](<../UI_screens/Patient_facing_screens/upload_medical_record/screen.png>) | Reference — reconcile | No direct mobile route mapped | B07 |
| P-038 | [vitals_timeline](<../UI_screens/Patient_facing_screens/vitals_timeline/code.html>) · [image](<../UI_screens/Patient_facing_screens/vitals_timeline/screen.png>) | Existing code — verify | [(app)/vitals-timeline.tsx](<../frontend/mobile/MedAPP/src/app/(app)/vitals-timeline.tsx>) | B07 |

### P06 — Medications and prescriptions (13)

Replace samples with patient-owned medication/prescription/adherence data; finish scan verification, prescription sharing, and interaction checking.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| P-039 | [active_medications](<../UI_screens/Patient_facing_screens/active_medications/code.html>) · [image](<../UI_screens/Patient_facing_screens/active_medications/screen.png>) | Partial — sample data | [(app)/active-medications.tsx](<../frontend/mobile/MedAPP/src/app/(app)/active-medications.tsx>) | B08 |
| P-040 | [add_medication_smart_scan_flow](<../UI_screens/Patient_facing_screens/add_medication_smart_scan_flow/code.html>) · [image](<../UI_screens/Patient_facing_screens/add_medication_smart_scan_flow/screen.png>) | Existing code — verify | [(app)/add-medication.tsx](<../frontend/mobile/MedAPP/src/app/(app)/add-medication.tsx>) | B08 |
| P-041 | [advanced_medication_timeline_tracker](<../UI_screens/Patient_facing_screens/advanced_medication_timeline_tracker/code.html>) · [image](<../UI_screens/Patient_facing_screens/advanced_medication_timeline_tracker/screen.png>) | Partial — sample data | [(app)/medication-tracker.tsx](<../frontend/mobile/MedAPP/src/app/(app)/medication-tracker.tsx>) | B08 |
| P-042 | [digital_prescription_view](<../UI_screens/Patient_facing_screens/digital_prescription_view/code.html>) · [image](<../UI_screens/Patient_facing_screens/digital_prescription_view/screen.png>) | Existing code — verify | [(app)/active-script-view.tsx](<../frontend/mobile/MedAPP/src/app/(app)/active-script-view.tsx>) | B08 |
| P-043 | [full_prescription_history](<../UI_screens/Patient_facing_screens/full_prescription_history/code.html>) · [image](<../UI_screens/Patient_facing_screens/full_prescription_history/screen.png>) | Partial — sample data | [(app)/prescription-history.tsx](<../frontend/mobile/MedAPP/src/app/(app)/prescription-history.tsx>) | B08 |
| P-044 | [health_command_center_with_integrated_prescriptions](<../UI_screens/Patient_facing_screens/health_command_center_with_integrated_prescriptions/code.html>) · [image](<../UI_screens/Patient_facing_screens/health_command_center_with_integrated_prescriptions/screen.png>) | Existing code — verify | [(app)/overview.tsx](<../frontend/mobile/MedAPP/src/app/(app)/overview.tsx>) | B08 |
| P-045 | [medication_detail](<../UI_screens/Patient_facing_screens/medication_detail/code.html>) · [image](<../UI_screens/Patient_facing_screens/medication_detail/screen.png>) | Partial — sample data | [(app)/medication-details.tsx](<../frontend/mobile/MedAPP/src/app/(app)/medication-details.tsx>) | B08 |
| P-046 | [medication_interaction_checker](<../UI_screens/Patient_facing_screens/medication_interaction_checker/code.html>) · [image](<../UI_screens/Patient_facing_screens/medication_interaction_checker/screen.png>) | Reference — reconcile | No direct mobile route mapped | B08 |
| P-047 | [medication_tracker_1](<../UI_screens/Patient_facing_screens/medication_tracker_1/code.html>) · [image](<../UI_screens/Patient_facing_screens/medication_tracker_1/screen.png>) | Partial — sample data | [(app)/medication-tracker.tsx](<../frontend/mobile/MedAPP/src/app/(app)/medication-tracker.tsx>) | B08 |
| P-048 | [medication_tracker_2](<../UI_screens/Patient_facing_screens/medication_tracker_2/code.html>) · [image](<../UI_screens/Patient_facing_screens/medication_tracker_2/screen.png>) | Partial — sample data | [(app)/medication-tracker.tsx](<../frontend/mobile/MedAPP/src/app/(app)/medication-tracker.tsx>) | B08 |
| P-049 | [new_prescription_received](<../UI_screens/Patient_facing_screens/new_prescription_received/code.html>) · [image](<../UI_screens/Patient_facing_screens/new_prescription_received/screen.png>) | Partial — sample data | [(app)/new-prescription.tsx](<../frontend/mobile/MedAPP/src/app/(app)/new-prescription.tsx>) | B08 |
| P-050 | [prescription_sharing_hub](<../UI_screens/Patient_facing_screens/prescription_sharing_hub/code.html>) · [image](<../UI_screens/Patient_facing_screens/prescription_sharing_hub/screen.png>) | Existing code — verify | [(app)/active-script-share.tsx](<../frontend/mobile/MedAPP/src/app/(app)/active-script-share.tsx>) | B08 |
| P-051 | [smart_scan_preview_verification](<../UI_screens/Patient_facing_screens/smart_scan_preview_verification/code.html>) · [image](<../UI_screens/Patient_facing_screens/smart_scan_preview_verification/screen.png>) | Existing code — verify | [(app)/medication-scan.tsx](<../frontend/mobile/MedAPP/src/app/(app)/medication-scan.tsx>) | B08 |

### P07 — Lifestyle (3)

Define persisted lifestyle data, save daily entries, restore them across sessions, and derive summaries from saved entries.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| P-052 | [lifestyle_hub](<../UI_screens/Patient_facing_screens/lifestyle_hub/code.html>) · [image](<../UI_screens/Patient_facing_screens/lifestyle_hub/screen.png>) | Existing code — verify | [(app)/lifestyle.tsx](<../frontend/mobile/MedAPP/src/app/(app)/lifestyle.tsx>) | B09 |
| P-053 | [lifestyle_hub_with_medication_tracking](<../UI_screens/Patient_facing_screens/lifestyle_hub_with_medication_tracking/code.html>) · [image](<../UI_screens/Patient_facing_screens/lifestyle_hub_with_medication_tracking/screen.png>) | Existing code — verify | [(app)/lifestyle.tsx](<../frontend/mobile/MedAPP/src/app/(app)/lifestyle.tsx>) | B09 |
| P-054 | [lifestyle_management_with_save_close](<../UI_screens/Patient_facing_screens/lifestyle_management_with_save_close/code.html>) · [image](<../UI_screens/Patient_facing_screens/lifestyle_management_with_save_close/screen.png>) | Partial — not saved | [(app)/lifestyle-manage.tsx](<../frontend/mobile/MedAPP/src/app/(app)/lifestyle-manage.tsx>) | B09 |

### P08 — Connected devices (4)

Complete selection, consent, connection, sync progress/success/failure, disconnect, and actual supported-device ingestion.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| P-055 | [smart_sync_connect_devices](<../UI_screens/Patient_facing_screens/smart_sync_connect_devices/code.html>) · [image](<../UI_screens/Patient_facing_screens/smart_sync_connect_devices/screen.png>) | Existing code — verify | [(app)/connect-devices.tsx](<../frontend/mobile/MedAPP/src/app/(app)/connect-devices.tsx>) | B09 |
| P-056 | [sync_complete_success_state](<../UI_screens/Patient_facing_screens/sync_complete_success_state/code.html>) · [image](<../UI_screens/Patient_facing_screens/sync_complete_success_state/screen.png>) | Existing code — verify | [(app)/connect-devices.tsx](<../frontend/mobile/MedAPP/src/app/(app)/connect-devices.tsx>) | B09 |
| P-057 | [sync_preferences_data_selection](<../UI_screens/Patient_facing_screens/sync_preferences_data_selection/code.html>) · [image](<../UI_screens/Patient_facing_screens/sync_preferences_data_selection/screen.png>) | Existing code — verify | [(app)/connect-devices.tsx](<../frontend/mobile/MedAPP/src/app/(app)/connect-devices.tsx>) | B09 |
| P-058 | [syncing_health_data_progress_state](<../UI_screens/Patient_facing_screens/syncing_health_data_progress_state/code.html>) · [image](<../UI_screens/Patient_facing_screens/syncing_health_data_progress_state/screen.png>) | Existing code — verify | [(app)/connect-devices.tsx](<../frontend/mobile/MedAPP/src/app/(app)/connect-devices.tsx>) | B09 |

### P09 — AI, discovery, and community (7)

Complete AI conversations, Q&A, feed, group membership, content discovery, and their author/moderation counterparts.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| P-059 | [ai_health_assistant](<../UI_screens/Patient_facing_screens/ai_health_assistant/code.html>) · [image](<../UI_screens/Patient_facing_screens/ai_health_assistant/screen.png>) | Existing code — verify | [(app)/ai-assistant.tsx](<../frontend/mobile/MedAPP/src/app/(app)/ai-assistant.tsx>) | B10 |
| P-060 | [community_hub_with_group_management](<../UI_screens/Patient_facing_screens/community_hub_with_group_management/code.html>) · [image](<../UI_screens/Patient_facing_screens/community_hub_with_group_management/screen.png>) | Existing code — verify | [(app)/community.tsx](<../frontend/mobile/MedAPP/src/app/(app)/community.tsx>) | B10 |
| P-061 | [explore_discovery_directory_updated_actions](<../UI_screens/Patient_facing_screens/explore_discovery_directory_updated_actions/code.html>) · [image](<../UI_screens/Patient_facing_screens/explore_discovery_directory_updated_actions/screen.png>) | Existing code — verify | [(app)/community.tsx](<../frontend/mobile/MedAPP/src/app/(app)/community.tsx>) | B10 |
| P-062 | [health_groups](<../UI_screens/Patient_facing_screens/health_groups/code.html>) · [image](<../UI_screens/Patient_facing_screens/health_groups/screen.png>) | Existing code — verify | [(app)/community.tsx](<../frontend/mobile/MedAPP/src/app/(app)/community.tsx>) | B10 |
| P-063 | [private_q_a](<../UI_screens/Patient_facing_screens/private_q_a/code.html>) · [image](<../UI_screens/Patient_facing_screens/private_q_a/screen.png>) | Existing code — verify | [(app)/ask-a-doctor.tsx](<../frontend/mobile/MedAPP/src/app/(app)/ask-a-doctor.tsx>) | B10 |
| P-064 | [production_community_hub](<../UI_screens/Patient_facing_screens/production_community_hub/code.html>) · [image](<../UI_screens/Patient_facing_screens/production_community_hub/screen.png>) | Existing code — verify | [(app)/community.tsx](<../frontend/mobile/MedAPP/src/app/(app)/community.tsx>) | B10 |
| P-065 | [production_social_feed_for_you](<../UI_screens/Patient_facing_screens/production_social_feed_for_you/code.html>) · [image](<../UI_screens/Patient_facing_screens/production_social_feed_for_you/screen.png>) | Existing code — verify | [(app)/community.tsx](<../frontend/mobile/MedAPP/src/app/(app)/community.tsx>) | B10 |

### P10 — Pharmacy discovery and orders (4)

Complete pharmacy lookup and the reference order/delivery flow after defining fulfillment ownership and provider integrations.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| P-066 | [pharmacy_hub](<../UI_screens/Patient_facing_screens/pharmacy_hub/code.html>) · [image](<../UI_screens/Patient_facing_screens/pharmacy_hub/screen.png>) | Existing code — verify | [(app)/find-care.tsx](<../frontend/mobile/MedAPP/src/app/(app)/find-care.tsx>) | B11 |
| P-067 | [pharmacy_profile](<../UI_screens/Patient_facing_screens/pharmacy_profile/code.html>) · [image](<../UI_screens/Patient_facing_screens/pharmacy_profile/screen.png>) | Existing code — verify | [(app)/pharmacy-detail.tsx](<../frontend/mobile/MedAPP/src/app/(app)/pharmacy-detail.tsx>) | B11 |
| P-068 | [review_order](<../UI_screens/Patient_facing_screens/review_order/code.html>) · [image](<../UI_screens/Patient_facing_screens/review_order/screen.png>) | Reference — reconcile | No direct mobile route mapped | B11 |
| P-069 | [track_delivery](<../UI_screens/Patient_facing_screens/track_delivery/code.html>) · [image](<../UI_screens/Patient_facing_screens/track_delivery/screen.png>) | Reference — reconcile | No direct mobile route mapped | B11 |

### P11 — Settings, support, and billing (7)

Complete account/security/support first, persistent notification preferences with follow-up work, and billing with the commerce contract.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| P-070 | [contact_us](<../UI_screens/Patient_facing_screens/contact_us/code.html>) · [image](<../UI_screens/Patient_facing_screens/contact_us/screen.png>) | Reference — reconcile | No direct mobile route mapped | B01 / B09 / B11 |
| P-071 | [help_center](<../UI_screens/Patient_facing_screens/help_center/code.html>) · [image](<../UI_screens/Patient_facing_screens/help_center/screen.png>) | Reference — reconcile | No direct mobile route mapped | B01 / B09 / B11 |
| P-072 | [insurance_billing](<../UI_screens/Patient_facing_screens/insurance_billing/code.html>) · [image](<../UI_screens/Patient_facing_screens/insurance_billing/screen.png>) | Existing code — verify | [(app)/settings.tsx](<../frontend/mobile/MedAPP/src/app/(app)/settings.tsx>) | B01 / B09 / B11 |
| P-073 | [interaction_history](<../UI_screens/Patient_facing_screens/interaction_history/code.html>) · [image](<../UI_screens/Patient_facing_screens/interaction_history/screen.png>) | Reference — reconcile | No direct mobile route mapped | B01 / B09 / B11 |
| P-074 | [notification_preferences](<../UI_screens/Patient_facing_screens/notification_preferences/code.html>) · [image](<../UI_screens/Patient_facing_screens/notification_preferences/screen.png>) | Existing code — verify | [(app)/settings.tsx](<../frontend/mobile/MedAPP/src/app/(app)/settings.tsx>) | B01 / B09 / B11 |
| P-075 | [security_privacy](<../UI_screens/Patient_facing_screens/security_privacy/code.html>) · [image](<../UI_screens/Patient_facing_screens/security_privacy/screen.png>) | Existing code — verify | [(app)/security-privacy.tsx](<../frontend/mobile/MedAPP/src/app/(app)/security-privacy.tsx>) | B01 / B09 / B11 |
| P-076 | [settings_hub](<../UI_screens/Patient_facing_screens/settings_hub/code.html>) · [image](<../UI_screens/Patient_facing_screens/settings_hub/screen.png>) | Existing code — verify | [(app)/settings.tsx](<../frontend/mobile/MedAPP/src/app/(app)/settings.tsx>) | B01 / B09 / B11 |

### Additional patient/shared application routes

These application routes are retained in scope even though no one-to-one reference mapping was established. They do not increase the count of local screen references. Shared authentication and launch routes also support specialist entry.

| Route | Module | Batch | Completion check |
| --- | --- | --- | --- |
| [index.tsx](<../frontend/mobile/MedAPP/src/app/index.tsx>) | P01 | B01 | Shared launch/auth routing; verify both patient and professional landing destinations. |
| [(app)/edit-patient-profile.tsx](<../frontend/mobile/MedAPP/src/app/(app)/edit-patient-profile.tsx>) | P02 | B01 | Profile persistence and focused software checks pass; reference/device acceptance remains pending. |
| [(app)/active-sessions.tsx](<../frontend/mobile/MedAPP/src/app/(app)/active-sessions.tsx>) | P11 | B01 | Session-family listing/revocation verified through the gateway and PostgreSQL; reference/device acceptance remains pending. |
| [(app)/two-factor.tsx](<../frontend/mobile/MedAPP/src/app/(app)/two-factor.tsx>) | P11 | B01 | Authenticator setup, recovery and disable verified in software and through the gateway; production key and rendered/device acceptance remain pending. |
| [(app)/care-team-sharing.tsx](<../frontend/mobile/MedAPP/src/app/(app)/care-team-sharing.tsx>) | P11 | B01 | Named doctor/nurse EHR read/add-vitals permissions, expiry and revocation history verified in software and through the gateway/PostgreSQL. Rendered/device acceptance and cross-service clinical sharing remain pending. |
| [(app)/notifications.tsx](<../frontend/mobile/MedAPP/src/app/(app)/notifications.tsx>) | P11 | B09 | Existing notifications route; finish inbox/preferences and follow-up integration. |
| [(app)/post-detail.tsx](<../frontend/mobile/MedAPP/src/app/(app)/post-detail.tsx>) | P09 | B10 | Existing post-detail route; verify publishing-to-reading and interaction behavior. |
| [(app)/saved-posts.tsx](<../frontend/mobile/MedAPP/src/app/(app)/saved-posts.tsx>) | P09 | B10 | Existing saved-posts route; verify save/remove, refresh, and empty/error behavior. |
| [(public)/forgot-password.tsx](<../frontend/mobile/MedAPP/src/app/(public)/forgot-password.tsx>) | P01 | B01 | Recovery form and SMTP integration implemented. Real gateway/mail/reset checks pass locally; rendered and native-device QA remain pending. Not accepted yet. |
| [(public)/privacy.tsx](<../frontend/mobile/MedAPP/src/app/(public)/privacy.tsx>) | P01 | B01 | Verify legal content, links, and navigation. |
| [(public)/sign-up-verify.tsx](<../frontend/mobile/MedAPP/src/app/(public)/sign-up-verify.tsx>) | P01 | B01 | Email verification implemented with separate expiry/resend timers and retry/error states. Gateway, local SMTP and verified account creation pass. Rendered and native-device QA remain pending. Not accepted yet. |
| [(public)/terms.tsx](<../frontend/mobile/MedAPP/src/app/(public)/terms.tsx>) | P01 | B01 | Verify legal content, links, and navigation. |

### Additional patient reference material

These six HTML references map to existing inventory entries and are not counted again.

| Supplemental reference | Screen ID |
| --- | --- |
| [.stitch-html/1-select-time.html](<../.stitch-html/1-select-time.html>) | P-021 |
| [.stitch-html/2-review-appointment.html](<../.stitch-html/2-review-appointment.html>) | P-020 |
| [.stitch-html/3-booking-confirmed.html](<../.stitch-html/3-booking-confirmed.html>) | P-013 |
| [.stitch-html/4-appointment-mgmt.html](<../.stitch-html/4-appointment-mgmt.html>) | P-012 |
| [.stitch-html/5-waiting-room.html](<../.stitch-html/5-waiting-room.html>) | P-029 |
| [.stitch-html/6-telemedicine.html](<../.stitch-html/6-telemedicine.html>) | P-028 |

Supporting patient assets below are retained as design material, not additional application routes.

- [animated_svg/code.html](<../UI_screens/Patient_facing_screens/animated_svg/code.html>)
- [a_high_quality_3d_medical_icon_showing_a_smartphone_camera_viewfinder_scanning/screen.png](<../UI_screens/Patient_facing_screens/a_high_quality_3d_medical_icon_showing_a_smartphone_camera_viewfinder_scanning/screen.png>)
- [clean_minimalist_illustration_of_a_person_sleeping_peacefully_representing/screen.png](<../UI_screens/Patient_facing_screens/clean_minimalist_illustration_of_a_person_sleeping_peacefully_representing/screen.png>)
- [high_quality_3d_icon_of_a_smartwatch_and_a_health_heart_symbol_soft_clinical/screen.png](<../UI_screens/Patient_facing_screens/high_quality_3d_icon_of_a_smartwatch_and_a_health_heart_symbol_soft_clinical/screen.png>)
- [high_quality_3d_medical_icon_of_a_pill_being_dropped_into_a_calendar_slot_soft/screen.png](<../UI_screens/Patient_facing_screens/high_quality_3d_medical_icon_of_a_pill_being_dropped_into_a_calendar_slot_soft/screen.png>)
- [high_quality_3d_medical_illustration_of_a_pill_bottle_and_a_clinical_clipboard/screen.png](<../UI_screens/Patient_facing_screens/high_quality_3d_medical_illustration_of_a_pill_bottle_and_a_clinical_clipboard/screen.png>)
- [high_quality_medical_illustration_of_a_3d_pill_bottle_and_schedule_icon_soft/screen.png](<../UI_screens/Patient_facing_screens/high_quality_medical_illustration_of_a_3d_pill_bottle_and_schedule_icon_soft/screen.png>)
- [minimalist_logo_of_apple_health_high_quality_rendering/screen.png](<../UI_screens/Patient_facing_screens/minimalist_logo_of_apple_health_high_quality_rendering/screen.png>)
- [minimalist_logo_of_fitbit_high_quality_rendering/screen.png](<../UI_screens/Patient_facing_screens/minimalist_logo_of_fitbit_high_quality_rendering/screen.png>)
- [minimalist_logo_of_google_fit_high_quality_rendering/screen.png](<../UI_screens/Patient_facing_screens/minimalist_logo_of_google_fit_high_quality_rendering/screen.png>)
- [professional_headshot_of_a_female_cardiologist_smiling_confidently_hospital/screen.png](<../UI_screens/Patient_facing_screens/professional_headshot_of_a_female_cardiologist_smiling_confidently_hospital/screen.png>)
- [professional_lifestyle_photography_of_a_healthy_morning_routine_a_glass_of/screen.png](<../UI_screens/Patient_facing_screens/professional_lifestyle_photography_of_a_healthy_morning_routine_a_glass_of/screen.png>)
- [professional_medical_app_banner_for_lifestyle_hub._a_clean_high_fidelity/screen.png](<../UI_screens/Patient_facing_screens/professional_medical_app_banner_for_lifestyle_hub._a_clean_high_fidelity/screen.png>)
- [professional_medical_banner_for_an_explore_health_hub_showing_a_magnifying/screen.png](<../UI_screens/Patient_facing_screens/professional_medical_banner_for_an_explore_health_hub_showing_a_magnifying/screen.png>)
- [vibrant_photo_of_a_group_of_people_practicing_yoga_in_a_bright_studio/screen.png](<../UI_screens/Patient_facing_screens/vibrant_photo_of_a_group_of_people_practicing_yoga_in_a_bright_studio/screen.png>)
- [vibrant_professional_photo_of_a_healthy_salad_bowl_with_avocado_and_seeds/screen.png](<../UI_screens/Patient_facing_screens/vibrant_professional_photo_of_a_healthy_salad_bowl_with_avocado_and_seeds/screen.png>)

## 2. Specialist-facing screens (32)

### S01 — Professional onboarding and identity (5)

Implement partner selection, credentials, applications/status, professional editing, and the approved specialist entry flow.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| S-001 | [onboarding_status](<../UI_screens/Patient_facing_screens/onboarding_status/code.html>) · [image](<../UI_screens/Patient_facing_screens/onboarding_status/screen.png>) † | Implementation started | [(app)/onboarding-status.tsx](<../frontend/mobile/MedAPP/src/app/(app)/onboarding-status.tsx>) | B03 |
| S-002 | [partner_selection](<../UI_screens/Patient_facing_screens/partner_selection/code.html>) · [image](<../UI_screens/Patient_facing_screens/partner_selection/screen.png>) † | Implementation started | [selection.tsx](<../frontend/partner_web/src/features/selection.tsx>) | B03 |
| S-003 | [pharmacy_onboarding_details](<../UI_screens/Patient_facing_screens/pharmacy_onboarding_details/code.html>) · [image](<../UI_screens/Patient_facing_screens/pharmacy_onboarding_details/screen.png>) † | Implementation started | [details.tsx](<../frontend/partner_web/src/features/details.tsx>) | B03 |
| S-004 | [practitioner_credentials](<../UI_screens/Patient_facing_screens/practitioner_credentials/code.html>) · [image](<../UI_screens/Patient_facing_screens/practitioner_credentials/screen.png>) † | Implementation started | [documents.tsx](<../frontend/partner_web/src/features/documents.tsx>) | B03 |
| S-005 | [professional_profile_settings](<../UI_screens/Patient_facing_screens/professional_profile_settings/code.html>) · [image](<../UI_screens/Patient_facing_screens/professional_profile_settings/screen.png>) † | Implementation started | [(app)/practitioner-profile.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-profile.tsx>) | B03 |

### S02 — Doctor, nurse, and specialist dashboards (4)

Implement role-specific dashboard content, actions, navigation, and real work summaries.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| S-006 | [doctor_dashboard](<../UI_screens/Specialist_facing_screens/doctor_dashboard/code.html>) · [image](<../UI_screens/Specialist_facing_screens/doctor_dashboard/screen.png>) | Not implemented | [(app)/practitioner-home.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-home.tsx>) | B04 |
| S-007 | [nurse_dashboard](<../UI_screens/Specialist_facing_screens/nurse_dashboard/code.html>) · [image](<../UI_screens/Specialist_facing_screens/nurse_dashboard/screen.png>) | Not implemented | [(app)/practitioner-home.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-home.tsx>) | B04 |
| S-008 | [practitioner_dashboard](<../UI_screens/Patient_facing_screens/practitioner_dashboard/code.html>) · [image](<../UI_screens/Patient_facing_screens/practitioner_dashboard/screen.png>) † | Not implemented | [(app)/practitioner-home.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-home.tsx>) | B04 |
| S-009 | [specialist_dashboard](<../UI_screens/Specialist_facing_screens/specialist_dashboard/code.html>) · [image](<../UI_screens/Specialist_facing_screens/specialist_dashboard/screen.png>) | Not implemented | [(app)/practitioner-home.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-home.tsx>) | B04 |

### S03 — Availability, schedules, and requests (4)

Implement availability editing, working hours, schedule views, consultation request decisions, and conflict handling.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| S-010 | [clinical_schedule_hub_main_view](<../UI_screens/Specialist_facing_screens/clinical_schedule_hub_main_view/code.html>) · [image](<../UI_screens/Specialist_facing_screens/clinical_schedule_hub_main_view/screen.png>) | Not implemented | [(app)/appointments.tsx](<../frontend/mobile/MedAPP/src/app/(app)/appointments.tsx>) | B04 |
| S-011 | [clinical_schedule_management](<../UI_screens/Specialist_facing_screens/clinical_schedule_management/code.html>) · [image](<../UI_screens/Specialist_facing_screens/clinical_schedule_management/screen.png>) | Not implemented | [(app)/appointments.tsx](<../frontend/mobile/MedAPP/src/app/(app)/appointments.tsx>) | B04 |
| S-012 | [consultation_request_detail](<../UI_screens/Specialist_facing_screens/consultation_request_detail/code.html>) · [image](<../UI_screens/Specialist_facing_screens/consultation_request_detail/screen.png>) | Not implemented | [(app)/appointments.tsx](<../frontend/mobile/MedAPP/src/app/(app)/appointments.tsx>) | B04 |
| S-013 | [specialist_availability_schedule](<../UI_screens/Specialist_facing_screens/specialist_availability_schedule/code.html>) · [image](<../UI_screens/Specialist_facing_screens/specialist_availability_schedule/screen.png>) | Not implemented | [(app)/appointments.tsx](<../frontend/mobile/MedAPP/src/app/(app)/appointments.tsx>) | B04 |

### S04 — Patient roster and clinical records (5)

Implement an authorized roster with filters, patient details, intake, observations, and clinical actions backed by the owning service.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| S-014 | [active_patient_roster_1](<../UI_screens/Patient_facing_screens/smart_sync_connect_devices/active_patient_roster_1/code.html>) · [image](<../UI_screens/Patient_facing_screens/smart_sync_connect_devices/active_patient_roster_1/screen.png>) † | Not implemented | [(app)/active-patient-roster-2.tsx](<../frontend/mobile/MedAPP/src/app/(app)/active-patient-roster-2.tsx>) | B05 |
| S-015 | [active_patient_roster_2](<../UI_screens/Specialist_facing_screens/active_patient_roster_2/code.html>) · [image](<../UI_screens/Specialist_facing_screens/active_patient_roster_2/screen.png>) | Not implemented | [(app)/active-patient-roster-2.tsx](<../frontend/mobile/MedAPP/src/app/(app)/active-patient-roster-2.tsx>) | B05 |
| S-016 | [active_patient_roster_enhanced_filtering](<../UI_screens/Patient_facing_screens/active_patient_roster_enhanced_filtering/code.html>) · [image](<../UI_screens/Patient_facing_screens/active_patient_roster_enhanced_filtering/screen.png>) † | Not implemented | [(app)/active-patient-roster-2.tsx](<../frontend/mobile/MedAPP/src/app/(app)/active-patient-roster-2.tsx>) | B05 |
| S-017 | [patient_management_detail](<../UI_screens/Patient_facing_screens/patient_management_detail/code.html>) · [image](<../UI_screens/Patient_facing_screens/patient_management_detail/screen.png>) † | Not implemented | [(app)/patient-record.tsx](<../frontend/mobile/MedAPP/src/app/(app)/patient-record.tsx>) | B05 |
| S-018 | [patient_management_detail_clinical_actions](<../UI_screens/Patient_facing_screens/patient_management_detail_clinical_actions/code.html>) · [image](<../UI_screens/Patient_facing_screens/patient_management_detail_clinical_actions/screen.png>) † | Not implemented | [(app)/patient-record.tsx](<../frontend/mobile/MedAPP/src/app/(app)/patient-record.tsx>) | B05 |

### S05 — Consultation workspace and team chat (4)

Implement specialist consultation and team messaging, reviewed AI handoff, requested vitals, saved notes, and follow-up actions.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| S-019 | [clinical_team_chat](<../UI_screens/Specialist_facing_screens/clinical_team_chat/code.html>) · [image](<../UI_screens/Specialist_facing_screens/clinical_team_chat/screen.png>) | Not implemented | [(app)/practitioner-chat.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-chat.tsx>) | B06 |
| S-020 | [patient_consultation_1](<../UI_screens/Patient_facing_screens/patient_consultation_1/code.html>) · [image](<../UI_screens/Patient_facing_screens/patient_consultation_1/screen.png>) † | Not implemented | [(app)/practitioner-chat.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-chat.tsx>) | B06 |
| S-021 | [patient_consultation_2](<../UI_screens/Patient_facing_screens/patient_consultation_2/code.html>) · [image](<../UI_screens/Patient_facing_screens/patient_consultation_2/screen.png>) † | Not implemented | [(app)/practitioner-chat.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-chat.tsx>) | B06 |
| S-022 | [patient_consultation_standardized_nav](<../UI_screens/Patient_facing_screens/patient_consultation_standardized_nav/code.html>) · [image](<../UI_screens/Patient_facing_screens/patient_consultation_standardized_nav/screen.png>) † | Not implemented | [(app)/practitioner-chat.tsx](<../frontend/mobile/MedAPP/src/app/(app)/practitioner-chat.tsx>) | B06 |

### S06 — Prescription issuing (2)

Implement prescription composition, review, issue, cancellation/correction, and delivery into the patient's medication journey.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| S-023 | [issue_prescription](<../UI_screens/Specialist_facing_screens/issue_prescription/code.html>) · [image](<../UI_screens/Specialist_facing_screens/issue_prescription/screen.png>) | Not implemented | No direct mobile route mapped | B08 |
| S-024 | [issue_prescription_advanced_clinical_flow](<../UI_screens/Patient_facing_screens/issue_prescription_advanced_clinical_flow/code.html>) · [image](<../UI_screens/Patient_facing_screens/issue_prescription_advanced_clinical_flow/screen.png>) † | Not implemented | No direct mobile route mapped | B08 |

### S07 — Publishing and community management (4)

Implement post composition, group creation, membership approvals, moderation, and visibility to the right patient audience.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| S-025 | [community_manager](<../UI_screens/Specialist_facing_screens/community_manager/code.html>) · [image](<../UI_screens/Specialist_facing_screens/community_manager/screen.png>) | Not implemented | [(app)/community.tsx](<../frontend/mobile/MedAPP/src/app/(app)/community.tsx>) | B10 |
| S-026 | [compose_health_post](<../UI_screens/Specialist_facing_screens/compose_health_post/code.html>) · [image](<../UI_screens/Specialist_facing_screens/compose_health_post/screen.png>) | Not implemented | [(app)/community.tsx](<../frontend/mobile/MedAPP/src/app/(app)/community.tsx>) | B10 |
| S-027 | [create_health_group](<../UI_screens/Specialist_facing_screens/create_health_group/code.html>) · [image](<../UI_screens/Specialist_facing_screens/create_health_group/screen.png>) | Not implemented | [(app)/community.tsx](<../frontend/mobile/MedAPP/src/app/(app)/community.tsx>) | B10 |
| S-028 | [group_approval_queue](<../UI_screens/Specialist_facing_screens/group_approval_queue/code.html>) · [image](<../UI_screens/Specialist_facing_screens/group_approval_queue/screen.png>) | Not implemented | [(app)/community.tsx](<../frontend/mobile/MedAPP/src/app/(app)/community.tsx>) | B10 |

### S08 — Hospital and pharmacy partner operations (3)

Implement the referenced partner dashboards and connect tenant-scoped staff/department/pharmacy operations, reusing web portal code where appropriate.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| S-029 | [hospital_admin_dashboard](<../UI_screens/Patient_facing_screens/hospital_admin_dashboard/code.html>) · [image](<../UI_screens/Patient_facing_screens/hospital_admin_dashboard/screen.png>) † | Not implemented | No direct mobile route mapped | B11 |
| S-030 | [hospital_partner_dashboard](<../UI_screens/Patient_facing_screens/hospital_partner_dashboard/code.html>) · [image](<../UI_screens/Patient_facing_screens/hospital_partner_dashboard/screen.png>) † | Not implemented | No direct mobile route mapped | B11 |
| S-031 | [pharmacy_partner_dashboard](<../UI_screens/Patient_facing_screens/pharmacy_partner_dashboard/code.html>) · [image](<../UI_screens/Patient_facing_screens/pharmacy_partner_dashboard/screen.png>) † | In progress; reference acceptance pending | PMS dashboard, inventory, batches and purchasing | B11 |

### S09 — Clinical analytics (1)

Implement scoped clinical activity and outcomes views, with defined metrics and drill-down access.

| ID | Reference | UI baseline | Existing code to inspect | Batch |
| --- | --- | --- | --- | --- |
| S-032 | [clinical_analytics_insights](<../UI_screens/Specialist_facing_screens/clinical_analytics_insights/code.html>) · [image](<../UI_screens/Specialist_facing_screens/clinical_analytics_insights/screen.png>) | Not implemented | No direct mobile route mapped | B09 / B11 |

### Specialist design guidance

- [clinical_vitality/DESIGN.md](<../UI_screens/Specialist_facing_screens/clinical_vitality/DESIGN.md>)

Use the canonical brand and mobile UX guidance when these older reference exports conflict with current tokens, typography, or navigation. Specialist scope also includes the role-appropriate side of shared calls, notifications, and record access, even when the local reference for that shared feature is listed under patients.

Provider sign-in update (2026-09-13): the JSON register now includes the application-only
provider-sign-in and connected-accounts routes. Both extend B01 and remain unaccepted
pending configured provider/native checks; see [the setup guide](PROVIDER_SIGN_IN_SETUP.md).
The 76 patient / 32 specialist reference grouping is unchanged.


### B02 booking groundwork — 2026-09-13

P-012, P-013, P-020 and P-021 now have partial software evidence for real slot selection, authoritative timestamps, booking/cancellation and atomic rescheduling. Their reference acceptance remains open; PostgreSQL concurrency/live-gateway checks are pending Docker recovery, and device/theme validation remains pending. The following B02 update records later directory/profile/confirmation/detail work; reference acceptance remains open. All 108 references and all 32 specialist implementation requirements remain in scope.


### B02 discovery and saved details — 2026-09-13

P-012–P-018, P-020 and the basic profile portion of P-023 now have additional API
and component evidence: all-category directory results, pagination, supported
filters, fetched clinician profiles, saved confirmation and appointment-detail
navigation. P-023's detailed reviews and P-022's social profile remain unfinished.
See the completion baseline for exact checks and limits. No reference is marked
accepted, and no specialist implementation credit is inferred from this patient work.

### B03 professional identity and application status — 2026-09-14

S-001 and S-005 now have partial implementation/API/component evidence. They are
marked `in_progress` in the JSON register, not accepted. Application status reads
actual records, and the professional editor saves the authenticated doctor's or
nurse's basic public identity. The remaining 30 specialist references retain their
not-implemented baseline. All 108 references remain in scope and unaccepted.

Web applications/credentials, secure handoff, approval provisioning, complete
professional navigation and identity settings, and device/reference verification
remain B03 requirements. The status screen does not infer activation from approval.

### B03 partner application website — 2026-09-14

S-002, S-003 and S-004 now join S-001/S-005 as implementation in progress.
Five specialist references have partial implementation evidence; the other 27
remain at their not-implemented baseline. All 108 references remain unaccepted.
The separate `frontend/partner_web` app adds saved drafts, requirements-driven
credentials, attested submission, feedback/corrections and history. See the latest
completion baseline for the tested flows and explicit integration/reference gaps.

### B03 authenticated mobile handoff — 2026-09-14

S-001/S-002 now include start/continue/correct entry, a short-lived authenticated
website handoff, validated return, saved-status reload and role-token renewal.
Native return markers survive app termination; 45 focused mobile tests cover return
matching, forced permission renewal and recovery, with TypeScript passing.
The browser boundary passes through the actual gateway and user API in local QA;
the return target was an HTTP test receiver, not a native MedApp device. Counts
remain 76 patient and 32 specialist references, with five specialist references in
progress and no accepted references. Reviewer/provisioning, regional reference
fields, live infrastructure and native/reference acceptance remain in B03.

### B03 clinician activation — 2026-09-14

S-001 now has backend evidence for approval-driven doctor/nurse profile and account
activation, with durable retry, duplicate protection, audit and conflict handling.
Real loopback HTTP journeys verify token renewal and self-profile editing for both
roles using disposable SQLite and a document-storage double. This does not complete
the reviewer or activation-progress screens. Hospital/pharmacy workspace adapters,
legacy reconciliation, production database behavior and native/reference acceptance
remain open. All 108 references remain tracked and unaccepted.

### B03 applicant activation display and reviewer SSO foundation — 2026-09-14

S-001 now includes the applicant website's activation status, automatic refresh for
pending/retry, manual error recovery and scoped return to MedApp. All 72 website
tests and the production build pass. Browser validation remains unperformed because
automatic approval review rejected starting the local Next.js preview as “blocked
by policy.” The user service has a tested, disabled-by-default Workspace SSO path
for existing administrators; the reviewer browser session and screens remain open.
Design concepts do not count as implemented screens. No acceptance flags changed.

### B03 reviewer console — 2026-09-14

The internal admin console now supports Workspace/MFA sign-in, application queue,
credential preview/verification, version-aware review decisions, saved history and
activation status/retry. This supplies supporting workflow for S-001/S-003/S-004;
it does not add reference screens. Fifty admin tests and the production build pass.
Rendered fidelity, real Workspace consent and deployed session/API acceptance remain
unverified. Browser preview startup and a dependency-link repair/install command
were rejected by automatic approval review as “blocked by policy”; neither was
retried. Checks used already installed dependency versions. All 108 references
remain unaccepted, with the same five specialist references in progress.

### B03 hospital workspace entry — 2026-09-14

The application-only Hospital workspaces route now lists live memberships and
opens an authenticated hospital browser session, with account confirmation,
explicit workspace selection and validated return refresh. It extends specialist
entry without adding a reference screen. The JSON register now counts 62 mobile
routes and three layouts. Final evidence includes 208 identity-service, 73 portal,
48 distinct mobile and five HTTP/PostgreSQL cases, plus TypeScript and the portal
production build. See the completion baseline for reports and test limitations.
Native/deployed browser/provider and reference acceptance remain pending. All
108 references remain unaccepted, with the same five specialist entries in progress.

### B03 hospital staff onboarding — 2026-09-15

Hospital staff invitations, verified-email acceptance, staff records, versioned
role changes/revocation and access history extend the supporting workflow for
S-001. These portal routes do not add mobile routes or reference screens and do
not establish fidelity for the hospital dashboard references. See the completion
baseline for automated results and pending PostgreSQL/rendered acceptance.
The register retains 76 patient and 32 specialist references, 62 mobile routes,
three layouts and no accepted references; S-001 through S-005 remain in progress.

### B03 hospital profile and publication — 2026-09-15

The HMS Hospital profile page adds versioned draft editing, saved/public previews,
explicit publication and withdrawal, and recorded change history. It uses current
hospital administrator access and keeps approval/ownership fields read-only.
Drafts remain separate from patient-visible details. See the completion baseline
for actual backend, component, migration and real-service validation results.
This is supporting workflow evidence for S-001, with no additional reference or
mobile route and no change to the 76 patient / 32 specialist grouping. Rendered
hospital dashboard fidelity, native and deployed acceptance remain open.
The milestone's final automated evidence is 280 distinct passing checks, including
PostgreSQL service and tenant journeys, plus the portal production build. These
checks do not change reference acceptance status.

### B03 pharmacy workspace entry — 2026-09-15

The application-only Pharmacy workspaces route lists the owner's approved,
activated assignments. It opens the selected PMS deployment through account
confirmation and a separate browser session, with an explicit return to MedApp.
The Settings and Professional applications screens link to this route.
Four hundred automated checks pass across user identity, pharmacy directory,
PMS portal/Redis, mobile and real PostgreSQL/HTTP journeys; see the baseline
for reports and pending device/rendered acceptance.

The register now counts 63 mobile routes and three layouts. It retains 76 patient
and 32 specialist references, no accepted references, and S-001 through S-005
in progress. This supporting route does not implement or accept S-031's pharmacy
dashboard reference.

### B03 pharmacy profile and publication — 2026-09-15

The PMS owner editor adds saved drafts, publication/withdrawal, public and draft
previews, weekly schedule controls and recorded change history. It extends the
supporting workflow for S-003. P-067 now displays published services and head-
pharmacist details and identifies overnight closing as the following day.
Neither entry is accepted: at this milestone photo upload management, rendered/native/theme,
operational and full reference acceptance remain open. S-031's dashboard is
unchanged. There are still 108 references (76 patient, 32 specialist), 63 mobile
routes and three layouts. See the latest completion baseline for actual tests.

### B03 managed pharmacy photos — 2026-09-15

Owners now choose, upload, preview and remove pharmacy photos through the
versioned saved draft. Publication and withdrawal control new public image
requests. The byte store, draft revision and cleanup commit together; concurrent
uploads and revoked-owner access were exercised over real HTTP/PostgreSQL.
This adds supporting evidence for P-067 and S-003. The 223 distinct automated
checks and build follow-up are recorded in the latest completion baseline.
Rendered/device/theme and full reference acceptance remain open. Counts and
acceptance flags are unchanged; S-031's operational dashboard remains pending.

### Pharmacy dashboard and inventory — 2026-09-15

S-031 now has a live PMS dashboard, today/week sales activity, stock tasks and
prescription queue links. The supporting catalog and batch screens add server
search/paging, edits/archiving, receipts/adjustments, expiry filters and movement
history. Stock writes are serialized and manual mutation receipts prevent duplicate
retries. Cashiers have read-only inventory access. See the latest completion
baseline and [operations contract](api/pms_service.md) for verification and limits.
S-031 is in progress and partially verified; it is not accepted. Scanning, refill
orders, delivery, clinical interaction alerts, partial deliveries and prescription
corrections/refunds remain open. Rendered, theme and target-device checks remain
pending. Counts remain 108 references: 76 patient-facing and 32 specialist-facing.

### Pharmacy purchasing and partial deliveries — 2026-09-15

The existing purchase-order routes now support versioned draft editing, tracking
externally placed orders, partial/split receipts, outstanding quantities, cancellation
of the remainder, delivery records and order history. Administrators can reconcile
recorded earlier batches; missing evidence stays flagged. Atomic request receipts
protect write retries and PostgreSQL locks protect concurrent stock changes. The
latest completion baseline records 228 passing tests and the production build.
This adds supporting work to S-031, which remains in progress and unaccepted.
Patient refills/fulfillment/delivery, clinical alerts, returns/refunds, browser-restart
recovery and rendered/device/theme acceptance remain open. Counts are unchanged.

### Pharmacy POS and prescription recovery — 2026-09-15

The POS/prescription routes now review current batch prices, save receipts and
support partial dispensing, cancellation of remaining units and reasoned walk-in
sale voids. Atomic request receipts protect retries, saved revisions detect
competing changes, and payment details remain attached to the sale. Paged lists
distinguish failed loads from empty results. The latest baseline records 263
passing tests, TypeScript/lint and the production build. This supports S-031
without accepting it. Prescription corrections, refunds, durable MedApp delivery,
refill fulfillment, restart recovery and rendered/device/theme/reference acceptance
remain open. Counts stay at 76 patient-facing and 32 specialist-facing references.

### Pharmacy corrections and refund records — 2026-09-16

Saved receipts now support partial quantity credits, explicit stock disposition,
staff-attributed history and completed external refund records. Never-collected
units return to original batches and reduce verified prescription counts;
customer returns preserve the clinical dispense and remain outside usable stock.
Administrators can verify older prescription links and mark incorrect refund
entries with retained evidence. Reports separate credits and refund settlement.
See the [latest baseline](COMPLETION_BASELINE.md) for automated validation and
the [correction contract](api/pms_service.md#receipt-corrections-and-completed-refund-records).
This is supporting work for S-031, which remains in progress and unaccepted.
Durable MedApp synchronization, actual provider refunds, supplier credits, patient
refill fulfillment/delivery, clinical alerts, restart recovery and rendered/device/
theme/reference acceptance remain open. All 108 references remain in scope.
