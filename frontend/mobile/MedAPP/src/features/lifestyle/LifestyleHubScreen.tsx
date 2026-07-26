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
// Translation rules (same as the sibling screens):
//   - glass header / ambient-shadow → opaque bg-surface + Platform.select
//     shadow.
//   - hero gradient overlay (to-r from surface-tint/80) →
//     expo-linear-gradient horizontal fill.
//   - hover tooltips / group-hover bar recolor → dropped (no hover on RN);
//     the "today" bar is pre-highlighted instead.
//   - Day/Week/Month + medication "Mark Taken" are interactive but LOCAL.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useState } from "react";
import { Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
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
import { BottomNav } from "@/features/home/components/BottomNav";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

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

// Mood — 7 days on a 1..4 scale (😔→🤩). Thursday highlighted.
const MOOD = {
  scale: ["🤩", "🙂", "😐", "😔"],
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

export function LifestyleHubScreen() {
  const [meds, setMeds] = useState<Medication[]>(SEED_MEDS);
  const takenCount = meds.filter((m) => m.taken).length;

  const markTaken = (id: string) =>
    setMeds((prev) => prev.map((m) => (m.id === id ? { ...m, taken: true } : m)));

  return (
    <View className="flex-1 bg-surface">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* App bar */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/20 bg-surface/80 px-gutter py-sm"
          style={appBarShadow}
        >
          <View className="flex-row items-center gap-sm">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-primary-container">
              <MaterialIcons name="person" size={18} color="#f4fffc" />
            </View>
            <Text className="font-headline-md text-headline-md text-primary">Lifestyle Hub</Text>
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
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140, paddingTop: 16, gap: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View className="h-48 overflow-hidden rounded-2xl" style={cardShadow}>
            <Image source={{ uri: HERO_IMG }} className="absolute inset-0 h-full w-full" resizeMode="cover" />
            <LinearGradient
              colors={HERO_OVERLAY}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: "absolute", inset: 0 }}
            />
            <View className="flex-1 justify-end p-md">
              <Text className="font-headline-md text-on-primary" style={{ fontSize: 24, fontWeight: "700" }}>
                Your Wellness Path
              </Text>
              <Text className="mt-xs font-body-md text-body-md text-on-primary/90" style={{ maxWidth: "80%" }}>
                Track, adapt, and thrive today.
              </Text>
            </View>
          </View>

          {/* Daily logging entry point */}
          <View className="gap-md rounded-xl border border-primary/20 bg-primary-container p-md" style={cardShadow}>
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
          <View className="gap-md rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-md" style={cardShadow}>
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
          </View>

          {/* Daily nutrient intake */}
          <View className="gap-md rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-md" style={cardShadow}>
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
          </View>

          {/* Sleep trend */}
          <View className="gap-md rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-md" style={cardShadow}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-xs">
                <MaterialIcons name="bedtime" size={20} color="#00685f" />
                <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
                  Sleep Trend
                </Text>
              </View>
              <View className="rounded-md bg-primary-container/40 px-sm py-xs">
                <Text className="font-label-md text-label-sm text-primary">Avg: {SLEEP.avg}</Text>
              </View>
            </View>
            <BarChart
              labels={SLEEP.days}
              values={SLEEP.hours}
              highlightIndex={SLEEP.todayIndex}
              height={112}
            />
          </View>

          {/* Mood over time */}
          <MoodCard />

          {/* Exercise + Water row */}
          <View className="flex-row gap-md">
            <View className="flex-1 items-center gap-sm rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-md" style={cardShadow}>
              <View className="flex-row items-center gap-xs">
                <MaterialIcons name="directions-run" size={18} color="#2170e4" />
                <Text className="font-label-md text-label-md text-on-surface">Weekly Active</Text>
              </View>
              <ProgressRing value={150} goal={200} unit="min" tint="#2170e4" />
              <Text className="font-label-sm text-label-sm text-on-surface-variant">Goal: 200 min</Text>
            </View>

            <View className="flex-1 gap-sm rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-md" style={cardShadow}>
              <View className="flex-row items-center gap-xs">
                <MaterialIcons name="water-drop" size={18} color="#0d9488" />
                <Text className="font-label-md text-label-md text-on-surface">Water Trend</Text>
              </View>
              <AreaChart values={WATER.liters} height={64} tint="#0d9488" />
              <View className="flex-row items-center justify-between">
                <Text className="font-label-sm text-label-sm text-on-surface-variant">Mon</Text>
                <Text className="font-label-sm text-label-sm" style={{ color: "#0d9488", fontWeight: "700" }}>
                  Today: {WATER.today}
                </Text>
                <Text className="font-label-sm text-label-sm text-on-surface-variant">Sun</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <BottomNav
          active="lifestyle"
          onTabPress={(key) => {
            if (key === "home") router.push("/(app)" as Href);
            else if (key === "overview") router.push("/(app)/overview" as Href);
            else if (key === "community") router.push("/(app)/community" as Href);
            // lifestyle is the current screen; inbox still a stub.
          }}
        />
      </SafeAreaView>
    </View>
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
          <Text className="font-label-sm uppercase text-on-surface-variant" style={{ fontSize: 10, letterSpacing: 0.5 }}>
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
        <Text className="font-label-md text-label-md text-on-surface-variant">{nutrient.label}</Text>
        <Text className="font-label-md text-label-md text-on-surface" style={{ fontWeight: "700" }}>
          {nutrient.value} <Text className="text-on-surface-variant" style={{ fontWeight: "400" }}>{nutrient.goal}</Text>
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-surface-container">
        <View style={{ width: `${nutrient.pct}%`, height: "100%", backgroundColor: nutrient.color, borderRadius: 999 }} />
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
            <View key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, justifyContent: "flex-end" }}>
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
  const [range, setRange] = useState<"Day" | "Week" | "Month">("Week");
  return (
    <View className="gap-md rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-md" style={cardShadow}>
      <View className="flex-row items-center justify-between">
        <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
          Mood Over Time
        </Text>
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
                style={active ? segmentShadow : undefined}
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
      {/* Emoji y-axis + SVG line chart (the comp's real intent). */}
      <View className="flex-row">
        <View className="justify-between pr-sm" style={{ height: 110 }}>
          {MOOD.scale.map((e) => (
            <Text key={e} style={{ fontSize: 16 }}>
              {e}
            </Text>
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
    </View>
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
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke="#eaefed" strokeWidth={STROKE} fill="none" />
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
        <Text className="font-headline-md text-on-surface" style={{ fontSize: 18, fontWeight: "700", lineHeight: 20 }}>
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
      <Polyline points={polyline} fill="none" stroke={tint} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => {
        const active = i === highlightIndex;
        return active ? (
          <Circle key={i} cx={p.x} cy={p.y} r={4} fill={highlightTint} stroke={highlightTint} strokeOpacity={0.25} strokeWidth={4} />
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
      <Path d={line} fill="none" stroke={tint} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Shadows — same Platform.select pattern as the other screens.
// ---------------------------------------------------------------------------

const cardShadow =
  Platform.select({
    ios: { shadowColor: "#475569", shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 4 } },
    web: { boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.05)" },
    android: { elevation: 2 },
  }) || {};

const appBarShadow =
  Platform.select({
    ios: { shadowColor: "#000000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    web: { boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.04)" },
    android: { elevation: 3 },
  }) || {};

const segmentShadow =
  Platform.select({
    ios: { shadowColor: "#475569", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    web: { boxShadow: "0px 2px 8px rgba(71, 85, 105, 0.08)" },
    android: { elevation: 2 },
  }) || {};
