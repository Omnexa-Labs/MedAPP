// Overview screen — translated from the Stitch "Health Overview Hub" HTML.
//
// Reached from the BottomNav "Overview" tab (the second slot). On the
// web comp this is a 12-column bento grid with a desktop side-rail;
// mobile collapses to a single column and the side-rail is dropped
// (the BottomNav is the mobile nav).
//
// Translation rules (same as HomeScreen / FindCareScreen):
//   - backdrop-blur glass surfaces → opaque bg-surface + border. RN blur is
//     expensive and visually equivalent at these opacities. (These used to
//     also carry a Platform.select shadow; that is gone — docs/BRAND.md
//     §Elevation, see the note at the foot of this file.)
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
// ============================================================================
// SHELL MIGRATION — the inline app bar is gone
// ============================================================================
// This was one of the last three hand-rolled patient app bars. It is a TAB ROOT
// (the BottomNav "Overview" slot), so it keeps the patient bar and the bottom
// nav and gets NO back button: it renders <PatientShell activeTab="overview">
// and leaves `hideBack` at its `true` default.
//
// Its bar also disagreed with the shared one on composition — avatar LEFT, a
// re-typeset "Health Hub" <Text> in the centre, bell right — where
// docs/BRAND.md §App shell mandates "logo on the left; avatar + notifications
// grouped on the right". So the chrome is not this screen's to draw.
//
// Deleted with the bar:
//   * the avatar <Image> + its `border-2 border-surface-container-high` ring —
//     PatientAppBar draws an AvatarWithFallback (photo -> initials ->
//     silhouette). The photo URI moved to PROFILE_PHOTO_URI below and is passed
//     straight through, so the same face renders, with the same accessible name.
//   * the bell Pressable and its literal `color="#00685f"` glyph (the LIGHT
//     value of color/primary, frozen in JS) — the only bar-owned colour literal
//     on this screen. The shell's bell carries the same "Notifications" label
//     and the same no-op, because nothing models a destination or a count yet.
//   * `StatusBar style="dark"`, frozen to one mode — the shell resolves it from
//     the active scheme.
//   * the local <SafeAreaView> / <BottomNav> scaffolding the shell now owns.
//     BottomNav's `active="overview"` and `onTabPress` routing moved onto the
//     shell verbatim.
//
// FLAGGED: PatientAppBar has no title slot — Figma 741:887 has a logo where
// this screen had "Health Hub", and BRAND §Logo rules forbid re-typesetting the
// mark. The string is NOT dropped: it moves into the scrollable body as the page
// heading, which is the same relocation InboxScreen made for "Messages".
//
// FLAGGED: the avatar photo is still a hardcoded remote URI. InboxScreen reads
// `useAuthStore().user`, which is where this belongs; wiring it here would swap
// the rendered face, so it is left as-is for a follow-up rather than changed
// under a chrome migration.
//
// ============================================================================
// DOWNLOAD REPORT — the button had no `onPress` at all
// ============================================================================
// "Report" was a filled primary CTA, first in the quick-actions row, wired to
// nothing: it rendered its press animation and returned. It now writes this
// screen's own content to a real text file and hands it to the OS share sheet
// (see @/lib/documents for the SDK 55 expo-file-system facts and the failure
// paths). It is a .txt and not a PDF because this project has no PDF generator
// and `expo-print` is not a dependency; the accessible label says so.
//
// Its sibling "Export" is still inert and is FLAGGED, not fixed — "export data"
// means the full record, which lives behind ehr_service, not on this screen.
// Wiring it to the same on-screen summary would make two buttons that produce
// identical files under different promises.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Card, VitalStatCard, type HealthIconName } from "@/components/ui";
import { PatientShell } from "@/components/shell";
import { Toast, useToast } from "@/components/feedback";
import {
  buildHealthReportDocument,
  describeSaveResult,
  formatDocumentTimestamp,
  healthReportFileName,
  saveTextDocument,
} from "@/lib/documents";
import { useTokenColor } from "@/lib/tokens";

/**
 * The photo the deleted app bar rendered, handed to the shell unchanged so the
 * migration is a no-op for what the user sees. See the FLAG above: this wants to
 * come from the auth store.
 */
const PROFILE_PHOTO_URI =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDLitwX1Wr066dNe6iFnfpr21hgTTZ-Hkv6-a3EZStvnga4SY94Gt0P8lEeLQ4C4s6tf_7c3MAaeVdoEEyrRIFKFILW4WoVHQW8eFg9xkbX64gK0ZqDnJbCYUc-Fx2mTWXQG9kdV-cuAOord-4alTi-u9-2axy0D0KRwRolI0IiAohjQ1KQ8kh48V1BLyWs6QoM06vq8NQocry-uoo8Nw2MWzI0n6d2DNvs7xJv3YObMI_Id960RSPxCDXlwt4Ryg4suoycif9DQNaV";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// ---------------------------------------------------------------------------
// Static design data. Mirrors the Stitch dump verbatim so design review
// matches 1:1. Swap to real series/records when the Overview screen is
// wired to ehr_service / wearable_sync_service.
// ---------------------------------------------------------------------------

const TREND_RANGES = ["7D", "1M", "3M", "1Y"] as const;
type TrendRange = (typeof TREND_RANGES)[number];

/**
 * Re-typed onto the SHARED VitalStatCard's vocabulary (Figma 211:241).
 *
 * `tint` is GONE, and that is the substantive change on this screen. It was a
 * raw hex per metric, driving both the glyph and the chart bars, and it was
 * decoration rather than state: Heart Rate was `#ba1a1a`, which is
 * `color/error` — so an IN-RANGE heart rate rendered in the app's
 * out-of-range colour. docs/BRAND.md is explicit that everything but teal
 * "exists to communicate state, not to decorate", and VitalStatCard accepts no
 * colour prop at all by design, so a literal cannot re-enter through this
 * screen. `tone` carries clinical state now; the sparkline takes `primary`.
 *
 * FLAGGED: four differently-coloured mini charts therefore become one colour.
 * That is a deliberate visual change to this card and wants a designer nod —
 * but the red heart rate was a miscommunication, not a preference.
 *
 * `icon` moves from the generic MaterialIcons set to Health Icons, which
 * docs/BRAND.md makes the project's set for anything clinical ("favorite" for a
 * heart rate and "bloodtype" for blood pressure were the platform set standing
 * in for real clinical glyphs).
 *
 * FLAGGED: `HEALTH_ICONS` has no water/hydration glyph, so Hydration ships with
 * no chip glyph rather than borrowing an unrelated one ("a heart under Community
 * is a bug, not a style choice"). registry.ts is not this change's file; add a
 * `hydration` entry there and pass it here — nothing else moves.
 */
interface TrendMetric {
  label: string;
  value: string;
  unit: string;
  /** Optional: see the FLAG above about the missing hydration glyph. */
  icon?: HealthIconName;
  bars: number[]; // 0..100 heights
}

const TREND_METRICS: TrendMetric[] = [
  {
    label: "Heart Rate",
    value: "72",
    unit: "bpm",
    icon: "heart-rate",
    bars: [60, 45, 80, 55, 90, 70, 65],
  },
  {
    label: "Blood Pressure",
    value: "118",
    unit: "/76",
    icon: "blood-pressure",
    bars: [40, 35, 50, 45, 30, 35, 40],
  },
  {
    label: "Sleep",
    value: "7.2",
    unit: "hrs",
    icon: "sleep",
    bars: [70, 85, 40, 95, 80, 85, 90],
  },
  {
    label: "Hydration",
    value: "1.8",
    unit: "L",
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
    // Was "Dr. Jenkins" — see the CLINICIAN NAMES note below.
    body: "Follow-up with Dr. Adjoa Boateng. Heart rate variability improving.",
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
  {
    name: "Oura Ring Gen 3",
    syncedAgo: "Last synced: 45m ago",
    icon: "brightness-5",
    swatch: "#1e293b",
  },
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

// ---------------------------------------------------------------------------
// CLINICIAN NAMES — corrected to the seeded roster, and why that had to happen
// in this change
// ---------------------------------------------------------------------------
// These entries read "Dr. Sarah Jenkins" and "Dr. Mark Chen", and the Cardiology
// milestone above cited "Dr. Jenkins". None of the three exists: the seeded
// roster (scripts/seed_dev_data.py) is Kwabena Osei (General Practice), Adjoa
// Boateng (Cardiology), Yaw Darko (Dermatology), Efua Asante (Paediatrics), Nii
// Tetteh (Mental Health) and Abena Owusu (Nutrition & Dietetics). Find Care lists
// those six, so any other name reads as a bug to a tester — and
// ActiveScriptViewScreen had already made exactly this correction to its own
// prescriber fallback.
//
// It could not be deferred past the download work. This screen's data is now
// WRITTEN TO A FILE the user keeps and may forward to a pharmacy or a clinician,
// and a fabricated prescriber inside a persisted medical record is a different
// class of defect from a fabricated one on a throwaway screen. The names also
// travel onward as route params into the two script screens, so leaving them
// would have re-seeded the invented cardiologist that screen deleted.
//
// Assignment follows specialty, not alphabet: Lisinopril for hypertension is
// Cardiology -> Adjoa Boateng (the same doctor ActiveScriptViewScreen falls back
// to, so the two screens now agree instead of showing two prescribers for one
// script), and the "GP" script is General Practice -> Kwabena Osei.
//
// FLAGGED, deliberately unchanged: `patient` is "Alex Rivers", where the seeded
// patient is Ama Mensah. It is one identity threaded through router params into
// several screens — including files owned by other agents in this pass — so
// correcting it is its own change, not a rider on this one.
// ---------------------------------------------------------------------------

const SCRIPTS: Script[] = [
  {
    prescriber: "Dr. Adjoa Boateng",
    meta: "Cardiology • Oct 12",
    drug: "Lisinopril 10mg",
    patient: "Alex Rivers",
    scriptId: "#8829-X",
    issuedDate: "Oct 12, 2023",
  },
  {
    prescriber: "Dr. Kwabena Osei",
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

/**
 * The toast's offset, derived like the one on the script screens but against a
 * different obstruction: PatientShell renders BottomNav as an `absolute bottom-0`
 * overlay 80px tall (8 + 48 + 24, per BottomNav.tsx), so 110 puts the chip 30
 * above the bar's top edge. 30 alone would park it behind the tabs.
 */
const TOAST_BOTTOM = 110;

export function OverviewScreen() {
  const [range, setRange] = useState<TrendRange>("7D");
  const { message: toastMessage, tone: toastTone, show: showToast, clear: clearToast } = useToast();
  const [saving, setSaving] = useState(false);

  // The glyph and label ON the filled Report button. It was `#ffffff` / the
  // `text-white` utility — a frozen literal that docs/BRAND.md forbids, and the
  // wrong one in principle: content on a `primary` fill is `on-primary`, which is
  // what tones correctly if the fill ever changes.
  //
  // FLAGGED: this screen still holds ~10 other raw hexes (`#00685f` in five
  // places, `#e4e9e7`, `#dee4e1`, the milestone/device tints, two rgba() teals).
  // They are outside a download fix and are left for the token sweep that has
  // already been through this file's cards — only the line this change touched is
  // corrected, rather than leaving a fresh literal behind.
  const onPrimary = useTokenColor("on-primary");

  const onDownloadReport = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Only this screen's own content, and only the parts that carry a unit or a
      // label. The sparkline `bars` arrays are omitted on purpose: they are static
      // design heights with no dates and no units, and a column of bare numbers
      // under a "Latest vitals" heading would be read as measurements.
      const body = buildHealthReportDocument({
        range,
        metrics: TREND_METRICS.map((m) => ({ label: m.label, value: m.value, unit: m.unit })),
        doses: MED_DOSES,
        milestones: MILESTONES.map((m) => ({ date: m.date, title: m.title, body: m.body })),
        devices: DEVICES.map((d) => ({ name: d.name, syncedAgo: d.syncedAgo })),
        generatedAt: formatDocumentTimestamp(),
      });
      const result = await saveTextDocument({
        fileName: healthReportFileName({ range }),
        body,
        dialogTitle: "Save or send your health report",
      });
      const { tone, message } = describeSaveResult(result);
      showToast(tone, message);
    } finally {
      setSaving(false);
    }
  }, [saving, range, showToast]);

  return (
    <PatientShell
      activeTab="overview"
      avatarUri={PROFILE_PHOTO_URI}
      avatarLabel="Your profile photo"
      // No `onTabPress`: PatientShell owns the tab map now. The switch that was
      // here handled three of five — `inbox` fell through and did nothing — and
      // sent Home through `router.back()`, which is not "go to Home", it is "go
      // to whatever pushed me". See PatientShell.tsx.
    >
      {/* `paddingBottom: 140` is UNCHANGED and must stay. PatientShell renders
          BottomNav as an `absolute bottom-0` overlay (see the LAYOUT NOTE at the
          head of PatientShell.tsx), so the bar still occupies no layout space and
          this screen still owes it the reserve. Adopting the shell neither adds
          nor removes flow height at the bottom. */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* The bar's centred "Health Hub" title, relocated. PatientAppBar has a
            logo in that slot and no title prop, so the page heading lives in the
            body — same call InboxScreen made. Type and colour are the bar's
            unchanged. */}
        <Text className="mt-md font-headline-md text-headline-md text-primary">Health Hub</Text>

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
              <Text className="mb-xs font-label-md text-label-md text-primary">Health Insight</Text>
              <Text className="font-body-md text-body-md text-on-surface">
                Your sleep quality improved by <Text className="font-bold text-primary">12%</Text>{" "}
                after starting your new medication routine. Consistency is key!
              </Text>
            </View>
          </View>
        </View>

        {/* Quick actions */}
        <View className="mt-md flex-row gap-sm">
          <Pressable
            accessibilityRole="button"
            // The label names the format, because the button text can't: "Report"
            // is one word in a two-up row. See the DOWNLOAD REPORT note at the head
            // of this file for why it is .txt and not PDF.
            accessibilityLabel="Download your health report as a text file"
            accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving}
            onPress={onDownloadReport}
            // Shadow deleted. This is a filled button in a two-up row, not a
            // floating surface — and its sibling "Export" never had one, so
            // the pair read as two different elevation languages side by
            // side. Neither has one now.
            className="flex-1 flex-row items-center justify-center gap-xs rounded-xl bg-primary py-md active:scale-[0.98]"
            style={{ opacity: saving ? 0.6 : 1 }}
          >
            <MaterialIcons name="download" size={20} color={onPrimary} />
            <Text className="font-label-md text-label-md text-on-primary">
              {saving ? "Saving…" : "Report"}
            </Text>
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
            {/* The SHARED VitalStatCard (Figma 211:241) — the local `MetricTile`
                  is deleted. The sparkline goes in the component's `footer` slot,
                  which is exactly why that slot is a slot and not a `chart` prop:
                  MiniChart never becomes a dependency of a primitive. */}
            {TREND_METRICS.map((m) => (
              <View key={m.label} style={{ width: "50%", paddingHorizontal: 6, marginBottom: 12 }}>
                <VitalStatCard
                  label={m.label}
                  value={m.value}
                  unit={m.unit}
                  icon={m.icon}
                  footer={<MiniChart bars={m.bars} />}
                />
              </View>
            ))}
          </View>
        </Card>

        {/* Clinical milestones */}
        <Card className="mt-md">
          <Text className="mb-md font-headline-md text-on-surface" style={{ fontSize: 20 }}>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View active medications"
              onPress={() => router.push("/(app)/active-medications" as Href)}
              className="min-h-11 justify-center rounded-md px-2 active:opacity-70"
            >
              <Text className="font-label-md text-label-md text-primary">View all</Text>
            </Pressable>
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

      {/* Download outcome. PatientShell wraps its children in a `flex-1` View, so
          this absolutely-positioned sibling anchors to that box — see TOAST_BOTTOM
          for the clearance over the floating BottomNav. */}
      <Toast
        message={toastMessage}
        tone={toastTone}
        onDismiss={clearToast}
        bottom={TOAST_BOTTOM}
      />
    </PatientShell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// The local `Card` is gone — all five call sites now render the SHARED `Card`
// from "@/components/ui", imported under the same name so no call site changed.
// It was a hand-rolled bordered View carrying `style={cardShadow}`, which is
// exactly the drift docs/BRAND.md §Elevation exists to stop. Adopting the
// primitive also corrects three things the local copy had wrong:
//   - `rounded-2xl` (16) -> `rounded-card` (24), BRAND's card radius.
//   - `bg-surface-container-lowest` -> the `card-surface` ROLE, which is why
//     the local card RECEDED in dark mode (lowest resolves darker than the page).
//   - the shadow can no longer come back through `style` — the primitive strips
//     elevation keys.
// Inset (`p-md`, 24) and the full-strength `outline-variant` hairline are
// unchanged.

// The local `MetricTile` is gone — it is the shared VitalStatCard now
// (Figma 211:241). What it took with it: the value at `fontSize: 22` (the ramp
// has no 22 step; 211:247 is `headline-lg` 24), label-above-value slot order
// (211:241 fixes label -> value -> trend, and this screen and
// PatientProfileOverviewScreen had disagreed about it), a `p-sm` 12px inset off
// the frame's 16, and the four `tint` hexes documented on TREND_METRICS above.
//
// Fixed-height bar strip. Each bar is `height%` of the 40px track at 30%
// opacity, matching the CSS `.chart-bar { opacity: 0.3 }` it came from.
//
// `tint` is no longer a parameter: the colour is `primary`, resolved BY TOKEN
// NAME for the current mode. The four per-metric hexes it replaced were frozen
// light-mode values and one of them was `color/error` on an in-range reading.
function MiniChart({ bars }: { bars: number[] }) {
  const tint = useTokenColor("primary");
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
        <Text className="mt-xs font-label-md text-label-md text-on-surface">{milestone.title}</Text>
        <Text
          className="mt-xs font-body-md text-body-md text-on-surface-variant"
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
// Shadows — deleted, both of them.
// ---------------------------------------------------------------------------
// `cardShadow` was a slate-grey `0 4px 20px` on cards and one button;
// `appBarShadow` a black `0 2px 8px` on the top bar. Neither exists as a Figma
// effect or a token, and docs/BRAND.md §Elevation is explicit that cards and
// bars separate by surface tone plus a hairline. Nothing on this screen floats,
// so nothing here keeps a blur. Leaving the constants behind with no callers is
// how the next reader concludes the sweep was abandoned halfway.
//
// The bar `appBarShadow` was attached to no longer exists here at all — it is
// PatientShell's PatientAppBar now, which forbids an effect structurally.
