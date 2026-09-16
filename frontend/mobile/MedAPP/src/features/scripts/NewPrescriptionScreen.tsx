// A newly issued prescription.
//
// Frame: UI_screens/Patient_facing_screens/new_prescription_received — four
// sections: "New Prescription Issued", the drug, "Pharmacy Status", and "About
// this Medication".
//
// Reached from the prescription history's New tab. Takes an `id`; with none, or
// with one that matches nothing, it says so rather than rendering a blank record.
//
// ===========================================================================
// "PHARMACY STATUS" IS A LINK, NOT A BADGE. THIS IS THE `availability` RULE.
// ===========================================================================
// The frame shows a status pill next to a pharmacy. There is no endpoint that can
// answer "is this script ready?" — no refill, order or delivery route exists
// anywhere in the backend (checked across every service's routers). What DOES
// exist is a per-pharmacy stock question: `GET /v1/pharmacies/{id}/stock?drug_name=`,
// exposed as `usePharmacyStockCheck` in features/care. It needs a pharmacy id,
// because the answer is a property of a PHARMACY and not of a prescription — no
// pharmacy has been chosen at this point in the flow, so there is nothing to ask.
//
// A hardcoded "Ready for pickup" is precisely the defect features/care/types.ts
// records deleting: `PersonEntry.availability` and `AvailabilityTone` were removed
// because "every adapter below hardcoded `availability: "online"`... a status
// claim about a real person, asserted by a constant". A claim that a controlled
// drug is waiting at a counter is worse — a patient acts on it by travelling.
//
// So the section states what is unknown and offers the real thing: the pharmacy
// directory, where the live stock check exists.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Icon, InfoCallout, SectionHeader } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { formatIssuedDate, type Prescription } from "./prescriptions";
import {
  buildSamplePrescriptions,
  PRESCRIPTIONS_SAMPLE_NOTICE,
} from "./prescriptions-sample-data";

export function NewPrescriptionScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const today = useMemo(() => new Date(), []);
  const prescriptions = useMemo(() => buildSamplePrescriptions(today), [today]);

  // With no id, show the most recently issued NEW script — which is what a
  // "you have a new prescription" notification would open. Falls through to the
  // not-found panel when there is no such script, rather than defaulting to an
  // arbitrary row: opening the wrong prescription is worse than opening none.
  const prescription = useMemo(() => {
    if (params.id) return prescriptions.find((candidate) => candidate.id === params.id);
    return prescriptions
      .filter((candidate) => candidate.status === "new")
      .sort((a, b) => b.issuedDate.localeCompare(a.issuedDate))[0];
  }, [params.id, prescriptions]);

  return <NewPrescription prescription={prescription} sample />;
}

export function NewPrescription({
  prescription,
  sample,
}: {
  prescription: Prescription | undefined;
  sample: boolean;
}) {
  const primary = useTokenColor("primary");

  return (
    <DetailShell
      title="New prescription"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/prescription-history" as Href);
      }}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: 32,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
      >
        {prescription === undefined ? (
          <View className="flex-1 items-center justify-center py-12">
            <EmptyState
              testID="new-prescription-not-found"
              icon="prescription"
              title="Prescription not found"
              body="This prescription could not be opened. Check your prescription list."
            />
          </View>
        ) : (
          <>
            {sample ? (
              <View className="mb-4">
                <InfoCallout tone="error" testID="new-prescription-sample-notice">
                  {PRESCRIPTIONS_SAMPLE_NOTICE}
                </InfoCallout>
              </View>
            ) : null}

            <Text className="font-headline-xl text-headline-xl text-on-surface">
              New prescription issued
            </Text>
            <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
              {`Issued ${formatIssuedDate(prescription.issuedDate)} by ${prescription.prescriberName}.`}
            </Text>

            <Card className="mt-5 p-4" testID="new-prescription-drug">
              <View className="flex-row items-start gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-md bg-primary-tint">
                  <Icon name="prescription" size={24} color={primary} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-headline-md text-headline-md text-on-surface">
                    {prescription.drugName}
                  </Text>
                  <Text className="mt-1 font-label-md text-label-md text-on-surface-variant">
                    {prescription.strengthAndForm}
                  </Text>
                </View>
                <Badge tone="primary" label="Just issued" />
              </View>
              <View className="mt-4 h-px bg-outline-variant" />
              <Text className="mt-3 font-label-sm text-label-sm uppercase text-on-surface-variant">
                Prescription number
              </Text>
              <Text className="mt-1 font-body-md text-body-md text-on-surface">
                {prescription.rxNumber}
              </Text>
            </Card>

            <PharmacyStatus drugName={prescription.drugName} />

            {/* Absent sig -> absent SECTION, heading included. An "About this
                medication" heading over nothing reads as a failed load. */}
            {prescription.directions ? (
              <View testID="new-prescription-directions">
                <View className="mt-6">
                  <SectionHeader title="About this medication" icon="medication" />
                </View>
                <Card className="mt-2 p-4">
                  <Text className="font-body-md text-body-md text-on-surface">
                    {prescription.directions}
                  </Text>
                </Card>
              </View>
            ) : null}

            <View className="mt-6">
              <Button
                label="View full prescription"
                onPress={() =>
                  router.push({
                    pathname: "/(app)/active-script-view",
                    params: {
                      drug: `${prescription.drugName} ${prescription.strengthAndForm}`,
                      prescriber: prescription.prescriberName,
                      issuedDate: formatIssuedDate(prescription.issuedDate),
                      rxNumber: prescription.rxNumber,
                      scriptId: prescription.id,
                    },
                  } as Href)
                }
                testID="new-prescription-view-full"
              />
            </View>
          </>
        )}
      </ScrollView>
    </DetailShell>
  );
}

/**
 * The frame's "Pharmacy Status" section, stating the unknown instead of a badge.
 *
 * The drug name is carried into the directory so the stock question the patient
 * will be asked there is about THIS prescription rather than a blank search.
 */
function PharmacyStatus({ drugName }: { drugName: string }) {
  return (
    <View>
      <View className="mt-6">
        <SectionHeader title="Pharmacy status" icon="pills" />
      </View>
      <Card className="mt-2 p-4" testID="new-prescription-pharmacy-status">
        <Text className="font-body-md text-body-md text-on-surface-variant">
          No pharmacy has been chosen for this prescription yet, so MedApp cannot say whether it is
          in stock. Availability is answered by each pharmacy.
        </Text>
        <View className="mt-4">
          <Button
            label="Find a pharmacy"
            variant="secondary"
            leadingIcon="local-pharmacy"
            onPress={() =>
              router.push(`/(app)/find-care?q=${encodeURIComponent(drugName)}` as Href)
            }
            testID="new-prescription-find-pharmacy"
          />
        </View>
      </Card>
    </View>
  );
}
