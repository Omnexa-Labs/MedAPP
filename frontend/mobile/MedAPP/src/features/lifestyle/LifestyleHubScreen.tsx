// Lifestyle Hub screen. Translated from the Stitch "Lifestyle Hub" HTML.
//
// Reached from the BottomNav "Lifestyle" tab. This is the first of two Lifestyle
// screens; the second — Lifestyle Management (the daily logging form) — is
// reached from the "Go to Log" CTA here.
//
// SHELL MIGRATION — the inline app bar is gone
//
// This screen is a patient TAB ROOT, so its chrome is not its own to draw: it
// renders <PatientShell activeTab="lifestyle"> (docs/BRAND.md §App shell).
// Deleted with the hand-rolled bar:
//   * the glass header + its `appBarShadow`. Figma 741:887 carries no effects
//     and BRAND §Elevation forbids inventing one for a bar.
//   * the "Lifestyle Hub" <Text> title and the `bg-primary-container` avatar
//     PLATE — the tab-root frame wants the <Logo /> there, and the real avatar
//     is PatientAppBar's AvatarWithFallback (photo → initials → silhouette).
//     The title string is preserved as the screen's body heading, below.
//   * the bell Pressable, `StatusBar style="dark"`, and the local
//     <SafeAreaView> / <BottomNav> scaffolding.
// The ScrollView keeps `paddingBottom: 140`: the shell renders BottomNav
// `absolute bottom-0`, so it still reserves no layout space.
//
// ============================================================================
// THE CHARTS THAT CHARTED NOTHING ARE GONE (2026-08-08)
// ============================================================================
// Every card on this screen except Sleep was a module-level constant drawn as
// the patient's own week, and none of them could ever change: there is no
// lifestyle API in this product and no device-storage write, so a patient could
// log 3.4L of water on the Manage screen and this Hub still read "Today: 2.1L".
//
// Deleted:
//   * SEED_MEDS + the "Daily Medications" card — a NAMED PRESCRIPTION LIST
//     ("Lisinopril 10mg, 8:00 AM, Taken") with a "2 of 3 taken" adherence
//     counter and a working "Mark Taken" button that wrote to `useState`. A
//     patient could read that as their own regimen, and adherence is exactly the
//     thing a clinician asks about. `pms_service` is not wired
//     (docs/api/README.md), so there was nothing behind any of it.
//   * NUTRIENTS + "Daily Nutrient Intake" — 1,850 kcal / 85g protein / 1.1mg B2
//     against goals nobody set.
//   * MOOD + "Mood Over Time" — a seven-point mood series, plus a Day/Week/Month
//     segmented control whose `range` state was never read by anything.
//   * WATER + the "Water Trend" area chart, which rendered a literal
//     "Today: 2.1L".
//   * the "Weekly Active" progress ring, 150 of 200 minutes.
//
// Sleep STAYS, and it is the model the rest failed to follow: it reads
// `wearable_sync_service` through `dailyTotalFor`, and when no device has
// reported it falls back to sample data AND SAYS SO on screen ("Sample data —
// connect a device to see your own sleep"). That label is the reason the
// fallback is legitimate there and was not anywhere else.
//
// Everything removed is recorded in docs/api/README.md's gap register.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { wearablesApi } from "@/features/wearables/api";
import { dailyTotalFor, localDayKey } from "@/features/wearables/daily";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Card } from "@/components/ui";
import { PatientShell } from "@/components/shell";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTokenColor } from "@/lib/tokens";

const MANAGE_HREF = "/(app)/lifestyle-manage" as Href;

const HERO_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBVz7j04UjLrtSVEYGzX9QJDov8s-f8_ls0yrAlAg0Ig4M4A4bTCAL9Qh2aqATHONtOynMFGT7KFn-uWoezdUn2gEKjioASJdvTbFv-w-lNLVMgkYlza7d9oIUJpV2-aeFbGCd-0xzeuhp2YRbiJnWgGGliKgXj0shb4PXOLrogpb8S_wMBOaAjwaEJBigTYYvMpVrMIm-aFdmvZMWCVv_4hvtfBmd_s5fdMacRkSN7R4JNFBq1hvkqTimue3Gmrv2A455DCFCR4cNy";

const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 1, y: 0 } as const;

// Sleep — 7 days, hours. The design's placeholder week, used ONLY when no
// device has reported and always under the "Sample data" label below.
const SLEEP = {
  avg: "7.2h",
  days: ["M", "T", "W", "T", "F", "S", "S"],
  hours: [6.5, 7.0, 6.2, 8.1, 7.5, 8.5, 7.8],
  todayIndex: 3,
};

/** The last seven local days, oldest first, as day keys plus short labels. */
function lastSevenDays(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({
      key: localDayKey(d.toISOString()),
      label: "MTWTFSS"[d.getDay() === 0 ? 6 : d.getDay() - 1],
    });
  }
  return out;
}

export function LifestyleHubScreen() {
  // Sleep comes from wearable_sync_service.
  //
  // ONE request. Fetching samples per device would be an N+1 for a chart, and
  // `recent_samples` on the summary is what the service offers for this.
  const { data: wearableSummary } = useQuery({
    queryKey: ["wearables", "summary"],
    queryFn: () => wearablesApi.getSummary(),
  });

  const sleep = useMemo(() => {
    const samples = wearableSummary?.recentSamples ?? [];
    const days = lastSevenDays();
    // PO ruling: cumulative, latest per device per day. That rule lives in
    // features/wearables/daily.ts with its own tests — never inline.
    const perDay = days.map((d) => dailyTotalFor(samples, "sleep_minutes", d.key));
    const present = perDay.filter((t): t is NonNullable<typeof t> => t !== null);
    if (present.length === 0) return { ...SLEEP, live: false, multiDevice: false };

    // A day with no reading draws as 0, but the AVERAGE is over days that have
    // data. Averaging a missing night in as zero would report that the patient
    // did not sleep.
    return {
      avg: `${(present.reduce((sum, t) => sum + t.value / 60, 0) / present.length).toFixed(1)}h`,
      days: days.map((d) => d.label),
      hours: perDay.map((t) => (t ? t.value / 60 : 0)),
      todayIndex: 6,
      live: true,
      multiDevice: present.some((t) => t.deviceCount > 1),
    };
  }, [wearableSummary]);

  // Feeds PatientAppBar's AvatarWithFallback. Same store as InboxScreen, reached
  // through the `useCurrentUser` selector rather than `useAuthStore` directly:
  // importing the store pulls in @/lib/api/client -> @/lib/config, which throws
  // without app.config.ts extras and would make this screen untestable.
  const user = useCurrentUser();
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";

  // The hero's teal scrim, resolved by token instead of the frozen
  // `rgba(0,106,97,0.8)` pair — that literal is light-mode `primary`, so the
  // wash stayed light-mode teal while the page around it went near-black.
  // Stop two is the same token at zero alpha, which is a transparent teal
  // rather than the string "transparent": an RGBA ramp to a DIFFERENT hue
  // greys through the middle on Android.
  const heroWash = useTokenColor("primary", 0.8);
  const heroFade = useTokenColor("primary", 0);
  // Content ON the `primary-container` CTA panel takes that panel's pair.
  const onPrimaryContainer = useTokenColor("on-primary-container");
  // …and the label on the panel's INVERTED inner button (fill
  // `on-primary-container`) takes the container back. `#008378` was that value
  // frozen at its light tone.
  const primaryContainer = useTokenColor("primary-container");
  const primary = useTokenColor("primary");

  return (
    <PatientShell
      activeTab="lifestyle"
      avatarUri={user?.avatarUrl}
      avatarInitials={firstName[0]}
      avatarLabel={user?.displayName ?? "Your profile"}
    >
      {/* `paddingBottom: 140` is UNCHANGED. PatientShell renders BottomNav
          `absolute bottom-0` (see its LAYOUT NOTE), so the bar still occupies no
          layout space and the screen still clears it itself. */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 140,
          paddingTop: 16,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen title. The old bar set "Lifestyle Hub" in the slot the
            tab-root frame reserves for the logo; PatientAppBar has no title
            prop by design, so the string moves into the body as the screen
            heading — the same placement InboxScreen uses for "Messages". */}
        <Text
          accessibilityRole="header"
          className="font-headline-xl text-headline-xl text-on-surface"
        >
          Lifestyle Hub
        </Text>

        {/* Hero. Shadow deleted and no hairline added: this is a full-bleed
            photograph under a teal gradient, which separates itself from the
            page far harder than a 1px line would. */}
        <View className="h-48 overflow-hidden rounded-2xl">
          <Image
            source={{ uri: HERO_IMG }}
            className="absolute inset-0 h-full w-full"
            resizeMode="cover"
          />
          <LinearGradient
            colors={[heroWash, heroFade]}
            start={GRADIENT_START}
            end={GRADIENT_END}
            style={{ position: "absolute", inset: 0 }}
          />
          <View className="flex-1 justify-end p-md">
            <Text
              className="font-headline-md text-on-primary"
              style={{ fontSize: 24, fontWeight: "700" }}
            >
              Your Wellness Path
            </Text>
            <Text
              className="mt-xs font-body-md text-body-md text-on-primary/90"
              style={{ maxWidth: "80%" }}
            >
              Track, adapt, and thrive today.
            </Text>
          </View>
        </View>

        {/* Daily logging entry point.
            FLAGGED, not adopted onto <Card />: this is a tinted CTA panel on
            `primary-container`, and <Card /> hard-codes the neutral
            `card-surface` fill (a `bg-*` passed via className would collide —
            `cn` is a plain joiner with no tailwind-merge). */}
        <View className="gap-md rounded-card border border-primary/20 bg-primary-container p-md">
          <View className="flex-row items-center gap-sm">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-on-primary-container/10">
              <MaterialIcons name="edit-calendar" size={26} color={onPrimaryContainer} />
            </View>
            <View className="flex-1">
              <Text className="font-headline-md text-on-primary-container" style={{ fontSize: 18 }}>
                Log Daily Activity
              </Text>
              <Text className="font-body-md text-on-primary-container/90" style={{ fontSize: 14 }}>
                Record your sleep, water, meals, and more
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to daily log"
            onPress={() => router.push(MANAGE_HREF)}
            className="w-full flex-row items-center justify-center gap-xs rounded-lg bg-on-primary-container py-sm active:scale-[0.98]"
          >
            <Text className="font-label-md text-label-md" style={{ color: primaryContainer }}>
              Go to Log
            </Text>
            <MaterialIcons name="arrow-forward" size={18} color={primaryContainer} />
          </Pressable>
        </View>

        {/* Sleep trend — the one live chart on this screen. */}
        <Card className="gap-md">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-xs">
              <MaterialIcons name="bedtime" size={20} color={primary} />
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
                Sleep Trend
              </Text>
            </View>
            <View className="rounded-md bg-primary-container/40 px-sm py-xs">
              <Text className="font-label-md text-label-sm text-primary">Avg: {sleep.avg}</Text>
            </View>
          </View>
          <BarChart
            labels={sleep.days}
            values={sleep.hours}
            highlightIndex={sleep.todayIndex}
            height={112}
          />
          {/* Two devices both reporting sleep would be SUMMED by the
              latest-per-device rule, which double-counts. Surfaced rather than
              silently wrong - see docs/api/wearable_sync_service.md. */}
          {sleep.multiDevice ? (
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              Combined from more than one device.
            </Text>
          ) : null}
          {!sleep.live ? (
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              Sample data — connect a device to see your own sleep.
            </Text>
          ) : null}
        </Card>
      </ScrollView>
    </PatientShell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
//
// `MedRow`, `NutrientBar`, `MoodCard`, `ProgressRing`, `LineChart` and
// `AreaChart` went with the cards they drew. `react-native-svg` and the shared
// `Icon` are no longer imported here at all — the only chart left is built from
// plain Views.

/**
 * Bar chart built from plain Views (same idiom as Overview's MiniChart),
 * scaled so the tallest bar fills the track. The highlighted index is drawn
 * solid; the rest are muted.
 *
 * The three colours are resolved BY TOKEN, not passed in. They were `#00685f`
 * for the bars and `#171d1c` / `#3d4947` for the labels — the second pair being
 * near-black day letters that were invisible on the dark page.
 */
function BarChart({
  labels,
  values,
  highlightIndex,
  height,
  showLabels = true,
}: {
  labels: string[];
  values: number[];
  highlightIndex: number;
  height: number;
  showLabels?: boolean;
}) {
  const tint = useTokenColor("primary");
  const onSurface = useTokenColor("on-surface");
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const max = Math.max(...values);
  return (
    <View>
      <View style={{ height, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {values.map((v, i) => {
          const active = i === highlightIndex;
          return (
            <View
              key={i}
              style={{ flex: 1, height: `${(v / max) * 100}%`, justifyContent: "flex-end" }}
            >
              <View
                style={{
                  height: "100%",
                  backgroundColor: tint,
                  opacity: active ? 1 : 0.18,
                  borderTopLeftRadius: 6,
                  borderTopRightRadius: 6,
                }}
              />
            </View>
          );
        })}
      </View>
      {showLabels ? (
        <View className="mt-xs flex-row" style={{ gap: 8 }}>
          {labels.map((l, i) => (
            <Text
              key={i}
              className="text-center font-label-sm text-label-sm"
              style={{
                flex: 1,
                color: i === highlightIndex ? onSurface : onSurfaceVariant,
                fontWeight: i === highlightIndex ? "700" : "400",
              }}
            >
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// `cardShadow` and `segmentShadow` were deleted with their last call sites, and
// `appBarShadow` went with the hand-rolled bar this screen no longer draws.
// Nothing on this screen floats — see docs/BRAND.md §Elevation.
