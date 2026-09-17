import { useRef, useState } from "react";
import { FlatList, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Button, Card, ErrorPanel, SkeletonCard } from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { describeSaveResult, saveTextDocument } from "@/lib/documents";
import { medicationApi, courseLabel, statusLabel } from "./medication-api";
import { Paging, text, useMedicationQuery, type Scope } from "./MedicationComponents";

function List({ scope }: { scope: Scope }) {
  const [status, setStatus] = useState("all"),
    [offset, setOffset] = useState(0);
  const [saveMessage, setSaveMessage] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const query = useMedicationQuery(scope, ["list", status, offset], (options) =>
    medicationApi.list(scope.owner!, status, offset, options),
  );
  async function save() {
    if (!scope.owner || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveMessage(null);
    try {
      const fresh = await medicationApi.list(scope.owner, status, offset, {
        isSessionCurrent: scope.isCurrent,
      });
      if (!scope.isCurrent()) return;
      const result = await saveTextDocument({
        fileName: "MedApp-medication-tracking.txt",
        dialogTitle: "Save medication tracking page",
        body: [
          "MedApp medication tracking — patient report",
          "Filter: " +
            status +
            "; page " +
            (offset / 25 + 1) +
            (fresh.next_offset !== null ? " (more records on later pages)" : ""),
          "Retrieved: " + new Date().toISOString(),
          "Tracking states and dose reports are patient-reported, not a prescription or proof of treatment completion.",
          "",
          ...fresh.items.map((c) =>
            [
              c.medicine.drug_name + " " + c.medicine.strength + " " + c.medicine.form,
              c.medicine.dose + "; " + c.medicine.route + "; " + c.medicine.frequency,
              c.source === "prescribed"
                ? "Prescriber: " + c.prescriber_name + "; prescription " + c.prescription_id
                : "Self-reported",
              "Tracking: " +
                courseLabel(c) +
                "; " +
                c.start_date +
                " to " +
                (c.end_date ?? "no planned end"),
              (c.daily_times.join(", ") || "Manual entries") + " (" + c.timezone + ")",
              "",
            ].join("\n"),
          ),
        ].join("\n"),
      });
      if (scope.isCurrent()) setSaveMessage(describeSaveResult(result).message);
    } catch {
      if (scope.isCurrent()) setSaveMessage("Could not refresh and save this medication page.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <FlatList
      data={query.error ? [] : (query.data?.items ?? [])}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      refreshing={query.isFetching && !query.isPending}
      onRefresh={() => void query.refetch()}
      ListHeaderComponent={
        <View className="gap-md">
          <Text className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            Your medications
          </Text>
          <Text className={text}>
            Keep a record of your medication use. Tracking status is separate from prescribing and
            pharmacy dispensing.
          </Text>
          <Button
            label="Add a medication"
            onPress={() => router.push("/(app)/add-medication" as Href)}
          />
          <Button
            label="Open dose tracker"
            variant="outline"
            onPress={() => router.push("/(app)/medication-tracker" as Href)}
          />
          <Button
            label="Choose from prescriptions"
            variant="outline"
            onPress={() => router.push("/(app)/prescription-history" as Href)}
          />
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {["all", "active", "paused", "stopped", "completed"].map((value) => (
              <Button
                key={value}
                label={
                  value === "all" ? "All courses" : statusLabel[value as keyof typeof statusLabel]
                }
                accessibilityState={{ selected: value === status }}
                variant={value === status ? "primary" : "outline"}
                onPress={() => {
                  setOffset(0);
                  setStatus(value);
                  setSaveMessage(null);
                }}
              />
            ))}
          </ScrollView>
          {!!query.data?.items.length && !query.error ? (
            <Button
              label={saving ? "Preparing copy…" : "Save this page (.txt)"}
              variant="outline"
              disabled={saving}
              onPress={() => void save()}
            />
          ) : null}
          {saveMessage ? (
            <Text accessibilityLiveRegion="polite" className={text}>
              {saveMessage}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        !scope.owner ? (
          <Text className={text}>Sign in to view medications.</Text>
        ) : query.isPending ? (
          <SkeletonCard shape="provider-card" count={2} />
        ) : query.error ? (
          <ErrorPanel
            title="Could not load medications"
            body="Your saved records could not be checked."
            retry={() => query.refetch()}
          />
        ) : (
          <Text className={text}>No medication courses in this view.</Text>
        )
      }
      renderItem={({ item }) => (
        <Card className="gap-sm">
          <Text className="font-headline-md text-headline-md text-on-surface">
            {item.medicine.drug_name}
          </Text>
          <Text className={text}>
            {item.medicine.strength} · {item.medicine.form}
          </Text>
          <Text className={text}>
            {item.medicine.dose} · {item.medicine.frequency}
          </Text>
          <Text className={text}>
            {courseLabel(item)} ·{" "}
            {item.source === "prescribed" ? "From prescription" : "Self-reported"}
          </Text>
          <Button
            label="View medication"
            accessibilityLabel={"View medication " + item.medicine.drug_name}
            onPress={() =>
              router.push({
                pathname: "/(app)/medication-details",
                params: { id: item.id },
              } as Href)
            }
          />
        </Card>
      )}
      ListFooterComponent={
        <Paging
          offset={offset}
          next={query.error ? null : query.data?.next_offset}
          onPage={setOffset}
          disabled={query.isFetching}
        />
      }
    />
  );
}
export function ActiveMedicationsScreen() {
  const scope = useSessionScope();
  return (
    <DetailShell
      title="Medications"
      onBack={() =>
        router.canGoBack() ? router.back() : router.replace("/(app)/overview" as Href)
      }
    >
      <List key={scope.owner + ":" + scope.revision} scope={scope} />
    </DetailShell>
  );
}
