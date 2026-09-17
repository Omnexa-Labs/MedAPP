// The production route uses saved pharmacy reports. The legacy presentation below
// remains a design fixture for medicine-course tabs, whose clinical API is still pending.

import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import {
  Badge,
  Card,
  ChoiceChip,
  ChoiceChipRow,
  EmptyState,
  Icon,
  InfoCallout,
} from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import {
  formatIssuedDate,
  prescriptionsWithStatus,
  statusCounts,
  type Prescription,
  type PrescriptionStatus,
} from "./prescriptions";
import { PRESCRIPTIONS_SAMPLE_NOTICE } from "./prescriptions-sample-data";
import { ClinicalPrescriptionHistory } from "./ClinicalPrescriptionScreens";

const TABS: readonly { status: PrescriptionStatus; label: string }[] = [
  { status: "active", label: "Active" },
  { status: "new", label: "New" },
  { status: "past", label: "Past" },
];

export function PrescriptionHistoryScreen() {
  return <ClinicalPrescriptionHistory />;
}

export type PrescriptionHistoryProps = {
  prescriptions: readonly Prescription[];
  sample: boolean;
};

/**
 * The list, as a function of its props.
 *
 * Split from the screen so each tab — including an EMPTY tab, which the sample
 * data does not currently produce — is reachable in a test without a fake clock.
 */
export function PrescriptionHistory({ prescriptions, sample }: PrescriptionHistoryProps) {
  const [status, setStatus] = useState<PrescriptionStatus>("active");
  const counts = useMemo(() => statusCounts(prescriptions), [prescriptions]);
  const visible = useMemo(
    () => prescriptionsWithStatus(prescriptions, status),
    [prescriptions, status],
  );

  return (
    <DetailShell
      title="Prescriptions"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/overview" as Href);
      }}
    >
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: 32,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        accessibilityLabel="Prescriptions"
        ListHeaderComponent={
          <View>
            {sample ? (
              <View className="mb-4">
                <InfoCallout tone="error" testID="prescriptions-sample-notice">
                  {PRESCRIPTIONS_SAMPLE_NOTICE}
                </InfoCallout>
              </View>
            ) : null}

            <ChoiceChipRow testID="prescription-tabs">
              {TABS.map((tab) => (
                <ChoiceChip
                  key={tab.status}
                  label={`${tab.label} (${counts[tab.status]})`}
                  selected={tab.status === status}
                  onPress={() => setStatus(tab.status)}
                  testID={`prescription-tab-${tab.status}`}
                />
              ))}
            </ChoiceChipRow>
          </View>
        }
        renderItem={({ item }) => <PrescriptionCard prescription={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={<NoPrescriptions status={status} />}
      />
    </DetailShell>
  );
}

/**
 * The status pill wording is the tab's, not the raw status: "new" reads as
 * "New" on a tab but a badge saying "NEW" on a card next to a date from
 * yesterday is clearer as "Just issued".
 */
const STATUS_BADGE: Record<
  PrescriptionStatus,
  { label: string; tone: "success" | "primary" | "neutral" }
> = {
  active: { label: "Active", tone: "success" },
  new: { label: "Just issued", tone: "primary" },
  past: { label: "Completed", tone: "neutral" },
};

export function PrescriptionCard({ prescription }: { prescription: Prescription }) {
  const primary = useTokenColor("primary");
  const badge = STATUS_BADGE[prescription.status];

  return (
    <Card
      className="mt-3 p-4"
      accessibilityLabel={`${prescription.drugName}, ${prescription.strengthAndForm}, ${badge.label}`}
      testID={`prescription-card-${prescription.id}`}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-md bg-primary-tint">
          <Icon name="prescription" size={24} color={primary} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-headline-md text-headline-md text-on-surface" numberOfLines={2}>
            {prescription.drugName}
          </Text>
          <Text
            className="mt-1 font-label-md text-label-md text-on-surface-variant"
            numberOfLines={2}
          >
            {prescription.strengthAndForm}
          </Text>
        </View>
        <Badge tone={badge.tone} label={badge.label} />
      </View>

      {/* The frame's inset grey panel. Two facts, side by side, each labelled —
          a prescriber with no "PRESCRIBER" label above it reads as a patient
          name. */}
      <View className="mt-4 flex-row gap-4 rounded-md bg-surface-container p-3">
        <View className="min-w-0 flex-1">
          <Text className="font-label-sm text-label-sm uppercase text-on-surface-variant">
            Prescriber
          </Text>
          <Text className="mt-1 font-body-md text-body-md text-on-surface" numberOfLines={2}>
            {prescription.prescriberName}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-label-sm text-label-sm uppercase text-on-surface-variant">
            Issued
          </Text>
          <Text className="mt-1 font-body-md text-body-md text-on-surface" numberOfLines={1}>
            {formatIssuedDate(prescription.issuedDate)}
          </Text>
        </View>
      </View>

      {/* A JUST-ISSUED script opens the "new prescription" surface, which is the
          frame that exists for it (new_prescription_received) and carries the
          pharmacy-status section. Everything else goes straight to the digital
          prescription. Routing both to the same place would waste the one screen
          built for the acknowledge-a-new-script moment. */}
      {prescription.status === "new" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open new prescription for ${prescription.drugName}`}
          onPress={() =>
            router.push({
              pathname: "/(app)/new-prescription",
              params: { id: prescription.id },
            } as Href)
          }
          className="mt-4 min-h-11 items-center justify-center rounded-md bg-primary px-3 active:opacity-70"
        >
          <Text className="font-label-md text-label-md text-on-primary">Open prescription</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View details for ${prescription.drugName}`}
          onPress={() =>
            router.push({
              pathname: "/(app)/active-script-view",
              // Only what this list holds. ActiveScriptViewScreen renders an absent
              // param as an absent row by design — its clinical-constant fallbacks
              // were deleted — so passing nothing for patient/dob/clinic/licence is
              // correct, not a gap.
              params: {
                drug: `${prescription.drugName} ${prescription.strengthAndForm}`,
                prescriber: prescription.prescriberName,
                issuedDate: formatIssuedDate(prescription.issuedDate),
                rxNumber: prescription.rxNumber,
                scriptId: prescription.id,
              },
            } as Href)
          }
          className="mt-4 min-h-11 items-center justify-center rounded-md bg-primary px-3 active:opacity-70"
        >
          <Text className="font-label-md text-label-md text-on-primary">View details</Text>
        </Pressable>
      )}
    </Card>
  );
}

/**
 * Per-TAB empty state, and it names the tab.
 *
 * "No prescriptions" under the Past tab would suggest the patient has never had
 * one, when the list is merely filtered. This is the same class of mistake
 * features/medications/state.ts exists to prevent — a filtered-to-nothing list
 * and an empty record are different statements.
 *
 * Note this is NOT reachable from a failed fetch, because there is no fetch. When
 * one lands, this screen needs the `deriveMedicationsState` treatment next door
 * before it can render an empty tab from a query.
 */
function NoPrescriptions({ status }: { status: PrescriptionStatus }) {
  const body =
    status === "active"
      ? "You have no active prescriptions."
      : status === "new"
        ? "Nothing new since you last looked."
        : "No completed prescriptions yet.";

  return (
    <View className="flex-1 items-center justify-center py-12">
      <EmptyState
        testID={`prescriptions-empty-${status}`}
        icon="prescription"
        title={`No ${status === "new" ? "new" : status} prescriptions`}
        body={body}
      />
    </View>
  );
}
