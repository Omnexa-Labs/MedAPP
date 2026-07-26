// Find Care screen — translated from the Stitch "MedApp Directory" HTML.
//
// Reached from HomeScreen's Quick Services → "Find Care" tile, NOT from the
// bottom tab bar (the tab bar is the 5-slot set from the Home dump; Find
// Care is a stack-pushed screen).
//
// Translation rules (same as SignInScreen / HomeScreen):
//   - glass-nav backdrop-blur(12px) → opaque bg-surface with a border +
//     shadow. RN backdrop blur is expensive and visually equivalent at
//     these opacities.
//   - hover:*, group-hover:*, focus:ring → dropped (RN has no hover).
//   - overflow-x-auto hide-scrollbar → horizontal ScrollView with hidden
//     indicator.
//   - shadow-[0px_4px_20px_rgba(...)] → Platform.select shadow pattern.
//   - The Stitch dump duplicates chips (Hospitals/Pharmacies appear in
//     both rows, and there's both "Pharmacies" and "Pharmacist"). We
//     de-dupe: main row is the entity type, sub-row is filter facets.
//   - Status indicators (online dot, away dot) → absolutely-positioned
//     small Views.
//   - This is a static UI cut. Backend wiring to /v1/doctors, /v1/nurses,
//     /v1/hospitals, /v1/pharmacies is a follow-up once the gateway
//     surfaces them with the directory shape.
//
// The BottomNav is kept visible with `active="home"` — this is a pushed
// screen, so on iOS the parent tab stays highlighted (matches Material 3
// + iOS conventions both).
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding anything
// expo-* here.

import { useMemo, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { BottomNav } from "@/features/home/components/BottomNav";
import { useDebouncedValue } from "@/features/care/hooks/use-debounced-value";
import { useDirectory, type DirectoryChip } from "@/features/care/hooks/use-directory";
import type {
  AvailabilityTone,
  DirectoryEntry,
  FacilityEntry,
  IconName,
  PersonEntry,
} from "@/features/care/types";

// Main chip taxonomy — de-duped from the Stitch dump. The `value` is
// what the filter state uses; the label is what the user sees. Typed
// against DirectoryChip so a typo here would be a compile error, not
// a silently-empty directory at runtime.
const MAIN_CHIPS: { value: DirectoryChip; label: string; icon?: IconName }[] = [
  { value: "all", label: "All" },
  { value: "doctors", label: "Doctors", icon: "person" },
  { value: "nurses", label: "Nurses", icon: "medical-services" },
  { value: "hospitals", label: "Hospitals", icon: "local-hospital" },
  { value: "pharmacies", label: "Pharmacies", icon: "local-pharmacy" },
  { value: "pharmacists", label: "Pharmacists", icon: "medication" },
];

// Sub-row facets. Specialty is a dropdown trigger (no menu yet — that's
// a follow-up once specialties exist in the backend); the rest are
// togglable filter chips.
const SUB_FACETS: string[] = ["Available Now", "Home Service", "Nearest"];

// ---------------------------------------------------------------------------
// Directory data comes from useDirectory() now — the old MOCK_DIRECTORY
// array was deleted in the real-data wiring pass. Types live in
// ./types.ts and are re-exported by the hook for convenience.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function FindCareScreen() {
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<DirectoryChip>("all");
  const [activeFacets, setActiveFacets] = useState<Set<string>>(new Set());

  // 250ms feels instant to the user but gives a typist time to land on
  // a word before we burn a network call. The backend `?q=` filter
  // does the heavy lifting; the screen only does facet filtering on
  // the returned slice.
  const debouncedQuery = useDebouncedValue(query, 250);

  const { entries, isLoading, error, refetch } = useDirectory(
    activeChip,
    debouncedQuery,
  );

  const toggleFacet = (label: string) => {
    setActiveFacets((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Server already filtered by chip + ?q=. The screen only narrows by
  // facet here — facets are derived from badges (e.g. "Home Service")
  // and we don't yet have a clean server contract for those. AND-ing
  // multiple facets keeps the behaviour consistent with the old
  // pipeline.
  const filteredEntries = useMemo(() => {
    if (activeFacets.size === 0) return entries;
    const facets = Array.from(activeFacets).map((f) => f.toLowerCase());
    return entries.filter((entry) => {
      const badgeText = entry.badges
        .map((b) => b.label.toLowerCase())
        .join(" | ");
      return facets.every((f) => badgeText.includes(f));
    });
  }, [entries, activeFacets]);

  const hasActiveFilters =
    activeChip !== "all" || activeFacets.size > 0 || query.trim().length > 0;

  const clearFilters = () => {
    setActiveChip("all");
    setActiveFacets(new Set());
    setQuery("");
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* Top app bar — back arrow + MedApp wordmark + notifications.
            Find Care is pushed from Home, so the back affordance is the
            primary nav action. */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-gutter py-sm"
          style={appBarShadow}
        >
          <View className="flex-row items-center gap-sm">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={() => router.back()}
              className="rounded-full p-xs active:scale-95"
            >
              <MaterialIcons name="arrow-back" size={24} color="#00685f" />
            </Pressable>
            <Text className="font-headline-md text-headline-md text-primary">
              MedApp
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            hitSlop={8}
            className="rounded-full p-sm active:scale-95"
          >
            <MaterialIcons name="notifications" size={24} color="#00685f" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Page title */}
          <Text className="font-headline-xl text-headline-xl mt-md text-on-surface">
            Find Care
          </Text>

          {/* Search bar */}
          <View
            className="mt-md w-full flex-row items-center rounded-xl border border-outline-variant bg-surface-container-lowest px-md"
            style={cardShadow}
          >
            <MaterialIcons name="search" size={20} color="#6d7a77" />
            <TextInput
              placeholder="Search doctors, nurses, departments…"
              placeholderTextColor="#6d7a77"
              autoCorrect={false}
              autoCapitalize="none"
              value={query}
              onChangeText={setQuery}
              style={{
                flex: 1,
                marginLeft: 12,
                paddingVertical: 14,
                color: "#171d1c",
                fontSize: 16,
                lineHeight: 20,
              }}
              accessibilityLabel="Search directory"
              returnKeyType="search"
            />
          </View>

          {/* Main chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingTop: 16, paddingBottom: 4 }}
          >
            {MAIN_CHIPS.map((c) => (
              <MainChip
                key={c.value}
                label={c.label}
                icon={c.icon}
                active={activeChip === c.value}
                onPress={() => setActiveChip(c.value)}
              />
            ))}
          </ScrollView>

          {/* Sub-row facets */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingTop: 8, paddingBottom: 4 }}
          >
            <FacetChip
              label="Specialty"
              trailing="arrow-drop-down"
              active={false}
              onPress={() => {
                // TODO: open specialty picker. Needs the specialty list
                // from /v1/doctors/specialties (not exposed yet).
              }}
            />
            {SUB_FACETS.map((f) => (
              <FacetChip
                key={f}
                label={f}
                active={activeFacets.has(f)}
                onPress={() => toggleFacet(f)}
              />
            ))}
          </ScrollView>

          {/* Directory grid — single column on mobile. The HTML uses
              md:grid-cols-2 / lg:grid-cols-3; phones get one column for
              readability. The wrapping bg-surface-container-low panel
              from the HTML is dropped — on mobile the rhythm reads
              better without the outer tint.

              State machine:
                - error (and no cached entries)  → ErrorPanel + Retry
                - isLoading (and no entries yet) → 3 skeleton cards
                - entries.length === 0            → EmptyState
                - default                         → list
              The "and no entries" guards mean a refetch on an
              already-loaded list keeps the old data on screen instead
              of flashing back to skeletons. */}
          <View className="mt-md gap-md">
            {error && filteredEntries.length === 0 ? (
              <ErrorPanel onRetry={refetch} />
            ) : isLoading && filteredEntries.length === 0 ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : filteredEntries.length === 0 ? (
              <EmptyState
                hasActiveFilters={hasActiveFilters}
                onClear={clearFilters}
              />
            ) : (
              filteredEntries.map((entry) =>
                entry.kind === "person" ? (
                  <PersonCard key={entry.id} entry={entry} />
                ) : (
                  <FacilityCard key={entry.id} entry={entry} />
                ),
              )
            )}
          </View>
        </ScrollView>

        {/* Pushed screen — keep Home selected in the tab bar. */}
        <BottomNav
          active="home"
          onTabPress={(key) => {
            if (key === "home") router.back();
            else if (key === "inbox") router.push("/(app)/inbox" as Href);
          }}
        />
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const PERSON_BADGE_STYLES: Record<
  PersonEntry["badges"][number]["tone"],
  { bg: string; fg: string }
> = {
  primary: { bg: "bg-primary/10", fg: "text-primary" },
  secondary: { bg: "bg-secondary-container", fg: "text-on-secondary-container" },
  tertiary: { bg: "bg-tertiary/10", fg: "text-tertiary" },
  warn: { bg: "bg-orange-100", fg: "text-orange-700" },
};

const AVAILABILITY_DOT: Record<AvailabilityTone, string> = {
  online: "bg-green-500",
  busy: "bg-red-500",
  away: "bg-orange-400",
};

function PersonCard({ entry }: { entry: PersonEntry }) {
  return (
    <View
      className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
      style={cardShadow}
    >
      <View className="flex-row gap-sm">
        <View className="relative">
          <Image
            source={{ uri: entry.avatarUri }}
            className="h-16 w-16 rounded-xl"
            accessibilityLabel={entry.name}
          />
          <View
            className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-surface-container-lowest ${AVAILABILITY_DOT[entry.availability]}`}
          />
        </View>
        <View className="flex-1 justify-center">
          <Text
            className="font-headline-md text-on-surface"
            style={{ fontSize: 18 }}
          >
            {entry.name}
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            {entry.title}
          </Text>
        </View>
      </View>

      <View className="mt-sm flex-row flex-wrap gap-xs">
        {entry.badges.map((b, i) => {
          const s = PERSON_BADGE_STYLES[b.tone];
          // Tertiary tone gets the home icon when the label says
          // "Home Service" — matches the Stitch dump.
          const isHomeService = b.tone === "tertiary" && b.label === "Home Service";
          return (
            <View
              key={`${entry.id}-badge-${i}`}
              className={`flex-row items-center gap-xs rounded-full px-sm py-xs ${s.bg}`}
            >
              {isHomeService ? (
                <MaterialIcons name="home" size={14} color="#0058be" />
              ) : null}
              <Text className={`font-label-sm text-label-sm ${s.fg}`}>{b.label}</Text>
            </View>
          );
        })}
      </View>

      <View className="mt-sm flex-row gap-sm">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${entry.name}'s profile`}
          className="flex-1 items-center justify-center rounded-lg border border-primary py-sm active:opacity-80"
          onPress={() => router.push("/(app)/practitioner-telehealth-profile" as Href)}
        >
          <Text className="font-label-md text-label-md text-primary">View Profile</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Message ${entry.name}`}
          className="items-center justify-center rounded-lg bg-primary px-md py-sm active:scale-95"
          onPress={() => {
            // TODO: open chat thread. Wires to /v1/social once exposed.
          }}
        >
          <MaterialIcons name="chat-bubble" size={20} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}

function FacilityCard({ entry }: { entry: FacilityEntry }) {
  const iconBg =
    entry.iconTint === "tertiary"
      ? "bg-tertiary-container"
      : "bg-secondary-container";
  const iconColor = entry.iconTint === "tertiary" ? "#fefcff" : "#3a485b";
  const ctaPalette = facilityCtaPalette(entry.cta.color);

  return (
    <View
      className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
      style={cardShadow}
    >
      <View className="flex-row items-center gap-sm">
        <View
          className={`h-16 w-16 items-center justify-center rounded-xl ${iconBg}`}
          style={cardShadow}
        >
          <MaterialIcons name={entry.icon} size={32} color={iconColor} />
        </View>
        <View className="flex-1 justify-center">
          <Text
            className="font-headline-md text-on-surface"
            style={{ fontSize: 18 }}
          >
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
              className="flex-row items-center gap-xs rounded-full bg-green-100 px-sm py-xs"
            >
              <View className="h-2 w-2 rounded-full bg-green-700" />
              <Text className="font-label-sm text-label-sm text-green-700">
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

      {/* CTA — fully inline-styled.
          We're deliberately not using NativeWind classes here: when one
          arbitrary value (e.g. `active:scale-[0.98]`) fails to compile,
          NativeWind silently drops the entire className string for that
          element, leaving it with no width / no padding / no rounded
          corners, and the button collapses to a near-invisible sliver.
          Pure inline styles render identically on iOS / Android / web
          and can't be tripped up by class-name parsing. */}
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
            backgroundColor: pressed ? ctaPalette.pressed : ctaPalette.idle,
          },
          buttonShadow(ctaPalette.idle),
        ]}
        onPress={() => {
          // TODO: push directory / store detail route.
        }}
      >
        <Text
          style={{
            color: "#ffffff",
            fontFamily: "Inter",
            fontSize: 14,
            fontWeight: "600",
            letterSpacing: 0.14,
          }}
        >
          {entry.cta.label}
        </Text>
      </Pressable>
    </View>
  );
}

function facilityCtaPalette(color: FacilityEntry["cta"]["color"]) {
  // Tailwind config doesn't have a stable "blue-600", but the Stitch
  // dump uses it for the pharmacy CTA. Hardcode the two palettes from
  // the dump and call it done — both have enough contrast on white.
  if (color === "tertiary") return { idle: "#0058be", pressed: "#004395" };
  return { idle: "#2563eb", pressed: "#1d4ed8" }; // info / blue-600
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  hasActiveFilters,
  onClear,
}: {
  hasActiveFilters: boolean;
  onClear: () => void;
}) {
  return (
    <View
      className="items-center rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-md py-lg"
      style={cardShadow}
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-container-low">
        <MaterialIcons
          name={hasActiveFilters ? "filter-list-off" : "search-off"}
          size={26}
          color="#6d7a77"
        />
      </View>
      <Text
        className="font-headline-md mt-sm text-on-surface"
        style={{ fontSize: 18 }}
      >
        {hasActiveFilters ? "No matches" : "Nothing here yet"}
      </Text>
      <Text className="font-body-md text-body-md mt-xs text-center text-on-surface-variant">
        {hasActiveFilters
          ? "Try a different filter or clear them all to see everyone available."
          : "We couldn't find anyone in this directory right now. Check back soon."}
      </Text>
      {hasActiveFilters ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          onPress={onClear}
          style={({ pressed }) => ({
            marginTop: 16,
            paddingHorizontal: 24,
            paddingVertical: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#00685f",
            backgroundColor: pressed ? "rgba(0, 104, 95, 0.08)" : "transparent",
          })}
        >
          <Text
            style={{
              color: "#00685f",
              fontFamily: "Inter",
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            Clear filters
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Skeleton + error states
// ---------------------------------------------------------------------------

// A static skeleton card. No shimmer animation — first-paint
// perceived latency on a SDK 55 / RN 0.76 device is already ~250ms
// and the React Query 60s staleTime means most navigations show
// cached data anyway. If the skeleton ends up visible for >1s in
// practice, layer a Reanimated opacity loop on top.
function SkeletonCard() {
  return (
    <View
      className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
      style={cardShadow}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="flex-row gap-sm">
        <View className="h-16 w-16 rounded-xl bg-surface-container-low" />
        <View className="flex-1 justify-center gap-xs">
          <View className="h-4 w-2/3 rounded bg-surface-container-low" />
          <View className="h-3 w-1/2 rounded bg-surface-container-low" />
        </View>
      </View>
      <View className="mt-sm flex-row gap-xs">
        <View className="h-5 w-20 rounded-full bg-surface-container-low" />
        <View className="h-5 w-16 rounded-full bg-surface-container-low" />
      </View>
    </View>
  );
}

// Shown when useDirectory returns an error AND we have no cached
// entries to fall back to. The retry button calls refetch() which
// React Query handles — no manual state to reset.
function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <View
      className="items-center rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-md py-lg"
      style={cardShadow}
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-container-low">
        <MaterialIcons name="cloud-off" size={26} color="#6d7a77" />
      </View>
      <Text
        className="font-headline-md mt-sm text-on-surface"
        style={{ fontSize: 18 }}
      >
        Unable to load directory
      </Text>
      <Text className="font-body-md text-body-md mt-xs text-center text-on-surface-variant">
        Check your connection and try again. We'll pick up where we left off.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry loading directory"
        onPress={onRetry}
        style={({ pressed }) => ({
          marginTop: 16,
          paddingHorizontal: 24,
          paddingVertical: 10,
          borderRadius: 8,
          backgroundColor: pressed ? "#005049" : "#00685f",
        })}
      >
        <Text
          style={{
            color: "#ffffff",
            fontFamily: "Inter",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

function MainChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: IconName;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-row items-center gap-xs rounded-full px-md py-sm active:scale-95 ${
        active
          ? "bg-primary"
          : "border border-outline-variant bg-surface-container"
      }`}
    >
      {icon ? (
        <MaterialIcons
          name={icon}
          size={18}
          color={active ? "#ffffff" : "#3d4947"}
        />
      ) : null}
      <Text
        className={`font-label-md text-label-md ${
          active ? "text-on-primary" : "text-on-surface-variant"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FacetChip({
  label,
  trailing,
  active,
  onPress,
}: {
  label: string;
  trailing?: IconName;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-row items-center gap-xs rounded-lg border px-md py-xs active:scale-95 ${
        active
          ? "border-primary bg-primary/10"
          : "border-outline-variant bg-surface-container-lowest"
      }`}
    >
      <Text
        className={`font-label-sm text-label-sm ${
          active ? "text-primary" : "text-on-surface-variant"
        }`}
      >
        {label}
      </Text>
      {trailing ? (
        <MaterialIcons
          name={trailing}
          size={16}
          color={active ? "#00685f" : "#6d7a77"}
        />
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Shadow helpers — same Platform.select pattern as SignInScreen.
// ---------------------------------------------------------------------------

const cardShadow =
  Platform.select({
    ios: {
      shadowColor: "#475569",
      shadowOpacity: 0.05,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 4 },
    },
    web: { boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.05)" },
    android: { elevation: 2 },
  }) || {};

const appBarShadow =
  Platform.select({
    ios: {
      shadowColor: "#475569",
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 1 },
    },
    web: { boxShadow: "0px 1px 8px rgba(71, 85, 105, 0.04)" },
    android: { elevation: 1 },
  }) || {};

function buttonShadow(tint: string) {
  return (
    Platform.select({
      ios: {
        shadowColor: tint,
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      web: { boxShadow: `0px 2px 6px ${tint}33` },
      android: { elevation: 2 },
    }) || {}
  );
}
