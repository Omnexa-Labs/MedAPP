import { useCallback, useRef, useState } from "react";
import { FlatList, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import { Button, Card, ErrorPanel, SkeletonCard } from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { describeSaveResult, saveTextDocument } from "@/lib/documents";
import {
  clinicalApi,
  handoffLabel,
  prescriptionStatus,
  prescriptionCopy,
  type ClinicalPrescription,
} from "./clinical-api";

const text = "font-body-md text-body-md text-on-surface";
function back() {
  if (router.canGoBack()) router.back();
  else router.replace("/(app)/prescription-history" as Href);
}
export function PrescriptionContents({ rx }: { rx: ClinicalPrescription }) {
  return (
    <View className="gap-md">
      <Card className="gap-sm">
        <Text
          accessibilityRole="header"
          className="font-headline-md text-headline-md text-on-surface"
        >
          {prescriptionStatus(rx)}
        </Text>
        <Text className={text}>Prescriber: {rx.prescriber_name}</Text>
        {rx.issued_at ? (
          <Text className={text}>Issued {new Date(rx.issued_at).toLocaleString()}</Text>
        ) : null}
        <Text className={text}>Valid for dispensing through {rx.valid_until} (UTC)</Text>
        {rx.clinical_goal ? <Text className={text}>Clinical goal: {rx.clinical_goal}</Text> : null}
        {rx.change_reason ? <Text className={text}>Change reason: {rx.change_reason}</Text> : null}
        <Text selectable className="font-label-sm text-label-sm text-on-surface-variant">
          Prescription {rx.id}
        </Text>
      </Card>
      {rx.items.map((item, index) => (
        <Card key={index} className="gap-sm">
          <Text
            accessibilityRole="header"
            className="font-headline-md text-headline-md text-on-surface"
          >
            {item.drug_name} {item.strength} · {item.form}
          </Text>
          <Text className={text}>
            Dose: {item.dose} · {item.route}
          </Text>
          <Text className={text}>
            {item.frequency} · {item.duration}
          </Text>
          <Text className={text}>Quantity prescribed: {item.quantity}</Text>
          {item.instructions ? <Text className={text}>{item.instructions}</Text> : null}
        </Card>
      ))}
      <Card className="gap-sm">
        <Text
          accessibilityRole="header"
          className="font-headline-md text-headline-md text-on-surface"
        >
          Pharmacy handoff
        </Text>
        {rx.deliveries.length ? (
          rx.deliveries.map((delivery) => (
            <Text key={delivery.id} className={text}>
              {handoffLabel(delivery)}
            </Text>
          ))
        ) : (
          <Text className={text}>This prescription has not been sent to a pharmacy.</Text>
        )}
        <Text className="font-body-md text-body-md text-on-surface-variant">
          Pharmacy receipt does not mean medicines are ready for collection. Check the pharmacy
          report for quantities supplied.
        </Text>
      </Card>
    </View>
  );
}

function History({ scope }: { scope: ReturnType<typeof useSessionScope> }) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ["clinical-prescriptions", scope.owner, scope.revision, offset],
    enabled: !!scope.owner,
    gcTime: 0,
    staleTime: 0,
    queryFn: ({ signal }) =>
      clinicalApi.list(scope.owner!, offset, { signal, isSessionCurrent: scope.isCurrent }),
  });
  useFocusEffect(
    useCallback(() => {
      if (scope.owner) void query.refetch();
    }, [scope.owner, query.refetch]),
  );
  return (
    <FlatList
      data={query.error ? [] : (query.data?.items ?? [])}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      refreshing={query.isFetching && !query.isPending}
      onRefresh={() => void query.refetch()}
      ListHeaderComponent={
        <View className="gap-sm">
          <Text className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            Your prescriptions
          </Text>
          <Text className={text}>
            Prescriptions issued by your doctors. Issued status does not mean a medicine course is
            complete.
          </Text>
          <Button
            label="View pharmacy reports"
            variant="outline"
            onPress={() => router.push("/(app)/pharmacy-prescription-history" as Href)}
          />
        </View>
      }
      ListEmptyComponent={
        !scope.owner ? (
          <Text className={text}>Sign in to view prescriptions.</Text>
        ) : query.isPending ? (
          <SkeletonCard shape="provider-card" count={2} />
        ) : query.error ? (
          <ErrorPanel
            title="Could not load prescriptions"
            body="Your saved records could not be checked."
            retry={() => query.refetch()}
          />
        ) : (
          <Text className={text}>
            {offset ? "No prescriptions on this page." : "No issued prescriptions yet."}
          </Text>
        )
      }
      renderItem={({ item }) => (
        <Card className="gap-sm">
          <Text className="font-headline-md text-headline-md text-on-surface">
            {item.items.map((line) => line.drug_name).join(", ")}
          </Text>
          <Text className={text}>
            {prescriptionStatus(item)} · {item.prescriber_name}
          </Text>
          <Button
            label="View prescription"
            accessibilityLabel={`View prescription for ${item.items[0].drug_name}`}
            onPress={() =>
              router.push({
                pathname: "/(app)/active-script-view",
                params: { id: item.id },
              } as Href)
            }
          />
        </Card>
      )}
      ListFooterComponent={
        <View className="gap-sm">
          {offset > 0 ? (
            <Button
              label="Previous prescriptions"
              variant="outline"
              disabled={query.isFetching}
              onPress={() => setOffset(offset - 25)}
            />
          ) : null}
          {!query.error && query.data?.next_offset != null ? (
            <Button
              label="More prescriptions"
              disabled={query.isFetching}
              onPress={() => setOffset(query.data!.next_offset!)}
            />
          ) : null}
        </View>
      }
    />
  );
}
export function ClinicalPrescriptionHistory() {
  const scope = useSessionScope();
  return (
    <DetailShell
      title="Prescriptions"
      onBack={() =>
        router.canGoBack() ? router.back() : router.replace("/(app)/overview" as Href)
      }
    >
      <History key={`${scope.owner}:${scope.revision}`} scope={scope} />
    </DetailShell>
  );
}
function Detail({ id, scope }: { id?: string; scope: ReturnType<typeof useSessionScope> }) {
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const savingRef = useRef(false);
  async function saveCopy() {
    if (!scope.owner || !id || !scope.isCurrent() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveMessage(null);
    try {
      const fresh = await clinicalApi.detail(scope.owner, id, {
        isSessionCurrent: scope.isCurrent,
      });
      if (!scope.isCurrent()) return;
      const result = await saveTextDocument({
        fileName: `MedApp-prescription-${fresh.id}.txt`,
        body: prescriptionCopy(fresh),
        dialogTitle: "Save or share your prescription copy",
      });
      if (scope.isCurrent()) setSaveMessage(describeSaveResult(result).message);
    } catch {
      if (scope.isCurrent())
        setSaveMessage("Could not confirm and save the current prescription. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const query = useQuery({
    queryKey: ["clinical-prescription", scope.owner, scope.revision, id],
    enabled: !!scope.owner && !!id,
    gcTime: 0,
    staleTime: 0,
    queryFn: ({ signal }) =>
      clinicalApi.detail(scope.owner!, id!, { signal, isSessionCurrent: scope.isCurrent }),
  });
  useFocusEffect(
    useCallback(() => {
      if (scope.owner && id) void query.refetch();
    }, [scope.owner, id, query.refetch]),
  );
  if (!id || !scope.owner)
    return (
      <View className="p-md">
        <Text className={text}>
          Open a prescription from your history to view its saved details.
        </Text>
        <Button
          label="Prescription history"
          onPress={() => router.replace("/(app)/prescription-history" as Href)}
        />
      </View>
    );
  if (query.isPending) return <SkeletonCard shape="provider-card" count={2} />;
  if (query.error || !query.data)
    return (
      <ErrorPanel
        title="Prescription unavailable"
        body="It may be unavailable to this account, or the service could not be reached."
        retry={() => query.refetch()}
      />
    );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 40 }}>
      <PrescriptionContents rx={query.data} />
      {query.data.status === "issued"
        ? query.data.items.map((medicine, index) => (
            <Button
              key={index}
              label={`Track ${medicine.drug_name}`}
              variant="outline"
              onPress={() =>
                router.push({
                  pathname: "/(app)/add-medication",
                  params: { prescriptionId: query.data!.id, item: String(index) },
                } as Href)
              }
            />
          ))
        : null}
      <Button
        label="View medication tracking"
        variant="outline"
        onPress={() => router.push("/(app)/active-medications" as Href)}
      />
      <Button
        label={saving ? "Preparing copy…" : "Save or share text copy (.txt)"}
        disabled={saving}
        variant="outline"
        onPress={() => void saveCopy()}
      />
      {saveMessage ? (
        <Text accessibilityLiveRegion="polite" className={text}>
          {saveMessage}
        </Text>
      ) : null}
      {query.data.replaces_id ? (
        <Button
          label="View original prescription"
          variant="outline"
          onPress={() =>
            router.push({
              pathname: "/(app)/active-script-view",
              params: { id: query.data!.replaces_id! },
            } as Href)
          }
        />
      ) : null}
      <Button
        label="View pharmacy reports"
        onPress={() => router.push("/(app)/pharmacy-prescription-history" as Href)}
      />
    </ScrollView>
  );
}
export function ClinicalPrescriptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const scope = useSessionScope();
  return (
    <DetailShell title="Prescription details" onBack={back}>
      <Detail
        key={`${scope.owner}:${scope.revision}:${id}`}
        id={typeof id === "string" ? id : undefined}
        scope={scope}
      />
    </DetailShell>
  );
}
