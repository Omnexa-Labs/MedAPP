// Lifestyle Hub screen. Translated from the Stitch "Lifestyle Hub" HTML.
//
// Reached from the BottomNav "Lifestyle" tab (Home / Overview / Community).
// This is the first of two Lifestyle screens; the second — Lifestyle
// Management (the daily logging form) — is reached from the "Go to Log"
// and "View Full Schedule" CTAs here. Until that screen ships those CTAs
// route to /(app)/lifestyle-manage (a wrapper that may not exist yet),
// cast through Href like the other new routes.
//
// Charts:
//   - Sleep trend → bar chart, built from plain <View> bars (the bar form
//     is correct for it; matches the Overview screen's MiniChart idiom).
//   - Mood over time → real SVG <Polyline> line chart with data-point dots
//     (the comp's actual intent), via react-native-svg.
//   - Water trend → real SVG area chart (filled gradient under a smooth
//     curve), via react-native-svg.
//   - Weekly Active → real SVG <Circle> ring with strokeDasharray.
//
// SHELL MIGRATION — the inline app bar is gone
//
// This screen is a patient TAB ROOT, so its chrome is not its own to draw: it
// renders <PatientShell activeTab="lifestyle"> (docs/BRAND.md §App shell).
// Deleted with the hand-rolled bar:
//   * the glass header + its `appBarShadow`. Figma 741:887 carries no effects
//     and BRAND §Elevation forbids inventing one for a bar.
//   * the "Lifestyle Hub" <Text> title and the `bg-primary-container` avatar
//     PLATE with its `#f4fffc`-derived glyph — the tab-root frame wants the
//     <Logo /> there, and the real avatar is PatientAppBar's
//     AvatarWithFallback (photo → initials → silhouette). The title string is
//     preserved as the screen's body heading, below.
//   * the bell Pressable and its `primary` glyph — the bar owns both now.
//   * `StatusBar style="dark"`, frozen to one mode; the shell resolves it.
//   * the local <SafeAreaView> / <BottomNav> scaffolding. The nav's
//     `onTabPress` routing moved onto the shell verbatim.
// The ScrollView keeps `paddingBottom: 140`: the shell renders BottomNav
// `absolute bottom-0`, so it still reserves no layout space.
//
// Translation rules (same as the sibling screens):
//   - card / tile / segmented-thumb shadows → all DELETED. Nothing on this
//     screen is a sheet, menu, dialog, toast or FAB, so nothing qualifies for
//     the sanctioned floating pair. The neutral cards now go through the
//     shared <Card />.
//   - hero gradient overlay (to-r from surface-tint/80) →
//     expo-linear-gradient horizontal fill.
//   - hover tooltips / group-hover bar recolor → dropped (no hover on RN);
//     the "today" bar is pre-highlighted instead.
//   - Day/Week/Month + medication "Mark Taken" are interactive but LOCAL.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { wearablesApi } from "@/features/wearables/api";
import { dailyTotalFor, localDayKey } from "@/features/wearables/daily";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Polyline,
  Stop,
} from "react-native-svg";
import { Card } from "@/components/ui";
import { Icon } from "@/components/ui/icons/Icon";
import { PatientShell } from "@/components/shell";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTokenColor } from "@/lib/tokens";

const MANAGE_HREF = "/(app)/lifestyle-manage" as Href;

const HERO_OVERLAY = ["rgba(0,106,97,0.8)", "transparent"] as const;
const HERO_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBVz7j04UjLrtSVEYGzX9QJDov8s-f8_ls0yrAlAg0Ig4M4A4bTCAL9Qh2aqATHONtOynMFGT7KFn-uWoezdUn2gEKjioASJdvTbFv-w-lNLVMgkYlza7d9oIUJpV2-aeFbGCd-0xzeuhp2YRbiJnWgGGliKgXj0shb4PXOLrogpb8S_wMBOaAjwaEJBigTYYvMpVrMIm-aFdmvZMWCVv_4hvtfBmd_s5fdMacRkSN7R4JNFBq1hvkqTimue3Gmrv2A455DCFCR4cNy";

// ---------------------------------------------------------------------------
// Static seed data mirroring the comp. No backend in this design pass.
// ---------------------------------------------------------------------------

interface Nutrient {
  label: string;
  value: string;
  goal: string;
  pct: number; // 0..100 fill
  color: string;
}

const NUTRIENTS: Nutrient[] = [
  { label: "Calories", value: "1,850", goal: "/ 2,200 kcal", pct: 84, color: "#00685f" },
  { label: "Protein", value: "85", goal: "/ 100 g", pct: 85, color: "#0d9488" },
  { label: "Vitamin B2", value: "1.1", goal: "/ 1.3 mg", pct: 80, color: "#2170e4" },
];

// Sleep — 7 days, hours. Thursday (index 3) is the highlighted "today".
const SLEEP = {
  avg: "7.2h",
  days: ["M", "T", "W", "T", "F", "S", "S"],
  hours: [6.5, 7.0, 6.2, 8.1, 7.5, 8.5, 7.8],
  todayIndex: 3,
};

// Mood — 7 days on a 1..4 scale. Thursday highlighted.
//
// The y-axis is registry glyphs, not emoji: docs/BRAND.md forbids emoji, and an
// emoji axis label can't take a token colour so it stayed full-saturation black
// against a muted chart. Listed TOP-DOWN (best first) because that is the order
// a vertical axis renders. The 4-point scale reuses the 5-point mood vocabulary
// from the registry, dropping "distressed".
const MOOD = {
  scale: [
    { icon: "mood-great", label: "Great" },
    { icon: "mood-good", label: "Good" },
    { icon: "mood-neutral", label: "Neutral" },
    { icon: "mood-low", label: "Low" },
  ] as const,
  days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  values: [1, 2.5, 3.8, 3, 2, 3.5, 4], // higher = happier
  todayIndex: 3,
};

const WATER = {
  today: "2.1L",
  days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  liters: [1.4, 1.9, 1.2, 2.1, 1.7, 2.3, 2.0],
  todayIndex: 3,
};

interface Medication {
  id: string;
  name: string;
  time: string;
  taken: boolean;
}

const SEED_MEDS: Medication[] = [
  { id: "m1", name: "Lisinopril 10mg", time: "8:00 AM", taken: true },
  { id: "m2", name: "Multivitamin", time: "9:30 PM", taken: false },
  { id: "m3", name: "Vitamin D3", time: "9:30 PM", taken: true },
];

/** The last seven local days, oldest first, as day keys plus short labels. */
function lastSevenDays(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({ key: localDayKey(d.toISOString()), label: "MTWTFSS"[d.getDay() === 0 ? 6 : d.getDay() - 1] });
  }
  return out;
}

export function LifestyleHubScreen() {
  // Sleep comes from wearable_sync_service. WATER and MOOD deliberately do NOT:
  // they are manual logs and nothing in this product stores them, so those
  // charts stay seed data and say so rather than being dressed up as live.
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
  //
  // The deleted bar had NO source at all — it drew a fixed silhouette plate — so
  // this is the one place the migration is an upgrade rather than a transfer:
  // BRAND §App shell mandates photo -> initials -> silhouette, and a signed-in
  // patient now sees their own face instead of a generic glyph.
  const user = useCurrentUser();
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";
  const [meds, setMeds] = useState<Medication[]>(SEED_MEDS);
  const takenCount = meds.filter((m) => m.taken).length;

  const markTaken = (id: string) =>
    setMeds((prev) => prev.map((m) => (m.id === id ? { ...m, taken: true } : m)));

  return (
    <PatientShell
      activeTab="lifestyle"
      avatarUri={user?.avatarUrl}
      avatarInitials={firstName[0]}
      avatarLabel={user?.displayName ?? "Your profile"}
      // No `onTabPress`: PatientShell owns the tab map now. The switch that was
      // here handled three of five — `inbox` fell through with a comment calling
      // it "still a stub", but /(app)/inbox has shipped. See PatientShell.tsx.
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
            colors={HERO_OVERLAY}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
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
              `cn` is a plain joiner with no tailwind-merge). Shadow deleted; a
              filled teal panel needs no edge on a near-white page. */}
        <View className="gap-md rounded-card border border-primary/20 bg-primary-container p-md">
          <View className="flex-row items-center gap-sm">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-on-primary-container/10">
              <MaterialIcons name="edit-calendar" size={26} color="#f4fffc" />
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
            <Text className="font-label-md text-label-md" style={{ color: "#008378" }}>
              Go to Log
            </Text>
            <MaterialIcons name="arrow-forward" size={18} color="#008378" />
          </Pressable>
        </View>

        {/* Daily medications */}
        <Card className="gap-md">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-xs">
              <MaterialIcons name="medical-services" size={22} color="#00685f" />
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
                Daily Medications
              </Text>
            </View>
            <Text className="font-label-md text-label-md text-primary">
              {takenCount} of {meds.length} taken
            </Text>
          </View>
          <View className="gap-sm">
            {meds.map((m) => (
              <MedRow key={m.id} med={m} onMarkTaken={() => markTaken(m.id)} />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View full medication schedule"
            onPress={() => router.push(MANAGE_HREF)}
            className="flex-row items-center justify-center gap-xs border-t border-outline-variant/20 pt-sm active:opacity-80"
          >
            <Text className="font-label-md text-label-md text-primary">View Full Schedule</Text>
            <MaterialIcons name="arrow-forward" size={18} color="#00685f" />
          </Pressable>
        </Card>

        {/* Daily nutrient intake */}
        <Card className="gap-md">
          <View className="flex-row items-center justify-between">
            <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
              Daily Nutrient Intake
            </Text>
            <MaterialIcons name="restaurant-menu" size={22} color="#00685f" />
          </View>
          <View className="gap-md">
            {NUTRIENTS.map((n) => (
              <NutrientBar key={n.label} nutrient={n} />
            ))}
          </View>
        </Card>

        {/* Sleep trend */}
        <Card className="gap-md">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-xs">
              <MaterialIcons name="bedtime" size={20} color="#00685f" />
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

        {/* Mood over time */}
        <MoodCard />

        {/* Exercise + Water row */}
        <View className="flex-row gap-md">
          <Card className="flex-1 items-center gap-sm">
            <View className="flex-row items-center gap-xs">
              <MaterialIcons name="directions-run" size={18} color="#2170e4" />
              <Text className="font-label-md text-label-md text-on-surface">Weekly Active</Text>
            </View>
            <ProgressRing value={150} goal={200} unit="min" tint="#2170e4" />
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              Goal: 200 min
            </Text>
          </Card>

          <Card className="flex-1 gap-sm">
            <View className="flex-row items-center gap-xs">
              <MaterialIcons name="water-drop" size={18} color="#0d9488" />
              <Text className="font-label-md text-label-md text-on-surface">Water Trend</Text>
            </View>
            <AreaChart values={WATER.liters} height={64} tint="#0d9488" />
            <View className="flex-row items-center justify-between">
              <Text className="font-label-sm text-label-sm text-on-surface-variant">Mon</Text>
              <Text
                className="font-label-sm text-label-sm"
                style={{ color: "#0d9488", fontWeight: "700" }}
              >
                Today: {WATER.today}
              </Text>
              <Text className="font-label-sm text-label-sm text-on-surface-variant">Sun</Text>
            </View>
          </Card>
        </View>
      </ScrollView>
    </PatientShell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function MedRow({ med, onMarkTaken }: { med: Medication; onMarkTaken: () => void }) {
  return (
    <View className="flex-row items-center justify-between rounded-lg border border-outline-variant/10 bg-surface-container-low p-sm">
      <View className="flex-row items-center gap-sm">
        <View
          className={`h-8 w-8 items-center justify-center rounded-full ${
            med.taken ? "bg-primary/10" : "bg-surface-container"
          }`}
        >
          <MaterialIcons
            name={med.taken ? "check" : "schedule"}
            size={20}
            color={med.taken ? "#00685f" : "#3d4947"}
          />
        </View>
        <View>
          <Text className="font-label-md text-label-md text-on-surface">{med.name}</Text>
          <Text
            className="font-label-sm uppercase text-on-surface-variant"
            style={{ fontSize: 10, letterSpacing: 0.5 }}
          >
            {med.time} • {med.taken ? "Taken" : "Pending"}
          </Text>
        </View>
      </View>
      {!med.taken ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mark ${med.name} as taken`}
          onPress={onMarkTaken}
          className="rounded-md border border-primary/20 px-sm py-xs active:scale-95"
        >
          <Text className="font-label-sm text-label-sm text-primary">Mark Taken</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function NutrientBar({ nutrient }: { nutrient: Nutrient }) {
  return (
    <View>
      <View className="mb-xs flex-row items-baseline justify-between">
        <Text className="font-label-md text-label-md text-on-surface-variant">
          {nutrient.label}
        </Text>
        <Text className="font-label-md text-label-md text-on-surface" style={{ fontWeight: "700" }}>
          {nutrient.value}{" "}
          <Text className="text-on-surface-variant" style={{ fontWeight: "400" }}>
            {nutrient.goal}
          </Text>
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-surface-container">
        <View
          style={{
            width: `${nutrient.pct}%`,
            height: "100%",
            backgroundColor: nutrient.color,
            borderRadius: 999,
          }}
        />
      </View>
    </View>
  );
}

// Bar chart built from plain Views (same idiom as Overview's MiniChart),
// scaled so the tallest bar fills the track. The highlighted index is
// drawn solid; the rest are muted.
function BarChart({
  labels,
  values,
  highlightIndex,
  height,
  tint = "#00685f",
  showLabels = true,
}: {
  labels: string[];
  values: number[];
  highlightIndex: number;
  height: number;
  tint?: string;
  showLabels?: boolean;
}) {
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
                color: i === highlightIndex ? "#171d1c" : "#3d4947",
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

function MoodCard() {
  // Axis glyph colour via the token map, not a Tailwind class: no cssInterop is
  // registered for icon components.
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const [range, setRange] = useState<"Day" | "Week" | "Month">("Week");
  return (
    <Card className="gap-md">
      <View className="flex-row items-center justify-between">
        <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
          Mood Over Time
        </Text>
        {/* Range segmented control. The active thumb carried a `segmentShadow`;
            deleted — a segmented thumb is a tile inside a track, not one of
            BRAND's floating roles, and the tonal step from `surface-container`
            to `surface-container-lowest` plus `text-on-surface` marks it. */}
        <View className="flex-row rounded-lg bg-surface-container p-xs">
          {(["Day", "Week", "Month"] as const).map((r) => {
            const active = r === range;
            return (
              <Pressable
                key={r}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setRange(r)}
                className={`rounded-md px-sm py-xs ${active ? "bg-surface-container-lowest" : ""}`}
              >
                <Text
                  className={`font-label-md text-label-sm ${active ? "text-on-surface" : "text-on-surface-variant"}`}
                >
                  {r}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {/* Glyph y-axis + SVG line chart (the comp's real intent). */}
      <View className="flex-row">
        <View className="justify-between pr-sm" style={{ height: 110 }}>
          {MOOD.scale.map((step) => (
            // <Icon /> takes no accessibility props, so the label lives on a
            // wrapper — otherwise the axis is silent to a screen reader.
            <View key={step.icon} accessibilityLabel={step.label}>
              <Icon name={step.icon} size={16} color={onSurfaceVariant} />
            </View>
          ))}
        </View>
        <View className="flex-1 border-l border-outline-variant/20 pl-sm">
          <LineChart
            values={MOOD.values}
            min={1}
            max={4}
            highlightIndex={MOOD.todayIndex}
            height={110}
            tint="#0d9488"
            highlightTint="#00685f"
          />
          <View className="mt-xs flex-row">
            {MOOD.days.map((d, i) => (
              <Text
                key={d}
                className="text-center"
                style={{
                  flex: 1,
                  fontSize: 10,
                  color: i === MOOD.todayIndex ? "#00685f" : "#3d4947",
                  fontWeight: i === MOOD.todayIndex ? "700" : "400",
                }}
              >
                {d}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </Card>
  );
}

// SVG progress ring. A muted full-circle track with a tinted arc whose
// length encodes value/goal, drawn via strokeDasharray and rotated so the
// arc starts at 12 o'clock (matches the comp's -rotate-90 ring).
function ProgressRing({
  value,
  goal,
  unit,
  tint,
}: {
  value: number;
  goal: number;
  unit: string;
  tint: string;
}) {
  const SIZE = 80;
  const STROKE = 7;
  const r = (SIZE - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / goal));
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
      <Svg width={SIZE} height={SIZE} style={{ position: "absolute" }}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          stroke="#eaefed"
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          stroke={tint}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          // Rotate -90° around the centre so the arc begins at the top.
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View className="items-center">
        <Text
          className="font-headline-md text-on-surface"
          style={{ fontSize: 18, fontWeight: "700", lineHeight: 20 }}
        >
          {value}
        </Text>
        <Text className="text-on-surface-variant" style={{ fontSize: 10 }}>
          {unit}
        </Text>
      </View>
    </View>
  );
}

// SVG line chart. Plots `values` (clamped to [min,max]) as a polyline with
// a dot per point; the highlighted point is drawn larger in highlightTint
// with a soft ring. Uses a fixed 100-wide viewBox scaled to the container.
function LineChart({
  values,
  min,
  max,
  highlightIndex,
  height,
  tint,
  highlightTint,
}: {
  values: number[];
  min: number;
  max: number;
  highlightIndex: number;
  height: number;
  tint: string;
  highlightTint: string;
}) {
  const W = 100;
  const PAD = 6; // keep dots off the edges
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * W : W / 2;
    // Higher value → higher on screen (smaller y).
    const norm = (Math.max(min, Math.min(max, v)) - min) / span;
    const y = PAD + (1 - norm) * (height - 2 * PAD);
    return { x, y };
  });
  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
      <Polyline
        points={polyline}
        fill="none"
        stroke={tint}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.map((p, i) => {
        const active = i === highlightIndex;
        return active ? (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={highlightTint}
            stroke={highlightTint}
            strokeOpacity={0.25}
            strokeWidth={4}
          />
        ) : (
          <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={tint} />
        );
      })}
    </Svg>
  );
}

// SVG area chart. A smooth-ish line (straight segments) with a gradient
// fill from the curve down to the baseline. Scaled within its own min/max.
function AreaChart({ values, height, tint }: { values: number[]; height: number; tint: string }) {
  const W = 100;
  const PAD = 4;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * W : W / 2;
    const y = PAD + (1 - (v - min) / span) * (height - 2 * PAD);
    return { x, y };
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${W},${height} L0,${height} Z`;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
      <Defs>
        <SvgLinearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tint} stopOpacity={0.25} />
          <Stop offset="1" stopColor={tint} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={area} fill="url(#waterFill)" />
      <Path
        d={line}
        fill="none"
        stroke={tint}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// `cardShadow` and `segmentShadow` were deleted with their last call sites, and
// `appBarShadow` went with the hand-rolled bar this screen no longer draws.
// Nothing on this screen floats — see docs/BRAND.md §Elevation.
