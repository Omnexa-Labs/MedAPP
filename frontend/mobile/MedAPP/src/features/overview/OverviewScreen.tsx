// Overview screen — translated from the Stitch "Health Overview Hub" HTML.
//
// Reached from the BottomNav "Overview" tab (the second slot). On the
// web comp this is a 12-column bento grid with a desktop side-rail;
// mobile collapses to a single column and the side-rail is dropped
// (the BottomNav is the mobile nav).
//
// Translation rules (same as HomeScreen / FindCareScreen):
//   - backdrop-blur glass surfaces → opaque bg-surface + border +
//     Platform.select shadow. RN blur is expensive and visually
//     equivalent at these opacities.
//   - hover:* / group-hover:* / focus:ring → dropped (no hover on RN).
//   - The CSS mini-chart (flex bars) → a small <MiniChart> that lays
//     out fixed-height bars with a tint color. Static heights for now;
//     real series wiring is a follow-up (this pass is design-only).
//   - Material Symbols icon names map to @expo/vector-icons
//     MaterialIcons kebab-case (monitor_heart → monitor-heart).
//     Symbols with no MaterialIcons equivalent fall back to the
//     closest match (blood_pressure → "bloodtype", person_clinical →
//     "person", sync_saved_locally → "cloud-done").
//   - The desktop "7D/1M/3M/1Y" segmented control is kept; selecting a
//     range is local UI state only — no data refetch yet.
//
// BottomNav is rendered with active="overview". Tapping "home" pops
// back to the home route.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here. None today beyond expo-status-bar / expo-router.

import { useState } from "react";
import { Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { BottomNav } from "@/features/home/components/BottomNav";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// ---------------------------------------------------------------------------
// Static design data. Mirrors the Stitch dump verbatim so design review
// matches 1:1. Swap to real series/records when the Overview screen is
// wired to ehr_service / wearable_sync_service.
// ---------------------------------------------------------------------------

const TREND_RANGES = ["7D", "1M", "3M", "1Y"] as const;
type TrendRange = (typeof TREND_RANGES)[number];

interface TrendMetric {
  label: string;
  value: string;
  unit: string;
  icon: IconName;
  tint: string; // hex — drives both the icon and the chart bars
  bars: number[]; // 0..100 heights
}

const TREND_METRICS: TrendMetric[] = [
  {
    label: "Heart Rate",
    value: "72",
    unit: "bpm",
    icon: "favorite",
    tint: "#ba1a1a",
    bars: [60, 45, 80, 55, 90, 70, 65],
  },
  {
    label: "Blood Pressure",
    value: "118",
    unit: "/76",
    icon: "bloodtype",
    tint: "#00685f",
    bars: [40, 35, 50, 45, 30, 35, 40],
  },
  {
    label: "Sleep",
    value: "7.2",
    unit: "hrs",
    icon: "bedtime",
    tint: "#0058be",
    bars: [70, 85, 40, 95, 80, 85, 90],
  },
  {
    label: "Hydration",
    value: "1.8",
    unit: "L",
    icon: "water-drop",
    tint: "#6bd8cb",
    bars: [30, 45, 60, 80, 60, 75, 100],
  },
];

interface Milestone {
  date: string;
  title: string;
  body: string;
  icon: IconName;
  tint: string;
  italic?: boolean;
}

const MILESTONES: Milestone[] = [
  {
    date: "Nov 12, 2023",
    title: "Dosage Adjustment",
    body: "Started Lisinopril 10mg morning routine. BP stabilized to 120/80 within 7 days.",
    icon: "medication",
    tint: "#00685f",
    italic: true,
  },
  {
    date: "Oct 28, 2023",
    title: "Cardiology Consultation",
    body: "Follow-up with Dr. Jenkins. Heart rate variability improving.",
    icon: "event",
    tint: "#0058be",
  },
];

interface Device {
  name: string;
  syncedAgo: string;
  icon: IconName;
  swatch: string; // device-brand chip background
}

const DEVICES: Device[] = [
  { name: "Apple Watch Ultra", syncedAgo: "Last synced: 2m ago", icon: "watch", swatch: "#000000" },
  { name: "Oura Ring Gen 3", syncedAgo: "Last synced: 45m ago", icon: "brightness-5", swatch: "#1e293b" },
];

interface MedDose {
  name: string;
  time: string;
  taken: boolean;
}

const MED_DOSES: MedDose[] = [
  { name: "Lisinopril 10mg", time: "08:00 AM", taken: true },
  { name: "Atorvastatin 20mg", time: "09:00 PM", taken: false },
];

interface Script {
  prescriber: string;
  meta: string;
  // Carried into the share screen so its summary card has real
  // context. Issued date is the human label shown there; meta above
  // is the compact "Specialty • date" line shown on the Overview card.
  drug: string;
  patient: string;
  scriptId: string;
  issuedDate: string;
}

const SCRIPTS: Script[] = [
  {
    prescriber: "Dr. Sarah Jenkins",
    meta: "Cardiology • Oct 12",
    drug: "Lisinopril 10mg",
    patient: "Alex Rivers",
    scriptId: "#8829-X",
    issuedDate: "Oct 12, 2023",
  },
  {
    prescriber: "Dr. Mark Chen",
    meta: "GP • Sep 05",
    drug: "Atorvastatin 20mg",
    patient: "Alex Rivers",
    scriptId: "#7714-Q",
    issuedDate: "Sep 05, 2023",
  },
];

// Build the Href for a script's share screen. Params arrive on the
// other side as strings via useLocalSearchParams. Cast through unknown
// because expo-router's generated route union doesn't yet include
// newly-added routes until the types are regenerated — same reason
// HomeScreen casts its pushes with `as Href`.
function shareHref(s: Script): Href {
  return {
    pathname: "/(app)/active-script-share",
    params: {
      drug: s.drug,
      patient: s.patient,
      scriptId: s.scriptId,
      prescriber: s.prescriber,
      issuedDate: s.issuedDate,
    },
  } as unknown as Href;
}

// Same param set, different destination — the read-only Rx document.
function viewHref(s: Script): Href {
  return {
    pathname: "/(app)/active-script-view",
    params: {
      drug: s.drug,
      patient: s.patient,
      scriptId: s.scriptId,
      prescriber: s.prescriber,
      issuedDate: s.issuedDate,
    },
  } as unknown as Href;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function OverviewScreen() {
  const [range, setRange] = useState<TrendRange>("7D");

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* Top app bar — avatar + "Health Hub" + notifications. */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-gutter py-sm"
          style={appBarShadow}
        >
          <View className="h-10 w-10 overflow-hidden rounded-full border-2 border-surface-container-high">
            <Image
              source={{
                uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuDLitwX1Wr066dNe6iFnfpr21hgTTZ-Hkv6-a3EZStvnga4SY94Gt0P8lEeLQ4C4s6tf_7c3MAaeVdoEEyrRIFKFILW4WoVHQW8eFg9xkbX64gK0ZqDnJbCYUc-Fx2mTWXQG9kdV-cuAOord-4alTi-u9-2axy0D0KRwRolI0IiAohjQ1KQ8kh48V1BLyWs6QoM06vq8NQocry-uoo8Nw2MWzI0n6d2DNvs7xJv3YObMI_Id960RSPxCDXlwt4Ryg4suoycif9DQNaV",
              }}
              className="h-full w-full"
              accessibilityLabel="Your profile photo"
            />
          </View>
          <Text className="font-headline-md text-headline-md text-primary">Health Hub</Text>
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
        >
          {/* AI insight card */}
          <View className="mt-md overflow-hidden rounded-2xl border border-primary/10 bg-primary/5 p-md">
            <MaterialIcons
              name="auto-awesome"
              size={64}
              color="rgba(0,104,95,0.08)"
              style={{ position: "absolute", top: -6, right: -2 }}
            />
            <View className="flex-row items-start gap-sm">
              <View className="rounded-xl bg-primary/10 p-sm">
                <MaterialIcons name="auto-awesome" size={22} color="#00685f" />
              </View>
              <View className="flex-1">
                <Text className="font-label-md text-label-md mb-xs text-primary">
                  Health Insight
                </Text>
                <Text className="font-body-md text-body-md text-on-surface">
                  Your sleep quality improved by{" "}
                  <Text className="font-bold text-primary">12%</Text> after starting your new
                  medication routine. Consistency is key!
                </Text>
              </View>
            </View>
          </View>

          {/* Quick actions */}
          <View className="mt-md flex-row gap-sm">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Download report"
              className="flex-1 flex-row items-center justify-center gap-xs rounded-xl bg-primary py-md active:scale-[0.98]"
              style={cardShadow}
            >
              <MaterialIcons name="download" size={20} color="#ffffff" />
              <Text className="font-label-md text-label-md text-white">Report</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export data"
              className="flex-1 flex-row items-center justify-center gap-xs rounded-xl border border-outline-variant bg-surface-container-lowest py-md active:scale-[0.98]"
            >
              <MaterialIcons name="share" size={20} color="#171d1c" />
              <Text className="font-label-md text-label-md text-on-surface">Export</Text>
            </Pressable>
          </View>

          {/* Health trends */}
          <Card className="mt-md">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-xs">
                <MaterialIcons name="monitor-heart" size={22} color="#00685f" />
                <Text className="font-headline-md text-on-surface" style={{ fontSize: 20 }}>
                  Health Trends
                </Text>
              </View>
              <View className="flex-row rounded-lg bg-surface-container-low p-xs">
                {TREND_RANGES.map((r) => {
                  const active = r === range;
                  return (
                    <Pressable
                      key={r}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setRange(r)}
                      className={`rounded-md px-sm py-xs ${active ? "bg-primary" : ""}`}
                    >
                      <Text
                        className={`font-label-sm text-label-sm ${
                          active ? "text-white" : "text-on-surface-variant"
                        }`}
                      >
                        {r}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 2-up grid of metric tiles */}
            <View className="mt-md flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
              {TREND_METRICS.map((m) => (
                <View key={m.label} style={{ width: "50%", paddingHorizontal: 6, marginBottom: 12 }}>
                  <MetricTile metric={m} />
                </View>
              ))}
            </View>
          </Card>

          {/* Clinical milestones */}
          <Card className="mt-md">
            <Text className="font-headline-md mb-md text-on-surface" style={{ fontSize: 20 }}>
              Clinical Milestones
            </Text>
            <View>
              {MILESTONES.map((ms, i) => (
                <TimelineItem key={ms.date} milestone={ms} isLast={i === MILESTONES.length - 1} />
              ))}
            </View>
          </Card>

          {/* Data integrity */}
          <Card className="mt-md">
            <View className="flex-row items-center justify-between">
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 20 }}>
                Data Integrity
              </Text>
              <MaterialIcons name="cloud-done" size={22} color="rgba(0,104,95,0.4)" />
            </View>
            <View className="mt-sm gap-sm">
              {DEVICES.map((d) => (
                <View
                  key={d.name}
                  className="flex-row items-center justify-between rounded-xl border border-outline-variant/30 bg-surface-container-low p-sm"
                >
                  <View className="flex-row items-center gap-sm">
                    <View
                      className="h-10 w-10 items-center justify-center rounded-lg"
                      style={{ backgroundColor: d.swatch }}
                    >
                      <MaterialIcons name={d.icon} size={20} color="#ffffff" />
                    </View>
                    <View>
                      <Text className="font-label-md text-label-md text-on-surface">{d.name}</Text>
                      <Text className="font-label-sm text-label-sm text-on-surface-variant">
                        {d.syncedAgo}
                      </Text>
                    </View>
                  </View>
                  <View className="h-2 w-2 rounded-full bg-primary" />
                </View>
              ))}
            </View>
          </Card>

          {/* Medication adherence */}
          <Card className="mt-md">
            <View className="flex-row items-center justify-between">
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 20 }}>
                Medication Adherence
              </Text>
              <View className="flex-row items-center gap-xs rounded-full border border-primary/20 bg-primary/10 px-sm py-xs">
                <MaterialIcons name="check-circle" size={16} color="#00685f" />
                <Text className="font-label-sm text-label-sm text-primary">85% Compliance</Text>
              </View>
            </View>
            <View className="mt-sm gap-sm">
              {MED_DOSES.map((dose) => (
                <View
                  key={dose.name}
                  className="flex-row items-center justify-between rounded-xl bg-surface-container-low p-md"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftColor: dose.taken ? "#00685f" : "#dee4e1",
                    opacity: dose.taken ? 1 : 0.6,
                  }}
                >
                  <View>
                    <Text className="font-label-md text-label-md text-on-surface">{dose.name}</Text>
                    <Text className="font-body-md text-body-md text-on-surface-variant">
                      {dose.time}
                    </Text>
                  </View>
                  <View
                    className={`h-8 w-8 items-center justify-center rounded-full ${
                      dose.taken ? "border border-primary" : "bg-primary/20"
                    }`}
                  >
                    <MaterialIcons
                      name={dose.taken ? "done" : "hourglass-empty"}
                      size={18}
                      color="#00685f"
                    />
                  </View>
                </View>
              ))}
            </View>
          </Card>

          {/* Active scripts */}
          <Card className="mt-md">
            <Text className="font-headline-md text-on-surface" style={{ fontSize: 20 }}>
              Active Scripts
            </Text>
            <View className="mt-sm gap-sm">
              {SCRIPTS.map((s) => (
                <View
                  key={s.prescriber}
                  className="gap-sm rounded-xl border border-outline-variant/30 bg-surface-container-low p-sm"
                >
                  <View className="flex-row items-center gap-xs">
                    <MaterialIcons name="person" size={18} color="#00685f" />
                    <Text className="font-label-md text-label-md text-on-surface">
                      {s.prescriber}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="font-label-sm text-label-sm text-on-surface-variant">
                      {s.meta}
                    </Text>
                    <View className="flex-row gap-md">
                      <ScriptAction
                        icon="share"
                        label="Share"
                        onPress={() => router.push(shareHref(s))}
                      />
                      <ScriptAction
                        icon="visibility"
                        label="View Rx"
                        onPress={() => router.push(viewHref(s))}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </ScrollView>

        {/* Overview is the second tab — keep it highlighted. */}
        <BottomNav
          active="overview"
          onTabPress={(key) => {
            if (key === "home") router.back();
            else if (key === "community") router.push("/(app)/community" as Href);
            else if (key === "lifestyle") router.push("/(app)/lifestyle" as Href);
          }}
        />
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <View
      className={`rounded-2xl border border-outline-variant bg-surface-container-lowest p-md ${className}`}
      style={cardShadow}
    >
      {children}
    </View>
  );
}

function MetricTile({ metric }: { metric: TrendMetric }) {
  return (
    <View className="gap-sm rounded-xl border border-outline-variant/30 bg-surface-container-low p-sm">
      <View className="flex-row items-center justify-between">
        <Text className="font-label-sm text-label-sm text-on-surface-variant">{metric.label}</Text>
        <MaterialIcons name={metric.icon} size={18} color={metric.tint} />
      </View>
      <View className="flex-row items-baseline gap-xs">
        <Text className="font-headline-md text-on-surface" style={{ fontSize: 22 }}>
          {metric.value}
        </Text>
        <Text className="font-body-md text-body-md text-on-surface-variant">{metric.unit}</Text>
      </View>
      <MiniChart bars={metric.bars} tint={metric.tint} />
    </View>
  );
}

// Fixed-height bar strip. Each bar is `height%` of the 40px track and
// tinted at 30% opacity to match the CSS `.chart-bar { opacity: 0.3 }`.
function MiniChart({ bars, tint }: { bars: number[]; tint: string }) {
  return (
    <View style={{ height: 40, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: `${h}%`,
            backgroundColor: tint,
            opacity: 0.3,
            borderRadius: 1,
          }}
        />
      ))}
    </View>
  );
}

// Single timeline row. The connecting rail is drawn as a thin View
// behind the dots; the last item stops the rail short.
function TimelineItem({ milestone, isLast }: { milestone: Milestone; isLast: boolean }) {
  return (
    <View className="flex-row gap-sm" style={{ paddingBottom: isLast ? 0 : 24 }}>
      {/* Rail + dot column */}
      <View className="items-center">
        <View
          className="items-center justify-center rounded-full"
          style={{ width: 20, height: 20, backgroundColor: milestone.tint }}
        >
          <MaterialIcons name={milestone.icon} size={12} color="#ffffff" />
        </View>
        {!isLast ? (
          <View style={{ flex: 1, width: 2, marginTop: 4, backgroundColor: "#e4e9e7" }} />
        ) : null}
      </View>
      {/* Content */}
      <View className="flex-1 pb-xs">
        <Text className="font-label-sm text-label-sm" style={{ color: milestone.tint }}>
          {milestone.date}
        </Text>
        <Text className="font-label-md text-label-md mt-xs text-on-surface">{milestone.title}</Text>
        <Text
          className="font-body-md text-body-md mt-xs text-on-surface-variant"
          style={milestone.italic ? { fontStyle: "italic" } : undefined}
        >
          {milestone.italic ? `"${milestone.body}"` : milestone.body}
        </Text>
      </View>
    </View>
  );
}

function ScriptAction({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      className="flex-row items-center gap-xs active:opacity-70"
    >
      <MaterialIcons name={icon} size={16} color="#00685f" />
      <Text className="font-label-sm text-label-sm text-primary">{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Shadows — same Platform.select pattern as HomeScreen / FindCareScreen.
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
      shadowColor: "#000000",
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    web: { boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.04)" },
    android: { elevation: 3 },
  }) || {};
