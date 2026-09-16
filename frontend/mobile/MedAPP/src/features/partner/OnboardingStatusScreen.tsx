import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import { Button, Card, ErrorPanel, SkeletonCard } from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { professionalKind } from "@/features/practitioner/professional-api";
import { partnerApi, type PartnerApplication } from "./api";
import {
  consumeNativeOnboardingReturn,
  consumeWebOnboardingReturn,
  openOnboarding,
} from "@/lib/partner/open-onboarding";
import { authApi } from "@/features/auth/api";
import { useAuthStore } from "@/store/auth-store";
import { refreshSession } from "@/lib/api/client";

const statusCopy: Record<string, { label: string; detail: string }> = {
  draft: { label: "Draft", detail: "Your application has not been submitted for review." },
  submitted: { label: "Application submitted", detail: "Your application is waiting for review." },
  under_review: { label: "Under review", detail: "Your submitted credentials are being reviewed." },
  approved: {
    label: "Application approved",
    detail:
      "The application was approved. Professional account activation and profile setup are separate steps.",
  },
  rejected: {
    label: "Changes needed",
    detail: "Review the feedback below before submitting corrected credentials.",
  },
};
function ApplicationCard({
  application,
  onOpen,
  opening,
}: {
  application: PartnerApplication;
  onOpen: () => void;
  opening: boolean;
}) {
  const state = statusCopy[application.status] ?? {
    label: "Status unavailable",
    detail:
      "This application has a status this app cannot display yet. Refresh to check for an update.",
  };
  return (
    <Card className="gap-sm">
      <Text
        accessibilityRole="header"
        className="font-headline-md text-headline-md text-on-surface"
      >
        {application.displayName || application.legalName}
      </Text>
      <Text className="font-body-sm text-body-sm text-on-surface-variant">
        {application.partnerType === "practitioner"
          ? "Practitioner application"
          : application.partnerType === "pharmacy"
            ? "Pharmacy application"
            : application.partnerType === "hospital"
              ? "Hospital application"
              : "Professional application"}
      </Text>
      <Text
        className={`font-label-md text-label-md ${application.status === "rejected" ? "text-error" : "text-primary"}`}
      >
        {state.label}
      </Text>
      <Text className="font-body-md text-body-md text-on-surface-variant">{state.detail}</Text>
      {application.status === "rejected" ? (
        <Text className="font-body-md text-body-md text-error">
          {application.rejectionReason || "No review feedback was provided."}
        </Text>
      ) : null}
      {application.submittedAtIso ? (
        <Text className="font-body-sm text-body-sm text-on-surface-variant">
          Submitted: {new Date(application.submittedAtIso).toLocaleDateString()}
        </Text>
      ) : null}
      {application.reviewedAtIso ? (
        <Text className="font-body-sm text-body-sm text-on-surface-variant">
          Last reviewed: {new Date(application.reviewedAtIso).toLocaleDateString()}
        </Text>
      ) : null}
      <Button
        label={
          application.status === "draft"
            ? "Continue application"
            : application.status === "rejected"
              ? "Correct application"
              : "View application on website"
        }
        variant="outline"
        disabled={opening}
        onPress={onOpen}
      />
    </Card>
  );
}
export function OnboardingStatusScreen() {
  const { handoff_state: returnedState } = useLocalSearchParams<{ handoff_state?: string }>();
  const scope = useSessionScope();
  const kind = professionalKind(scope.user);
  const [opening, setOpening] = useState(false);
  const [handoffError, setHandoffError] = useState("");
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(
    async (signal?: AbortSignal, forceRenewal = false) => {
      if (!scope.isCurrent()) return;
      const user = await authApi.me({ signal, isSessionCurrent: scope.isCurrent });
      if (!signal?.aborted && scope.isCurrent() && user.id === scope.owner) {
        if (forceRenewal || user.accountRole !== useAuthStore.getState().user?.accountRole) {
          // /me reflects the live role, but service permissions use the JWT.
          // Reuse the same serialized renewal as normal 401 recovery.
          if (!(await refreshSession()))
            throw new Error("Sign in again to refresh your professional access.");
          return;
        }
        useAuthStore.getState().setUser(user);
      }
    },
    [scope.isCurrent, scope.owner],
  );
  const query = useQuery({
    queryKey: ["professional", "applications", scope.owner, scope.revision],
    enabled: !!scope.owner,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) =>
      (await partnerApi.listApplications({ signal, isSessionCurrent: scope.isCurrent })).filter(
        (row) => row.ownerId === scope.owner,
      ),
  });
  const retry = async () => {
    if (!scope.isCurrent()) return;
    setHandoffError("");
    try {
      await Promise.all([refresh(undefined, true), query.refetch()]);
      if (scope.isCurrent()) router.setParams({ handoff_state: undefined });
    } catch (error) {
      if (scope.isCurrent())
        setHandoffError(error instanceof Error ? error.message : "Could not refresh your account.");
    }
  };
  useEffect(() => {
    setOpening(false);
    setHandoffError("");
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && scope.isCurrent()) {
        void query.refetch();
        void refresh().catch(() => {});
      }
    });
    return () => {
      active.current?.abort();
      active.current = null;
      subscription.remove();
    };
  }, [scope.owner, scope.revision, scope.isCurrent, refresh, query.refetch]);
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      // The active browser promise handles a warm return. A new app process uses
      // its persisted marker before requesting fresh JWT permissions.
      if (!active.current)
        void (async () => {
          const returned = scope.owner
            ? Platform.OS === "web"
              ? consumeWebOnboardingReturn(scope.owner)
              : await consumeNativeOnboardingReturn(scope.owner, returnedState)
            : false;
          if (!controller.signal.aborted) await refresh(controller.signal, returned);
          if (returned && !controller.signal.aborted && scope.isCurrent())
            router.setParams({ handoff_state: undefined });
        })().catch((error) => {
          if (!controller.signal.aborted && scope.isCurrent())
            setHandoffError(
              error instanceof Error ? error.message : "Refresh your saved status below.",
            );
        });
      return () => controller.abort();
    }, [refresh, scope.owner, scope.isCurrent, returnedState]),
  );
  async function open(applicationId?: string) {
    if (active.current || !scope.owner || !scope.isCurrent()) return;
    const controller = new AbortController();
    active.current = controller;
    setOpening(true);
    setHandoffError("");
    try {
      const result = await openOnboarding({
        owner: scope.owner,
        applicationId,
        signal: controller.signal,
        isSessionCurrent: scope.isCurrent,
      });
      if (scope.isCurrent() && !controller.signal.aborted && result !== "opening") {
        await Promise.all([refresh(controller.signal, result === "returned"), query.refetch()]);
        if (result === "returned" && scope.isCurrent() && !controller.signal.aborted)
          router.setParams({ handoff_state: undefined });
      }
    } catch (error) {
      if (scope.isCurrent() && !controller.signal.aborted)
        setHandoffError(
          error instanceof Error ? error.message : "Could not open professional onboarding.",
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
      title="Professional applications"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)" as Href);
      }}
      testID="onboarding-status"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <Text
          accessibilityRole="header"
          className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface"
        >
          Your professional applications
        </Text>
        <Text className="font-body-md text-body-md text-on-surface-variant">
          Track the status of credentials submitted for your practice or organization.
        </Text>
        {scope.owner ? (
          <Button
            label="Start professional application"
            loading={opening}
            disabled={opening}
            onPress={() => {
              void open();
            }}
          />
        ) : null}
        {handoffError ? (
          <Text accessibilityRole="alert" className="font-body-md text-body-md text-error">
            {handoffError}
          </Text>
        ) : null}
        {!scope.owner ? (
          <Text className="font-body-md text-body-md text-on-surface">
            Sign in to view your applications.
          </Text>
        ) : query.isPending ? (
          <SkeletonCard shape="provider-card" count={2} />
        ) : query.error ? (
          <ErrorPanel
            title="Could not load application status"
            body="Your current status is unknown. Try again to retrieve your saved applications."
            retry={retry}
          />
        ) : query.data?.length ? (
          query.data.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              opening={opening}
              onOpen={() => {
                void open(application.id);
              }}
            />
          ))
        ) : (
          <Card className="gap-sm">
            <Text className="font-headline-md text-headline-md text-on-surface">
              No applications yet
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              There are no professional applications linked to this account.
            </Text>
          </Card>
        )}
        {scope.owner ? (
          <Button
            label="Refresh application status"
            variant="outline"
            loading={query.isFetching}
            disabled={query.isFetching}
            onPress={retry}
          />
        ) : null}
        {kind ? (
          <View className="gap-sm">
            <Button
              label="Edit professional profile"
              onPress={() => {
                if (scope.isCurrent()) router.push("/(app)/practitioner-profile" as Href);
              }}
            />
            {kind === "doctors" ? (
              <Button
                label="Open doctor workspace"
                variant="outline"
                onPress={() => {
                  if (scope.isCurrent()) router.push("/(app)/practitioner-home" as Href);
                }}
              />
            ) : null}
          </View>
        ) : null}
        <Button
          label="Return to patient home"
          variant="ghost"
          onPress={() => router.replace("/(app)" as Href)}
        />
        {scope.owner ? (
          <Button
            label="Pharmacy workspaces"
            variant="outline"
            onPress={() => router.push("/(app)/pharmacy-workspaces" as Href)}
          />
        ) : null}
        {scope.owner ? (
          <Button
            label="Hospital workspaces"
            variant="outline"
            onPress={() => router.push("/(app)/hospital-workspaces" as Href)}
          />
        ) : null}
      </ScrollView>
    </DetailShell>
  );
}
