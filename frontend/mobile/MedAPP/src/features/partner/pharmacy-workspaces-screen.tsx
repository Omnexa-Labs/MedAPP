import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, Text } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import { Button, Card, ErrorPanel, SkeletonCard } from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { getPharmacyWorkspaces, type PharmacyWorkspace } from "./pharmacy-workspaces-api";
import {
  consumeNativePharmacyReturn,
  consumeWebPharmacyReturn,
  openPharmacyPortal,
} from "@/lib/partner/open-pharmacy";

export function PharmacyWorkspacesScreen() {
  const scope = useSessionScope();
  const { handoff_state: returnedState } = useLocalSearchParams<{ handoff_state?: string }>();
  const active = useRef<AbortController | null>(null);
  const [opening, setOpening] = useState(false),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["pharmacy-workspaces", scope.owner, scope.revision],
    enabled: !!scope.owner,
    staleTime: 0,
    gcTime: 0,
    queryFn: ({ signal }) =>
      getPharmacyWorkspaces({
        signal,
        isSessionCurrent: scope.isCurrent,
      }),
  });
  useEffect(() => {
    setError("");
    setOpening(false);
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [scope.owner, scope.revision]);
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      if (!active.current && scope.owner)
        void (async () => {
          const returned =
            Platform.OS === "web"
              ? consumeWebPharmacyReturn(scope.owner!)
              : await consumeNativePharmacyReturn(scope.owner!, returnedState);
          if (!controller.signal.aborted && scope.isCurrent()) {
            if (returned) router.setParams({ handoff_state: undefined });
            await query.refetch();
          }
        })().catch((failure) => {
          if (!controller.signal.aborted && scope.isCurrent())
            setError(
              failure instanceof Error ? failure.message : "Refresh your pharmacy access below.",
            );
        });
      return () => controller.abort();
    }, [scope.owner, scope.isCurrent, returnedState, query.refetch]),
  );
  async function open(workspace: PharmacyWorkspace) {
    if (active.current || !scope.owner || !scope.isCurrent()) return;
    const controller = new AbortController();
    active.current = controller;
    setOpening(true);
    setError("");
    try {
      await openPharmacyPortal({
        owner: scope.owner,
        pharmacyId: workspace.pharmacy_id,
        portalOrigin: workspace.web_origin,
        signal: controller.signal,
        isSessionCurrent: scope.isCurrent,
      });
      if (!controller.signal.aborted && scope.isCurrent()) {
        router.setParams({ handoff_state: undefined });
        await query.refetch();
      }
    } catch (failure) {
      if (!controller.signal.aborted && scope.isCurrent())
        setError(
          failure instanceof Error ? failure.message : "The pharmacy portal could not be opened.",
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setOpening(false);
      }
    }
  }
  return (
    <DetailShell
      title="Pharmacy workspaces"
      testID="pharmacy-workspaces"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)" as Href);
      }}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <Text
          accessibilityRole="header"
          className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface"
        >
          Your pharmacy access
        </Text>
        <Text className="font-body-md text-body-md text-on-surface-variant">
          Open the workspace assigned to your approved pharmacy application. The pharmacy portal checks your current access before opening.
        </Text>
        {error ? (
          <Text accessibilityRole="alert" className="font-body-md text-body-md text-error">
            {error}
          </Text>
        ) : null}
        {!scope.owner ? (
          <Text className="font-body-md text-body-md text-on-surface">
            Sign in to view your pharmacy workspaces.
          </Text>
        ) : query.isPending ? (
          <SkeletonCard shape="provider-card" count={2} />
        ) : query.error ? (
          <ErrorPanel
            title="Could not load pharmacy access"
            body="Your current pharmacy memberships could not be checked."
            retry={() => query.refetch()}
          />
        ) : query.data?.length ? (
          <>
            {query.data.map((workspace) => (
              <Card key={workspace.pharmacy_id} className="gap-sm">
                <Text
                  accessibilityRole="header"
                  className="font-headline-md text-headline-md text-on-surface"
                >
                  {workspace.pharmacy_name}
                </Text>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  Pharmacy owner
                </Text>
                <Button label={'Open ' + workspace.pharmacy_name} loading={opening} disabled={opening || query.isFetching} onPress={() => void open(workspace)} />
              </Card>
            ))}
          </>
        ) : (
          <Card className="gap-sm">
            <Text className="font-headline-md text-headline-md text-on-surface">
              No pharmacy workspaces yet
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Your pharmacy application needs approval and completed workspace setup. Check Professional applications for its current status.
            </Text>
          </Card>
        )}
        {scope.owner ? (
          <Button
            label="Refresh pharmacy access"
            variant="outline"
            disabled={query.isFetching || opening}
            loading={query.isFetching}
            onPress={() => {
              setError("");
              void query.refetch();
            }}
          />
        ) : null}
        <Button
          label="Professional applications"
          variant="ghost"
          onPress={() => router.push("/(app)/onboarding-status" as Href)}
        />
      </ScrollView>
    </DetailShell>
  );
}
