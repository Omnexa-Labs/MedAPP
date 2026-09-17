import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { z } from "zod";
import { Image } from "expo-image";
import { DetailShell } from "@/components/shell";
import {
  Button,
  ConsentRow,
  ErrorPanel,
  InfoCallout,
  KeyboardInset,
  SkeletonCard,
} from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { clinicalApi } from "@/features/scripts/clinical-api";
import { medicineSchema, medicationApi, type Course, type Medicine } from "./medication-api";
import {
  back,
  CourseContents,
  Field,
  text,
  useMedicationQuery,
  useMedicationWrite,
  WriteFeedback,
  type Scope,
} from "./MedicationComponents";
import { localDateKey } from "./schedule";

const blank: Medicine = {
  drug_name: "",
  strength: "",
  form: "",
  dose: "",
  route: "",
  frequency: "",
  duration: "",
  instructions: "",
};
const labels: [keyof Medicine, string, number][] = [
  ["drug_name", "Medicine name", 255],
  ["strength", "Strength", 64],
  ["form", "Form", 64],
  ["dose", "Dose", 80],
  ["route", "Route", 40],
  ["frequency", "Frequency", 80],
  ["duration", "Directions duration (optional)", 80],
  ["instructions", "Instructions (optional)", 200],
];
function Add({
  scope,
  prescriptionId,
  item,
  labelUri,
}: {
  scope: Scope;
  prescriptionId?: string;
  item?: string;
  labelUri?: string;
}) {
  const prescribed = prescriptionId !== undefined || item !== undefined;
  const validSource =
    z.string().uuid().safeParse(prescriptionId).success &&
    /^\d+$/.test(item ?? "") &&
    Number(item) < 20;
  const [medicine, setMedicine] = useState(blank),
    [start, setStart] = useState(() => localDateKey(new Date()));
  const [end, setEnd] = useState(""),
    [times, setTimes] = useState("");
  const [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [confirmed, setConfirmed] = useState(false),
    [validation, setValidation] = useState<string | null>(null),
    [saved, setSaved] = useState<Course | null>(null);
  const rx = useMedicationQuery(
    scope,
    ["source", prescriptionId],
    (options) => clinicalApi.detail(scope.owner!, prescriptionId!, options),
    prescribed && validSource,
  );
  const source = rx.data?.items[Number(item)];
  const write = useMedicationWrite(scope, async (result) => {
    const fresh = await medicationApi.detail(scope.owner!, result.id, {
      isSessionCurrent: scope.isCurrent,
    });
    if (scope.isCurrent()) setSaved(fresh);
  });
  function submit() {
    if (!scope.owner || write.locked || !confirmed) return;
    const daily = times.trim() ? times.split(",").map((value) => value.trim()) : [];
    if (
      !z.iso.date().safeParse(start).success ||
      (end && (!z.iso.date().safeParse(end).success || end < start)) ||
      daily.length > 12 ||
      daily.some((value) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) ||
      new Set(daily).size !== daily.length ||
      !zone.trim()
    ) {
      setValidation(
        "Use valid YYYY-MM-DD dates, a timezone, and distinct HH:MM daily times separated by commas.",
      );
      return;
    }
    const fields = medicineSchema.safeParse(medicine);
    if (!prescribed && !fields.success) {
      setValidation("Complete the medicine name, strength, form, dose, route and frequency.");
      return;
    }
    if (prescribed && (!source || rx.data?.status !== "issued")) return;
    setValidation(null);
    write.send({
      suffix: "",
      kind: "course",
      body: {
        ...(prescribed
          ? { prescription_id: prescriptionId, prescription_item: Number(item) }
          : { medicine: fields.success ? fields.data : medicine }),
        start_date: start,
        end_date: end || null,
        timezone: zone.trim(),
        daily_times: daily,
      },
    });
  }
  if (!scope.owner) return <Text className={text}>Sign in to add a medication.</Text>;
  if (prescribed && !validSource)
    return <InfoCallout tone="error">Open a medicine from your saved prescription.</InfoCallout>;
  if (prescribed && rx.isPending) return <SkeletonCard shape="provider-card" count={2} />;
  if (prescribed && (rx.error || !source || rx.data?.status !== "issued"))
    return (
      <ErrorPanel
        title="Prescription unavailable for tracking"
        body="Choose an issued prescription from your own history."
        retry={() => rx.refetch()}
      />
    );
  if (saved)
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <CourseContents course={saved} />
        <Text className={text}>Saved to your medication record.</Text>
        <Button
          label="View saved medication"
          onPress={() =>
            router.replace({
              pathname: "/(app)/medication-details",
              params: { id: saved.id },
            } as Href)
          }
        />
      </ScrollView>
    );
  return (
    <KeyboardInset>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      >
        <InfoCallout>
          {prescribed
            ? "The medicine and directions come from your saved prescription. Choose tracking dates and times that match your care plan."
            : "This is your own medication report, not a prescription. Enter the directions you have been given."}
        </InfoCallout>
        {!prescribed && !labelUri && Object.values(medicine).every((value) => !value) ? (
          <Button
            label="Photograph a label before typing"
            variant="outline"
            disabled={write.locked}
            onPress={() => router.push("/(app)/medication-scan" as Href)}
          />
        ) : null}
        {source ? (
          <View className="gap-sm">
            <Text className="font-headline-md text-headline-md text-on-surface">
              {source.drug_name} {source.strength} · {source.form}
            </Text>
            <Text className={text}>
              {source.dose} · {source.route} · {source.frequency} · {source.duration}
            </Text>
            <Text className={text}>{source.instructions}</Text>
          </View>
        ) : (
          labels.map(([field, label, maxLength]) => (
            <Field
              key={field}
              label={label}
              maxLength={maxLength}
              value={medicine[field]}
              disabled={write.locked}
              onChange={(value) => setMedicine({ ...medicine, [field]: value })}
            />
          ))
        )}
        {labelUri ? (
          <>
            <Image
              source={{ uri: labelUri }}
              style={{ height: 180, width: "100%" }}
              contentFit="contain"
              accessibilityLabel="Temporary medication label preview"
            />
            <Text className={text}>
              This photo is a temporary reference. It is not uploaded or saved with the medication.
            </Text>
          </>
        ) : null}
        <Field
          label="Tracking start (YYYY-MM-DD)"
          value={start}
          onChange={setStart}
          disabled={write.locked}
          maxLength={10}
        />
        <Field
          label="Planned end (optional, YYYY-MM-DD)"
          value={end}
          onChange={setEnd}
          disabled={write.locked}
          maxLength={10}
        />
        <Field
          label="Timezone (for example, Africa/Accra)"
          value={zone}
          onChange={setZone}
          disabled={write.locked}
          maxLength={64}
        />
        <Field
          label="Daily times (HH:MM, separated by commas)"
          value={times}
          onChange={setTimes}
          disabled={write.locked}
          maxLength={84}
        />
        <Text className={text}>
          Leave daily times blank for manual dose entries. Times are for your tracking log; they do
          not change the prescribed directions or set notifications. Dates and times stay with this
          record.
        </Text>
        <ConsentRow
          accessibilityLabel="I checked the medicine, directions and tracking plan"
          checked={confirmed}
          onChange={(next) => {
            if (!write.locked) setConfirmed(next);
          }}
        >
          I checked the medicine, directions and tracking plan
        </ConsentRow>
        {validation ? <InfoCallout tone="error">{validation}</InfoCallout> : null}
        <WriteFeedback
          write={write}
          reload={async () => {
            if (prescribed) await rx.refetch();
            write.reloaded();
          }}
        />
        <Button
          label={write.busy ? "Saving medication…" : "Save medication"}
          disabled={!confirmed || write.locked}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardInset>
  );
}
export function AddMedicationScreen() {
  const scope = useSessionScope();
  const params = useLocalSearchParams<{
    prescriptionId?: string;
    item?: string;
    labelUri?: string;
  }>();
  return (
    <DetailShell title="Add medication" onBack={back}>
      <Add
        key={scope.owner + ":" + scope.revision + ":" + params.prescriptionId + ":" + params.item}
        scope={scope}
        {...params}
      />
    </DetailShell>
  );
}
