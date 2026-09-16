import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DetailShell } from "@/components/shell";
import {
  Button,
  Card,
  DockedActionBar,
  ErrorPanel,
  InfoCallout,
  SectionHeader,
  SkeletonCard,
} from "@/components/ui";
import { ProviderIdentity } from "@/features/telehealth";
import { careApi, type PractitionerKind } from "@/features/care/api";
import { useSessionScope } from "@/hooks/use-session-scope";
import { initialsFor } from "./format";
import { ApiError } from "@/types/api";

const CTA_EDGE_GAP = 16;
function text(value: string | string[] | undefined): string | undefined {
  const trimmed = (Array.isArray(value) ? value[0] : value)?.trim();
  return trimmed && trimmed !== "undefined" ? trimmed : undefined;
}
function ProfileCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <SectionHeader title={title} />
      <Card className="gap-2 p-4">
        <Text className="font-body-md text-body-md text-on-surface-variant">{children}</Text>
      </Card>
    </View>
  );
}

export function PractitionerTelehealthProfileScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    providerId?: string;
    providerKind?: string;
  }>();
  const scope = useSessionScope();
  const id = text(params.providerId) ?? text(params.id);
  const kind = text(params.providerKind) ?? "doctors";
  return (
    <ProfileContent
      key={`${scope.owner}:${scope.revision}:${kind}:${id}`}
      id={id}
      kind={kind}
      scope={scope}
    />
  );
}

function ProfileContent({
  id,
  kind,
  scope,
}: {
  id?: string;
  kind: string;
  scope: ReturnType<typeof useSessionScope>;
}) {
  const insets = useSafeAreaInsets();
  const ctaBottom = CTA_EDGE_GAP + insets.bottom;
  const validKind = ["doctors", "nurses", "pharmacists"].includes(kind);
  const query = useQuery({
    queryKey: ["care", "public-practitioner", scope.owner, scope.revision, kind, id],
    enabled: !!scope.owner && !!id && validKind,
    staleTime: 0,
    gcTime: 0,
    queryFn: ({ signal }) =>
      careApi.getPublicPractitioner(kind as PractitionerKind, id!, {
        signal,
        isSessionCurrent: scope.isCurrent,
      }),
  });
  const provider = query.isError ? undefined : query.data;
  const bookable =
    !!provider && provider.category === "doctors" && provider.isActive && provider.isListable;
  const book = () => {
    if (!bookable || query.isFetching || !scope.isCurrent()) return;
    router.push({
      pathname: "/(app)/select-time-slot",
      params: {
        practitionerId: provider.id,
        practitionerName: provider.name,
        practitionerSpecialty: provider.title,
        ...(provider.avatarUri ? { practitionerAvatar: provider.avatarUri } : {}),
        ...(provider.consultationFeeCents != null
          ? { practitionerFeeCents: String(provider.consultationFeeCents) }
          : {}),
      },
    } as Href);
  };
  const missing = !id || !validKind;
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  return (
    <DetailShell title="Provider profile" claimsBottomInset={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          !missing && scope.owner ? (
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                void query.refetch();
              }}
            />
          ) : undefined
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: (bookable ? 112 : 24) + ctaBottom,
          gap: 16,
        }}
      >
        {missing ? (
          <InfoCallout tone="error">
            We don&apos;t have a provider to show. This link is missing a valid practitioner.
          </InfoCallout>
        ) : !scope.owner ? (
          <InfoCallout tone="info">Sign in to view this provider.</InfoCallout>
        ) : query.isLoading ? (
          <View accessibilityLabel="Loading provider profile">
            <SkeletonCard shape="provider-card" count={2} />
          </View>
        ) : query.isError ? (
          <ErrorPanel
            title={notFound ? "Provider not found" : "Unable to load provider"}
            body={
              notFound
                ? "This profile may have been removed. Find Care can help you choose another clinician."
                : "Check your connection and try again."
            }
            retry={() => query.refetch()}
            retryAccessibilityLabel="Retry loading provider"
          />
        ) : provider ? (
          <>
            <ProviderIdentity
              name={provider.name}
              specialty={provider.title}
              avatarUri={provider.avatarUri || undefined}
              initials={initialsFor(provider.name) ?? undefined}
            />
            {!bookable ? (
              <InfoCallout tone="info">
                Online booking isn&apos;t available for this provider yet. Browse Find Care for
                doctors with appointment times.
              </InfoCallout>
            ) : null}
            <ProfileCard title="About">
              {provider.bio?.trim() || "This provider has not added a biography yet."}
            </ProfileCard>
            {provider.specialties.length ? (
              <ProfileCard title="Specialties">{provider.specialties.join(", ")}</ProfileCard>
            ) : null}
            {provider.languages.length ? (
              <ProfileCard title="Languages">{provider.languages.join(", ")}</ProfileCard>
            ) : null}
            {provider.category === "nurses" && provider.homeVisitFeeCents != null ? (
              <ProfileCard title="Home visits">
                This nurse lists home visits. Confirm service area, availability and cost with the
                provider.
              </ProfileCard>
            ) : null}
            {bookable ? (
              <ProfileCard title="Appointments">
                Choose a date, consultation type and available time on the next step.
              </ProfileCard>
            ) : null}
            <ProfileCard title="Patient reviews">
              Patient reviews are not available for this provider yet.
            </ProfileCard>
          </>
        ) : null}
        <Button
          label="Go to Find Care"
          variant="ghost"
          onPress={() => router.replace("/(app)/find-care" as Href)}
        />
      </ScrollView>
      {bookable ? (
        <DockedActionBar
          primary={{ label: "Book appointment", onPress: book, disabled: query.isFetching }}
          testID="provider-booking-dock"
        />
      ) : null}
    </DetailShell>
  );
}
