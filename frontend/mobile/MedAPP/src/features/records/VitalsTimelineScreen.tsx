import { useCallback, useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router, useFocusEffect, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import {
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  InfoCallout,
  Input,
  SkeletonCard,
} from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { useDebouncedValue } from "@/features/care/hooks/use-debounced-value";
import { rangeStart, vitalLabel, vitalTimelineApi } from "./vital-timeline-api";

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "All time", days: null },
] as const;

export function VitalsTimelineScreen() {
  const scope = useSessionScope();
  if (!scope.owner) return null;
  return <Timeline key={`${scope.owner}:${scope.revision}`} {...scope} owner={scope.owner} />;
}

function Timeline({
  owner,
  revision,
  isCurrent,
}: {
  owner: string;
  revision: number;
  isCurrent: () => boolean;
}) {
  const [days, setDays] = useState<number | null>(30);
  const [kind, setKind] = useState("");
  const filterKind = useDebouncedValue(kind.trim());
  const [anchor, setAnchor] = useState(() => Date.now());
  const from = rangeStart(days, anchor);
  const filters = useMemo(() => ({ from, kind: filterKind || undefined }), [from, filterKind]);
  const query = useInfiniteQuery({
    queryKey: ["ehr", "vital-pages", owner, revision, filters],
    queryFn: ({ pageParam, signal }) =>
      vitalTimelineApi.list(owner, filters, pageParam, { signal, isSessionCurrent: isCurrent }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    gcTime: 0,
  });
  const refetch = query.refetch;
  useFocusEffect(
    useCallback(() => {
      setAnchor(Date.now());
      if (isCurrent()) void refetch();
    }, [isCurrent, refetch]),
  );
  const items = [
    ...new Map(
      query.data?.pages.flatMap((page) => page.items).map((vital) => [vital.id, vital]) ?? [],
    ).values(),
  ];
  const refresh = async () => {
    if (isCurrent()) {
      setAnchor(Date.now());
      await refetch();
    }
  };
  return (
    <DetailShell
      title="Vitals timeline"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(app)" as Href))}
    >
      <FlatList
        data={query.isError && !query.isFetchNextPageError ? [] : items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => void refresh()}
        ListHeaderComponent={
          <View className="gap-4 pb-2">
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Your recorded measurements, newest first. Values and units are shown as entered in
              your EHR.
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {RANGES.map((range) => (
                <Button
                  key={range.label}
                  label={range.label}
                  variant={days === range.days ? "primary" : "outline"}
                  accessibilityState={{ selected: days === range.days }}
                  onPress={() => {
                    setDays(range.days);
                    setAnchor(Date.now());
                  }}
                />
              ))}
            </View>
            <Input
              accessibilityLabel="Filter by recorded measurement type"
              placeholder="Measurement, e.g. blood pressure"
              value={kind}
              onChangeText={setKind}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={64}
            />
            {filterKind ? (
              <InfoCallout>
                Showing measurement types matching “{filterKind}”. Clear the filter to see all
                types.
              </InfoCallout>
            ) : null}
            <Button
              label="Manage care-team sharing"
              variant="outline"
              onPress={() => router.push("/(app)/care-team-sharing" as Href)}
            />
          </View>
        }
        ListEmptyComponent={
          query.isPending ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Loading recorded vitals"
              testID="vital-timeline-loading"
            >
              <SkeletonCard shape="vital-stat-card" />
            </View>
          ) : query.isError ? (
            <ErrorPanel
              title="Vitals couldn't load"
              body="Check your connection and retry. No recorded measurements have been changed."
              retry={refresh}
            />
          ) : (
            <EmptyState
              title={
                filterKind || days !== null
                  ? "No readings match these filters"
                  : "No recorded vitals yet"
              }
              body="Measurements appear after they are recorded by an authorized clinician or successfully synced to your EHR."
              action={
                filterKind || days !== null
                  ? {
                      label: "Show all readings",
                      onPress: () => {
                        setKind("");
                        setDays(null);
                      },
                    }
                  : {
                      label: "Find a clinician",
                      onPress: () => router.push("/(app)/find-care" as Href),
                    }
              }
            />
          )
        }
        renderItem={({ item }) => (
          <Card className="gap-2 p-4" testID={`vital-${item.id}`}>
            <Text className="font-headline-md text-headline-md text-on-surface">
              {vitalLabel(item.kind)}
            </Text>
            <Text selectable className="font-headline-lg text-headline-lg text-primary">
              {item.value}
              {item.unit ? ` ${item.unit}` : ""}
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              {new Date(item.recordedAtIso).toLocaleString()}
            </Text>
            {item.note ? (
              <Text selectable className="font-body-md text-body-md text-on-surface">
                {item.note}
              </Text>
            ) : null}
          </Card>
        )}
        ListFooterComponent={
          query.isFetchNextPageError ? (
            <ErrorPanel
              title="More readings couldn't load"
              body="The readings above are still available. Retry to load the next page."
              retry={() => query.fetchNextPage()}
            />
          ) : query.hasNextPage ? (
            <Button
              label={query.isFetchingNextPage ? "Loading readings…" : "Load more readings"}
              disabled={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            />
          ) : null
        }
      />
    </DetailShell>
  );
}
