import type { ReactNode } from "react";
import { router, type Href } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { DetailShell } from "@/components/shell";
import { Button, SkeletonCard } from "@/components/ui";
import { ApiError } from "@/types/api";
import { useProfessionalProfile } from "./use-professional-profile";

export function ProfessionalNotice({
  title,
  message,
  loading,
  onRetry,
}: {
  title: string;
  message: string;
  loading?: boolean;
  onRetry?: () => void;
}) {
  return (
    <DetailShell title="Professional workspace" onBack={() => router.replace("/(app)" as Href)}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text
          accessibilityRole="header"
          className="font-headline-md text-headline-md text-on-surface"
        >
          {title}
        </Text>
        <Text className="font-body-md text-body-md text-on-surface-variant">{message}</Text>
        {loading ? <SkeletonCard shape="provider-card" count={1} /> : null}
        {onRetry ? <Button label="Try again" onPress={onRetry} /> : null}
        <Button
          label="Application status"
          variant="outline"
          onPress={() => router.push("/(app)/onboarding-status" as Href)}
        />
        <Button
          label="Return to patient home"
          variant="ghost"
          onPress={() => router.replace("/(app)" as Href)}
        />
      </ScrollView>
    </DetailShell>
  );
}

/** UI entry check; service endpoints independently authorize every request. */
export function ProfessionalAccess({
  children,
  doctorsOnly = false,
}: {
  children: ReactNode;
  doctorsOnly?: boolean;
}) {
  const { owner, revision, kind, query } = useProfessionalProfile();
  if (!owner || !kind || (doctorsOnly && kind !== "doctors"))
    return (
      <ProfessionalNotice
        title="Workspace access unavailable"
        message="This workspace requires an activated doctor account. Check your professional application status or return to your patient account."
      />
    );
  if (query.isPending)
    return (
      <ProfessionalNotice
        title="Checking professional access"
        message="Loading your professional profile…"
        loading
      />
    );
  if (query.error)
    return (
      <ProfessionalNotice
        title={
          query.error instanceof ApiError && query.error.status === 404
            ? "Profile activation needed"
            : "Could not check professional access"
        }
        message="Your professional profile must be available before this workspace can open."
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data?.isActive)
    return (
      <ProfessionalNotice
        title="Professional profile inactive"
        message="Your profile is inactive. Professional actions are unavailable until your access is restored."
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <View className="flex-1" key={`${owner}:${revision}:${kind}`}>
      {children}
    </View>
  );
}
