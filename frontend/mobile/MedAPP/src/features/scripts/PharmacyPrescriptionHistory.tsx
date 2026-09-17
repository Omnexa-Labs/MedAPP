import { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import { Button, Card, ErrorPanel, SkeletonCard } from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { pharmacyPrescriptions, type PharmacyPrescription } from "./pharmacy-prescriptions-api";

const statuses = {
  pending: "Awaiting dispensing",
  partially_dispensed: "Partly dispensed",
  dispensed: "Dispensed",
  cancelled: "Cancelled",
};
function RecordCard({ record }: { record: PharmacyPrescription }) {
  const [expanded, setExpanded] = useState(false);
  const rx = record.snapshot;
  return (
    <Card className="gap-sm">
      <Text
        accessibilityRole="header"
        className="font-headline-md text-headline-md text-on-surface"
      >
        {record.pharmacy_name}
      </Text>
      <Text className="font-label-md text-label-md text-primary">{statuses[rx.status]}</Text>
      <Text className="font-body-md text-body-md text-on-surface">{rx.rx_number}</Text>
      <Text className="font-body-md text-body-md text-on-surface-variant">
        Last reported {new Date(record.reported_at).toLocaleString()}
      </Text>
      {rx.prescriber_name ? (
        <Text className="font-body-md text-body-md text-on-surface">
          Prescriber: {rx.prescriber_name}
        </Text>
      ) : null}
      <Text className="font-body-md text-body-md text-on-surface-variant">
        {rx.items.length} {rx.items.length === 1 ? "medicine" : "medicines"}
      </Text>
      {expanded
        ? rx.items.map((item) => (
            <View key={item.prescription_item_id} className="gap-xs">
              <Text className="font-label-md text-label-md text-on-surface">{item.drug_name}</Text>
              <Text className="font-body-md text-body-md text-on-surface">
                {item.quantity_dispensed} of {item.quantity_prescribed} units dispensed
              </Text>
              {item.quantity_returned > 0 ? (
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  {item.quantity_returned} units later returned to the pharmacy
                </Text>
              ) : null}
              {item.dosage_instructions ? (
                <Text className="font-body-md text-body-md text-on-surface">
                  {item.dosage_instructions}
                </Text>
              ) : null}
            </View>
          ))
        : null}
      <Button
        label={expanded ? "Hide medicines" : "View medicines"}
        accessibilityLabel={`${expanded ? "Hide" : "View"} medicines for ${rx.rx_number}`}
        accessibilityState={{ expanded }}
        variant="outline"
        onPress={() => setExpanded((value) => !value)}
      />
    </Card>
  );
}
function HistoryPage({ scope }: { scope: ReturnType<typeof useSessionScope> }) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ["pharmacy-prescriptions", scope.owner, scope.revision, offset],
    enabled: !!scope.owner,
    staleTime: 0,
    gcTime: 0,
    queryFn: ({ signal }) =>
      pharmacyPrescriptions(offset, { signal, isSessionCurrent: scope.isCurrent }),
  });
  useFocusEffect(
    useCallback(() => {
      if (scope.owner) void query.refetch();
    }, [scope.owner, query.refetch]),
  );
  const data = query.error || !scope.owner ? [] : query.data?.items || [];
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <RecordCard record={item} />}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32, flexGrow: 1 }}
      contentInsetAdjustmentBehavior="automatic"
      refreshing={!!scope.owner && query.isFetching && !query.isPending}
      onRefresh={scope.owner ? () => void query.refetch() : undefined}
      ListHeaderComponent={
        <View className="gap-sm">
          <Text
            accessibilityRole="header"
            className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface"
          >
            Pharmacy records
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            Updates reported by your pharmacy. Dispensing status shows medicines supplied; it does
            not indicate whether you have finished taking them.
          </Text>
        </View>
      }
      ListEmptyComponent={
        !scope.owner ? (
          <Text className="font-body-md text-body-md text-on-surface">
            Sign in to view your pharmacy records.
          </Text>
        ) : query.isPending ? (
          <SkeletonCard shape="provider-card" count={2} />
        ) : query.error ? (
          <ErrorPanel
            title="Could not load pharmacy records"
            body="Your pharmacy reports could not be checked. Please try again."
            retry={() => query.refetch()}
          />
        ) : (
          <Card className="gap-sm">
            <Text className="font-headline-md text-headline-md text-on-surface">
              {offset ? "No records on this page" : "No pharmacy records yet"}
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Confirmed reports from pharmacies linked to your account will appear here.
            </Text>
          </Card>
        )
      }
      ListFooterComponent={
        scope.owner ? (
          <View className="gap-sm">
            {!query.error && query.data ? (
              <Text
                accessibilityLiveRegion="polite"
                className="font-body-md text-body-md text-on-surface-variant"
              >
                {query.data.total
                  ? `${offset + (data.length ? 1 : 0)}–${offset + data.length} of ${query.data.total}`
                  : "0 records"}
              </Text>
            ) : null}
            {offset > 0 ? (
              <Button
                label="Previous records"
                variant="outline"
                disabled={query.isFetching}
                onPress={() => setOffset((value) => Math.max(0, value - 25))}
              />
            ) : null}
            {!query.error && query.data && offset + data.length < query.data.total ? (
              <Button
                label="Next records"
                variant="outline"
                disabled={query.isFetching}
                onPress={() => setOffset((value) => value + 25)}
              />
            ) : null}
            <Button
              label="Refresh pharmacy records"
              variant="outline"
              disabled={query.isFetching}
              onPress={() => void query.refetch()}
            />
          </View>
        ) : null
      }
    />
  );
}
export function PharmacyPrescriptionHistory() {
  const scope = useSessionScope();
  return (
    <DetailShell
      title="Prescriptions"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/overview" as Href);
      }}
    >
      <HistoryPage key={`${scope.owner}:${scope.revision}`} scope={scope} />
    </DetailShell>
  );
}
