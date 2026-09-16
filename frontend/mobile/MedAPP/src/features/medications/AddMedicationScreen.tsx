// Add a medication — the details form.
//
// Frame: UI_screens/Patient_facing_screens/add_medication_smart_scan_flow (form,
// reminder and visual-reference sections) with the captured photo arriving from
// MedicationScanScreen as a `labelUri` param.
//
// ===========================================================================
// WHAT THIS SCREEN'S PRIMARY ACTION ACTUALLY DOES, AND WHY IT IS NOT "SAVE"
// ===========================================================================
// There is no medication endpoint. A "Save" button here would collect a drug
// name and a dose, drop them, and return the patient to a list that does not
// contain them — which is why ActiveMedicationsScreen deleted "Add a medication"
// TWICE, once from its footer and once from its empty state, both times because
// the control's entire behaviour was an apology.
//
// So the terminal action is SHARE, not save, and share is real: `@/lib/share`
// writes a file through expo-sharing, the same mechanism the medication-list
// export already uses. The patient ends the flow holding something — a text file
// of the details plus a photo they can send to their clinician or pharmacist —
// rather than holding a false belief that their record was updated. The codebase
// already draws this line explicitly: "The share action stays: sharing is a
// CLIENT capability and works."
//
// When a patient-scoped medication endpoint ships, `onSubmit` becomes a mutation,
// the notice at the top goes, and the button's label changes to "Save". Nothing
// else on this screen needs to move.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import {
  Button,
  Card,
  ChoiceChip,
  ChoiceChipRow,
  Input,
  InfoCallout,
  KeyboardInset,
  SectionHeader,
  type InputProps,
} from "@/components/ui";
import { shareTextFile } from "@/lib/share";

/** The frame's "Time of Day" chips. */
const TIMES_OF_DAY = ["Morning", "Midday", "Evening", "Night"] as const;
type TimeOfDay = (typeof TIMES_OF_DAY)[number];

type Draft = {
  name: string;
  dosage: string;
  form: string;
  frequency: string;
  firstDoseTime: string;
  timesOfDay: readonly TimeOfDay[];
};

const EMPTY_DRAFT: Draft = {
  name: "",
  dosage: "",
  form: "",
  frequency: "",
  firstDoseTime: "",
  timesOfDay: [],
};

/**
 * A drug name is the one field with no useful default and no safe guess, so it is
 * the only one required before the details can be shared. Sharing "Dosage: 10mg"
 * with no drug attached is a document that cannot be acted on.
 */
export function canShareDraft(draft: Draft): boolean {
  return draft.name.trim().length > 0;
}

/**
 * The shared document. Every field the patient left blank is OMITTED rather than
 * emitted as "Form: —", because a clinical document with empty labelled rows
 * invites the reader to assume the blank was deliberate.
 *
 * The provenance line is first and unconditional: this was typed by the patient,
 * not transcribed from the label and not taken from their record.
 */
export function buildMedicationDraftText(draft: Draft, hasPhoto: boolean): string {
  const lines: string[] = [
    "MedApp — medication details",
    "",
    "Entered by the patient. Not read from a prescription label, and not part of a",
    "medical record. Check against the packaging before acting on it.",
    "",
    `Medication: ${draft.name.trim()}`,
  ];
  const optional: readonly [string, string][] = [
    ["Dosage", draft.dosage],
    ["Form", draft.form],
    ["Frequency", draft.frequency],
    ["First dose", draft.firstDoseTime],
  ];
  for (const [label, value] of optional) {
    if (value.trim()) lines.push(`${label}: ${value.trim()}`);
  }
  if (draft.timesOfDay.length > 0) {
    lines.push(`Reminders: ${draft.timesOfDay.join(", ")}`);
  }
  if (hasPhoto) {
    lines.push("", "A photo of the packaging was taken in the app and is not included in this file.");
  }
  return lines.join("\n");
}

export function AddMedicationScreen() {
  // `useLocalSearchParams` returns "" for a present-but-empty key and undefined
  // for an absent one; both mean "no photo", hence the truthiness check rather
  // than `!== undefined`.
  const params = useLocalSearchParams<{ labelUri?: string }>();
  const labelUri = params.labelUri || undefined;

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const canShare = useMemo(() => canShareDraft(draft), [draft]);

  const set = useCallback(
    <K extends keyof Draft>(key: K, value: Draft[K]) =>
      setDraft((current) => ({ ...current, [key]: value })),
    [],
  );

  const toggleTimeOfDay = useCallback((time: TimeOfDay) => {
    setDraft((current) => ({
      ...current,
      timesOfDay: current.timesOfDay.includes(time)
        ? current.timesOfDay.filter((candidate) => candidate !== time)
        : [...current.timesOfDay, time],
    }));
  }, []);

  const share = useCallback(() => {
    if (!canShareDraft(draft)) return;
    void shareTextFile({
      filename: "medapp-medication-details.txt",
      body: buildMedicationDraftText(draft, labelUri !== undefined),
      dialogTitle: "Share medication details",
      subject: "MedApp — medication details",
    });
  }, [draft, labelUri]);

  return (
    <DetailShell
      title="Add medication"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/active-medications" as Href);
      }}
    >
      <KeyboardInset>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* First thing on the screen. The frame's equivalent card reads
              "Clinical Precision — ensuring your Health Memory is accurate is
              vital"; that copy promises a record this app cannot write, so the
              slot carries the limitation instead. */}
          <InfoCallout tone="error" testID="add-medication-notice">
            This is not added to your medication record — MedApp cannot write to it yet. You can
            share the details with your clinician or pharmacist instead.
          </InfoCallout>

          {labelUri ? <LabelPreview uri={labelUri} /> : <ScanPrompt />}

          <View className="mt-6">
            <SectionHeader title="Details" icon="medication" />
          </View>
          <View className="mt-2 gap-4">
            <Field
              label="Medication name"
              placeholder="e.g. Amlodipine"
              value={draft.name}
              onChangeText={(value) => set("name", value)}
              autoCapitalize="words"
              autoCorrect={false}
              testID="add-medication-name"
            />
            <Field
              label="Dosage"
              placeholder="e.g. 5 mg"
              value={draft.dosage}
              onChangeText={(value) => set("dosage", value)}
              autoCorrect={false}
              testID="add-medication-dosage"
            />
            <Field
              label="Form"
              placeholder="e.g. Tablet"
              value={draft.form}
              onChangeText={(value) => set("form", value)}
              autoCapitalize="words"
              testID="add-medication-form"
            />
            <Field
              label="Frequency"
              placeholder="e.g. Once daily"
              value={draft.frequency}
              onChangeText={(value) => set("frequency", value)}
              testID="add-medication-frequency"
            />
            <Field
              label="First dose time"
              placeholder="e.g. 08:00"
              value={draft.firstDoseTime}
              onChangeText={(value) => set("firstDoseTime", value)}
              autoCorrect={false}
              testID="add-medication-first-dose"
            />
          </View>

          <View className="mt-6">
            <SectionHeader title="Reminders" icon="preferences" />
          </View>
          {/* The frame's copy is "Get notified for every dose". No notification is
              scheduled by this screen — expo-notifications is not a dependency —
              so the chips record a PREFERENCE that travels into the shared file,
              and the wording below says exactly that rather than promising an
              alert that will never fire. */}
          <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
            Choose when you would take it. These go into the shared details; MedApp does not send
            reminders yet.
          </Text>
          <View className="mt-3">
            <ChoiceChipRow testID="add-medication-times">
              {TIMES_OF_DAY.map((time) => (
                <ChoiceChip
                  key={time}
                  label={time}
                  selected={draft.timesOfDay.includes(time)}
                  onPress={() => toggleTimeOfDay(time)}
                  testID={`add-medication-time-${time.toLowerCase()}`}
                />
              ))}
            </ChoiceChipRow>
          </View>

          <View className="mt-8">
            <Button
              label="Share these details"
              onPress={share}
              disabled={!canShare}
              testID="add-medication-share"
            />
            {!canShare ? (
              // Says WHY it is unavailable. A disabled button with no reason is
              // indistinguishable from a broken one.
              <Text className="mt-2 font-label-sm text-label-sm text-on-surface-variant">
                Enter the medication name to share these details.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardInset>
    </DetailShell>
  );
}

/**
 * Label + 8px + input, which is the form convention already used by the sign-up
 * steps (`SignUpStep2Screen`'s "Date of Birth" field). `Input` itself takes no
 * `label` prop — it is a `TextInput` plus icon/leading/trailing slots — so the
 * label is a sibling `Text`, and doing it in one place here keeps the five fields
 * below from drifting apart on spacing or type scale.
 */
function Field({ label, ...input }: { label: string } & InputProps) {
  return (
    <View className="gap-2">
      <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
      <Input {...input} />
    </View>
  );
}

function ScanPrompt() {
  return (
    <Card className="mt-4 p-4" testID="add-medication-scan-prompt">
      <Text className="font-headline-md text-headline-md text-on-surface">
        Photograph the label
      </Text>
      <Text className="mt-1 font-body-md text-body-md text-on-surface-variant">
        Optional. Keeps a picture of the packaging alongside the details you type. Supports labels,
        boxes and printed prescriptions.
      </Text>
      <View className="mt-4">
        <Button
          label="Open camera"
          variant="secondary"
          leadingIcon="photo-camera"
          onPress={() => router.push("/(app)/medication-scan" as Href)}
          testID="add-medication-open-camera"
        />
      </View>
    </Card>
  );
}

function LabelPreview({ uri }: { uri: string }) {
  return (
    <Card className="mt-4 p-4" testID="add-medication-label-preview">
      <SectionHeader title="Photographed label" icon="medication" />
      <View className="mt-3 h-48 overflow-hidden rounded-md bg-surface-container-high">
        <Image
          source={{ uri }}
          contentFit="contain"
          style={{ flex: 1 }}
          accessibilityLabel="The prescription label you photographed"
          testID="add-medication-label-image"
        />
      </View>
      <Text className="mt-2 font-label-sm text-label-sm text-on-surface-variant">
        Nothing is read from this photo — the fields below are yours to fill in.
      </Text>
      <View className="mt-3">
        <Button
          label="Retake photo"
          variant="secondary"
          onPress={() => router.replace("/(app)/medication-scan" as Href)}
          testID="add-medication-retake"
        />
      </View>
    </Card>
  );
}
