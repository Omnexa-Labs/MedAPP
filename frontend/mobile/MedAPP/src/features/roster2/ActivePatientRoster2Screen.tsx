// Active patient roster — the practitioner "Patients" tab root.
//
// ===========================================================================
// THERE IS NO ROSTER ENDPOINT. THE FOURTEEN PATIENTS WERE FABRICATED.
// ===========================================================================
// This screen used to render `./mock-data.ts`: fourteen complete patient
// records with names, ages, wards, conditions and clinical notes, filtered and
// sorted by a full chip/search/sheet apparatus, and it imported no API module
// and made no request. It was not a placeholder awaiting a query — it was a
// clinical roster made of invented people, and the details are what make that a
// safety defect rather than a cosmetic one:
//
//   * TWELVE of the fourteen shared one byte-identical vitals triple (HR 76 /
//     BP 124/78 / SpO₂ 98%), so a practitioner scanning the roster for an
//     outlier was reading a constant.
//   * The fourteenth, "Amina Mensah", carried an invented critical alarm
//     (HR 126 / BP 160/98 / SpO₂ 91%) rendered in a red alert tile — and her
//     patient record, one tap away, said SpO₂ 98% and normal. The two screens
//     contradicted each other about the same patient.
//   * "Confirm intake" set local state and announced "Marcus Chen is now in
//     your active care roster." Its "Try again" set the outcome to `accepted`
//     UNCONDITIONALLY — a retry that could not fail.
//   * "Review now" rendered "{Name}'s critical-care review was recorded" with
//     no request and no intermediate step. The button WAS the confirmation.
//   * The "Active" and "All" care-scope chips were identical; there was no
//     `active` branch anywhere in the filter.
//
// ---------------------------------------------------------------------------
// WHY IT IS NOT WIRED INSTEAD, WHICH WAS THE PREFERRED OUTCOME
// ---------------------------------------------------------------------------
// Checked before deciding:
//
//   * `ehr_service` has no patient LIST. `GET /v1/patients` 404s through the
//     gateway and is a clinician index that was never routed
//     (docs/api/ehr_service.md). The three routes that do work are addressed by
//     a single user id — `{id}/summary`, `{id}/records`, `{id}/vitals` — so
//     they answer "tell me about this patient", never "who are my patients".
//   * `booking_service` `GET /v1/bookings/schedule` (features/practitioner/api.ts
//     `listSchedule`) does return the signed-in practitioner's bookings, and
//     PractitionerHomeScreen already draws it. It is NOT this screen: it carries
//     an opaque `patient_id` and no name, no ward, no triage level, no
//     observations and no clinical note. Rendering it here would be a second
//     copy of the Home schedule wearing a roster's vocabulary, and every column
//     this screen is about would still have to be invented.
//   * `hms_service` is the hospital system that would own admissions and wards.
//     It is namespaced at `/v1/hms/*` and currently 500s — its container cannot
//     resolve `postgres`, so its migrations have never run.
//
// So the roster's subject matter — admitted patients, wards, triage level,
// bedside observations, clinical notes — has no source anywhere in the backend.
// The screen says exactly that. It is deliberately not a designed empty state
// ("No patients today") either: that asserts the roster was consulted and found
// empty, which is a clinical claim, and this screen consulted nothing.
//
// What is needed to restore it is recorded in docs/api/README.md's gap
// register, feature by feature, so nothing here is lost by deletion.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.
// Only expo-router is used.

import { Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { PractitionerShell } from "@/components/shell";
import { Button, Card, Icon, InfoCallout } from "@/components/ui";

export function ActivePatientRoster2Screen() {
  return (
    <PractitionerShell activeTab="patients" hideBack>
      <View className="flex-1 p-4">
        <Text className="font-headline-xl text-headline-xl text-on-surface">Patient roster</Text>
        <Text className="mt-1 font-body-md text-body-md text-on-surface-variant">
          Your admitted patients, wards and bedside observations.
        </Text>

        <Card testID="roster-unavailable-card" className="mt-6 p-5">
          <Icon chrome="cloud-off" size={28} />
          <Text className="mt-3 font-headline-md text-headline-md text-on-surface">
            The roster is not connected
          </Text>
          {/* Says what is missing, not that nothing is there. A practitioner
              must be able to tell "no data source" from "no patients". */}
          <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
            No patient list has been loaded, and this is not an empty roster. Nothing in the backend
            currently returns admitted patients, wards, triage levels or bedside observations, so
            this screen has nothing to show you.
          </Text>
          <Text className="mt-3 font-body-md text-body-md text-on-surface-variant">
            Until it does, use your schedule for today&apos;s consultations, and open a patient
            record directly when you have the patient&apos;s id.
          </Text>
          <View className="mt-6">
            <Button
              label="Go to my schedule"
              shadow={false}
              onPress={() => router.replace("/(app)/practitioner-home" as Href)}
            />
          </View>
        </Card>

        <View className="mt-6">
          <InfoCallout icon="info-outline">
            This screen previously showed sample patients. They were not real records and have been
            removed.
          </InfoCallout>
        </View>
      </View>
    </PractitionerShell>
  );
}
