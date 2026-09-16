import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, Text } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import { Button, Card, ErrorPanel, SkeletonCard } from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { client } from "@/lib/api/client";
import {
  consumeNativeHospitalReturn,
  consumeWebHospitalReturn,
  openHospitalPortal,
} from "@/lib/partner/open-hospital";

interface Workspace {
  hospital_id: string;
  hospital_name: string;
  hms_role: string;
}
export function HospitalWorkspacesScreen() {
  const scope = useSessionScope();
  const { handoff_state: returnedState } = useLocalSearchParams<{ handoff_state?: string }>();
  const active = useRef<AbortController | null>(null);
  const [opening, setOpening] = useState(false),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["hospital-workspaces", scope.owner, scope.revision],
    enabled: !!scope.owner,
    staleTime: 0,
    gcTime: 0,
    queryFn: ({ signal }) =>
      client.get<Workspace[]>("/v1/hms/auth/workspaces", {
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
              ? consumeWebHospitalReturn(scope.owner!)
              : await consumeNativeHospitalReturn(scope.owner!, returnedState);
          if (!controller.signal.aborted && scope.isCurrent()) {
            if (returned) router.setParams({ handoff_state: undefined });
            await query.refetch();
          }
        })().catch((failure) => {
          if (!controller.signal.aborted && scope.isCurrent())
            setError(
              failure instanceof Error ? failure.message : "Refresh your hospital access below.",
            );
        });
      return () => controller.abort();
    }, [scope.owner, scope.isCurrent, returnedState, query.refetch]),
  );
  async function open() {
    if (active.current || !scope.owner || !scope.isCurrent()) return;
    const controller = new AbortController();
    active.current = controller;
    setOpening(true);
    setError("");
    try {
      await openHospitalPortal({
        owner: scope.owner,
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
          failure instanceof Error ? failure.message : "The hospital portal could not be opened.",
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
      title="Hospital workspaces"
      testID="hospital-workspaces"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)" as Href);
      }}
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <Text
          accessibilityRole="header"
          className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface"
        >
          Your hospital access
        </Text>
        <Text className="font-body-md text-body-md text-on-surface-variant">
          Open the hospital portal with your MedApp account. Your hospital administrator manages
          your staff access.
        </Text>
        {error ? (
          <Text accessibilityRole="alert" className="font-body-md text-body-md text-error">
            {error}
          </Text>
        ) : null}
        {!scope.owner ? (
          <Text className="font-body-md text-body-md text-on-surface">
            Sign in to view your hospital workspaces.
          </Text>
        ) : query.isPending ? (
          <SkeletonCard shape="provider-card" count={2} />
        ) : query.error ? (
          <ErrorPanel
            title="Could not load hospital access"
            body="Your current hospital memberships could not be checked."
            retry={() => query.refetch()}
          />
        ) : query.data?.length ? (
          <>
            {query.data.map((workspace) => (
              <Card key={workspace.hospital_id} className="gap-sm">
                <Text
                  accessibilityRole="header"
                  className="font-headline-md text-headline-md text-on-surface"
                >
                  {workspace.hospital_name}
                </Text>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  {workspace.hms_role.replaceAll("_", " ")}
                </Text>
              </Card>
            ))}
            <Button
              label="Open hospital portal"
              loading={opening}
              disabled={opening}
              onPress={() => void open()}
            />
          </>
        ) : (
          <Card className="gap-sm">
            <Text className="font-headline-md text-headline-md text-on-surface">
              No hospital workspaces yet
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              An active staff membership is needed. Contact your hospital administrator if you
              expected access, then refresh this page.
            </Text>
          </Card>
        )}
        {scope.owner ? (
          <Button
            label="Refresh hospital access"
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
