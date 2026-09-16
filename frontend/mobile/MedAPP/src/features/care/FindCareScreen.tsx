import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import {
  AvatarWithFallback,
  Button,
  Card,
  ChoiceChip,
  ChoiceChipRow,
  EmptyState,
  ErrorPanel,
  Icon,
  SearchField,
  SkeletonCard,
} from "@/components/ui";
import { useResolvedScheme } from "@/lib/theme";
import { blendTokens, tokenColor, useTokenColor } from "@/lib/tokens";
import { useDebouncedValue } from "@/features/care/hooks/use-debounced-value";
import { useDirectory, type DirectoryChip } from "@/features/care/hooks/use-directory";
import type { FacilityEntry, IconName, PersonEntry } from "@/features/care/types";

const MAIN_CHIPS: { value: DirectoryChip; label: string; icon?: IconName }[] = [
  { value: "all", label: "All" },
  { value: "doctors", label: "Doctors", icon: "person" },
  { value: "nurses", label: "Nurses", icon: "medical-services" },
  { value: "hospitals", label: "Hospitals", icon: "local-hospital" },
  { value: "pharmacies", label: "Pharmacies", icon: "local-pharmacy" },
  { value: "pharmacists", label: "Pharmacists", icon: "medication" },
];

const GUTTER = 16;

export function FindCareScreen() {
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<DirectoryChip>("all");
  const [homeVisitsOnly, setHomeVisitsOnly] = useState(false);
  const [specialty, setSpecialty] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const debouncedSpecialty = useDebouncedValue(specialty, 250);
  const supportsSpecialty = ["doctors", "nurses", "hospitals"].includes(activeChip);
  const supportsHomeVisits = activeChip === "all" || activeChip === "nurses";
  const { entries, isLoading, error, failedSources, refetch, hasMore, loadMore, isLoadingMore } =
    useDirectory(
      homeVisitsOnly ? "nurses" : activeChip,
      debouncedQuery,
      supportsSpecialty && specialty.trim() ? debouncedSpecialty : "",
    );
  const filteredEntries = useMemo(
    () =>
      homeVisitsOnly
        ? entries.filter(
            (entry) =>
              entry.kind === "person" &&
              entry.category === "nurses" &&
              entry.homeVisitFeeCents != null,
          )
        : entries,
    [entries, homeVisitsOnly],
  );
  const hasActiveFilters =
    activeChip !== "all" || homeVisitsOnly || !!query.trim() || !!specialty.trim();
  const clearFilters = () => {
    setActiveChip("all");
    setHomeVisitsOnly(false);
    setSpecialty("");
    setQuery("");
  };

  return (
    <DetailShell title="Find Care">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingTop: 16,

          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
            placeholder="Search clinicians and facilities…"
            accessibilityLabel="Search the care directory"
          />
        </View>

        <View style={{ marginTop: 16 }}>
          <ChoiceChipRow testID="find-care-type-chips">
            {MAIN_CHIPS.map((c) => (
              <ChoiceChip
                key={c.value}
                label={c.label}
                icon={c.icon}
                role="radio"
                selected={activeChip === c.value}
                onPress={() => {
                  setActiveChip(c.value);
                  setHomeVisitsOnly(false);
                  setSpecialty("");
                }}
              />
            ))}
          </ChoiceChipRow>
        </View>

        <View style={{ marginTop: 8 }}>
          <ChoiceChipRow testID="find-care-facet-chips">
            {supportsHomeVisits ? (
              <ChoiceChip
                label="Home Service"
                selected={homeVisitsOnly}
                onPress={() => setHomeVisitsOnly((value) => !value)}
              />
            ) : null}
          </ChoiceChipRow>
        </View>

        {supportsSpecialty ? (
          <View style={{ marginTop: 12 }}>
            <SearchField
              value={specialty}
              onChangeText={setSpecialty}
              onClear={() => setSpecialty("")}
              placeholder="Filter by specialty…"
              accessibilityLabel="Filter by specialty"
            />
          </View>
        ) : null}
        {hasActiveFilters && filteredEntries.length > 0 ? (
          <Button label="Clear filters" variant="ghost" onPress={clearFilters} />
        ) : null}
        <View className="mt-md gap-md">
          {error ? (
            <ErrorPanel
              title={
                entries.length
                  ? "Some directory results are unavailable"
                  : "Unable to load directory"
              }
              body={
                failedSources?.length
                  ? `Could not load: ${failedSources.join(", ")}. Try again to refresh these results.`
                  : "Check your connection and try again."
              }
              icon="cloud-off"
              retry={refetch}
              retryAccessibilityLabel="Retry loading directory"
            />
          ) : null}
          {filteredEntries.length > 0 ? (
            filteredEntries.map((entry) =>
              entry.kind === "person" ? (
                <PersonCard key={`${entry.category}:${entry.id}`} entry={entry} />
              ) : (
                <FacilityCard key={`${entry.category}:${entry.id}`} entry={entry} />
              ),
            )
          ) : isLoading && filteredEntries.length === 0 ? (
            <SkeletonCard shape="provider-card" count={3} />
          ) : !error ? (
            <EmptyState
              icon={hasActiveFilters ? "filter-list-off" : "search-off"}
              title={hasActiveFilters ? "No matches" : "Nothing here yet"}
              body={
                hasActiveFilters
                  ? "Try a different filter or clear them all to see everyone available."
                  : "We couldn't find anyone in this directory right now. Check back soon."
              }
              action={
                hasActiveFilters
                  ? {
                      label: "Clear filters",
                      accessibilityLabel: "Clear all filters",
                      onPress: clearFilters,

                      trailingIcon: undefined,
                    }
                  : undefined
              }
            />
          ) : null}
          {isLoading && entries.length > 0 ? (
            <Text accessibilityRole="progressbar" className="text-on-surface-variant">
              Loading more categories…
            </Text>
          ) : null}
          {hasMore ? (
            <Button
              label={isLoadingMore ? "Loading more…" : "Load more results"}
              disabled={isLoadingMore}
              onPress={() => {
                void loadMore();
              }}
            />
          ) : null}
        </View>
      </ScrollView>
    </DetailShell>
  );
}

const PERSON_BADGE_STYLES: Record<
  PersonEntry["badges"][number]["tone"],
  { bg: string; fg: string }
> = {
  primary: { bg: "bg-primary/10", fg: "text-primary" },
  secondary: { bg: "bg-secondary-container", fg: "text-on-secondary-container" },
  tertiary: { bg: "bg-tertiary/10", fg: "text-tertiary" },
  warn: { bg: "bg-error/10", fg: "text-error" },
};

function initialsFor(name: string): string | null {
  const words = name
    .replace(/^Dr\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function PersonCard({ entry }: { entry: PersonEntry }) {
  const tertiary = useTokenColor("tertiary");
  return (
    <Card>
      <View className="flex-row gap-sm">
        <AvatarWithFallback
          uri={entry.avatarUri || null}
          initials={initialsFor(entry.name)}
          label={entry.name}
          size={64}
          className="rounded-xl"
          style={{ borderRadius: 12 }}
        />
        <View className="flex-1 justify-center">
          <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
            {entry.name}
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">{entry.title}</Text>
        </View>
      </View>

      <View className="mt-sm flex-row flex-wrap gap-xs">
        {entry.badges.map((b, i) => {
          const s = PERSON_BADGE_STYLES[b.tone];

          const isHomeService = b.tone === "tertiary" && b.label === "Home Service";
          return (
            <View
              key={`${entry.id}-badge-${i}`}
              className={`flex-row items-center gap-xs rounded-full px-sm py-xs ${s.bg}`}
            >
              {isHomeService ? <Icon chrome="home" size={14} color={tertiary} /> : null}
              <Text className={`font-label-sm text-label-sm ${s.fg}`}>{b.label}</Text>
            </View>
          );
        })}
      </View>

      <View className="mt-sm flex-row gap-sm">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${entry.name}'s profile`}
          accessibilityHint="Opens their profile"
          className="flex-1 items-center justify-center rounded-lg border border-primary py-sm active:opacity-80"

          style={{ minHeight: 44 }}
          onPress={() =>
            router.push({
              pathname: "/(app)/practitioner-telehealth-profile",
              params: {
                id: entry.id,
                providerId: entry.id,
                providerName: entry.name,
                providerSpecialty: entry.title,
                providerAvatar: entry.avatarUri,
                providerKind: entry.category,

                ...(entry.consultationFeeCents !== null && entry.consultationFeeCents !== undefined
                  ? { providerFeeCents: String(entry.consultationFeeCents) }
                  : null),
              },
            } as unknown as Href)
          }
        >
          <Text className="font-label-md text-label-md text-primary">View Profile</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function openFacility(entry: FacilityEntry): void {
  const pathname =
    entry.category === "hospitals" ? "/(app)/hospital-detail" : "/(app)/pharmacy-detail";
  const params =
    entry.category === "hospitals" ? { hospitalId: entry.id } : { pharmacyId: entry.id };

  router.push({ pathname, params } as unknown as Href);
}

function FacilityCard({ entry }: { entry: FacilityEntry }) {
  const { scheme } = useResolvedScheme();
  const iconBg = entry.iconTint === "tertiary" ? "bg-tertiary-container" : "bg-secondary-container";

  const iconColor = tokenColor(
    entry.iconTint === "tertiary" ? "on-tertiary-container" : "on-secondary-container",
    scheme,
  );
  const ctaPressed = blendTokens("tertiary", "on-tertiary", 0.12, scheme);
  const ctaIdle = tokenColor("tertiary", scheme);
  const ctaLabel = tokenColor("on-tertiary", scheme);

  return (
    <Card>
      <View className="flex-row items-center gap-sm">
        <View className={`h-16 w-16 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon chrome={entry.icon} size={32} color={iconColor} />
        </View>
        <View className="flex-1 justify-center">
          <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
            {entry.name}
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            {entry.subtitle}
          </Text>
        </View>
      </View>

      <View className="mt-sm flex-row flex-wrap gap-xs">
        {entry.badges.map((b, i) =>
          b.tone === "open" ? (
            <View
              key={`${entry.id}-badge-${i}`}

              className="flex-row items-center gap-xs rounded-full bg-success-container px-sm py-xs"
            >
              <View className="h-2 w-2 rounded-full bg-success" />
              <Text className="font-label-sm text-label-sm text-on-success-container">
                {b.label}
              </Text>
            </View>
          ) : (
            <View
              key={`${entry.id}-badge-${i}`}
              className="rounded-full bg-tertiary-fixed px-sm py-xs"
            >
              <Text className="font-label-sm text-label-sm text-on-tertiary-fixed-variant">
                {b.label}
              </Text>
            </View>
          ),
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.cta.label} — ${entry.name}`}
        style={({ pressed }) => [
          {
            marginTop: 12,
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            paddingHorizontal: 24,
            paddingVertical: 12,
            backgroundColor: pressed ? ctaPressed : ctaIdle,
          },
        ]}
        onPress={() => openFacility(entry)}
      >
        <Text
          style={{
            color: ctaLabel,
            fontFamily: "Inter",
            fontSize: 14,
            fontWeight: "600",
            letterSpacing: 0.14,
          }}
        >
          {entry.cta.label}
        </Text>
      </Pressable>
    </Card>
  );
}
