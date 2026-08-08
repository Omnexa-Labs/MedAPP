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
//   - Material Symbols icon names map to @expo/vector-icons
//     MaterialIcons kebab-case (monitor_heart → monitor-heart).
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
// FLAGGED: PatientAppBar has no title slot — Figma 741:887 has a logo where
// this screen had "Health Hub", and BRAND §Logo rules forbid re-typesetting the
// mark. The string is NOT dropped: it moves into the scrollable body as the page
// heading, which is the same relocation InboxScreen made for "Messages".
//
// ============================================================================
// THE FABRICATED HEALTH DATA IS GONE (2026-08-08)
// ============================================================================
// This screen used to render a full patient record that no service had ever
// returned, and the shape of the defect was a single destructure:
//
//     const { data: summary } = useQuery({ … });
//
// `summary` is `undefined` while the request is in flight, `undefined` when it
// FAILS, and `undefined` when the account genuinely has no readings — so all
// three collapsed into one branch, and that branch drew `TREND_METRICS`: blood
// pressure 118/76, heart rate 72bpm, 7.2h of sleep, and a week of sparklines.
// A patient opening the app during a backend outage was shown confident, wrong
// numbers, and the "Report" button would then write them to a file they could
// forward to a clinician.
//
// The three states are now separated (`isPending` / `isError` / empty) and the
// fallback is DELETED rather than relabelled — there is no honest way to render
// a placeholder reading on a vitals card, because a placeholder reading is
// indistinguishable from a real one at the moment it matters.
//
// Deleted with it, all of it constant data presented as this user's record:
//   * PROFILE_PHOTO_URI — a remote photograph of a stranger, shown as EVERY
//     signed-in user's avatar. The shell already resolves photo → initials →
//     silhouette from the auth store; it now gets the real user.
//   * MED_DOSES — "Lisinopril 10mg 08:00 taken / Atorvastatin 20mg 09:00 PM not
//     taken", a named regimen with an adherence state, fed into the export.
//   * MILESTONES — "Started Lisinopril 10mg morning routine. BP stabilized to
//     120/80 within 7 days", a clinical narrative attributed to the patient.
//   * DEVICES — "Apple Watch Ultra, last synced 2m ago", a sync claim for
//     hardware that was never paired.
//   * SCRIPTS — two active prescriptions with prescriber, drug and issue date.
//     `pms_service` is not wired (docs/api/README.md) and nothing in the product
//     returns a prescription, so these were the only two that existed. They also
//     carried the invented patient "Alex Rivers" onward into the two script
//     screens as route params, which is where the fabrication SPREAD.
//   * the "Health Insight" card — "Your sleep quality improved by 12% after
//     starting your new medication routine", literal JSX with no analysis, no
//     sleep source and no medication behind it.
//   * the "Export" quick action, which had no `onPress` and never had one.
// All recorded in docs/api/README.md's gap register.
//
// ============================================================================
// THE SPARKLINES ARE REAL NOW, AND THE RANGE CONTROL DOES SOMETHING
// ============================================================================
// `bars` used to be overwritten with a static seven-value array even when the
// READING was live, so the chart under a real number was still fake. `api.ts`
// has had `listVitals()` — `GET /{userId}/vitals`, the timeline — written and
// unused since the client was built; it is wired here, filtered by the selected
// 7D/1M/3M/1Y window, and a metric with fewer than two readings in that window
// simply renders no chart. Two consequences worth knowing:
//   - `value` is a STRING on the wire and blood pressure arrives as "122/80",
//     which is not a number. Those readings get no sparkline rather than a
//     silent systolic-only chart labelled "Blood Pressure".
//   - the range control was previously local state that nothing read; it now
//     re-derives the series, so 1Y and 7D differ.
//
// ============================================================================
// DOWNLOAD REPORT — the button had no `onPress` at all
// ============================================================================
// "Report" was a filled primary CTA wired to nothing. It now writes this
// screen's own content to a real text file and hands it to the OS share sheet
// (see @/lib/documents for the SDK 55 expo-file-system facts and the failure
// paths). It is a .txt and not a PDF because this project has no PDF generator
// and `expo-print` is not a dependency; the accessible label says so.
//
// It is DISABLED when there are no readings. An empty report is not a report,
// and the previous version's file was mostly fabrication anyway — doses,
// milestones and devices are no longer passed to the builder at all.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ehrApi, type Vital } from "./api";
import { Pressable, ScrollView, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import {
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  SkeletonCard,
  VitalStatCard,
  type HealthIconName,
} from "@/components/ui";
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

// ---------------------------------------------------------------------------
// Trend window
// ---------------------------------------------------------------------------

const TREND_RANGES = ["7D", "1M", "3M", "1Y"] as const;
type TrendRange = (typeof TREND_RANGES)[number];

/** How far back each segment reaches. Days, because the wire has no period. */
const RANGE_DAYS: Record<TrendRange, number> = { "7D": 7, "1M": 30, "3M": 90, "1Y": 365 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** The sparkline draws at most this many points, most recent last. */
const MAX_BARS = 7;

/**
 * Re-typed onto the SHARED VitalStatCard's vocabulary (Figma 211:241).
 *
 * `tint` is GONE, and that was the substantive change when this card was
 * adopted. It was a raw hex per metric, driving both the glyph and the chart
 * bars, and it was decoration rather than state: Heart Rate was `#ba1a1a`,
 * which is `color/error` — so an IN-RANGE heart rate rendered in the app's
 * out-of-range colour. docs/BRAND.md is explicit that everything but teal
 * "exists to communicate state, not to decorate", and VitalStatCard accepts no
 * colour prop at all by design, so a literal cannot re-enter through this
 * screen.
 *
 * `icon` comes from Health Icons, which docs/BRAND.md makes the project's set
 * for anything clinical.
 */
interface TrendMetric {
  label: string;
  value: string;
  unit: string;
  icon?: HealthIconName;
  /**
   * Sparkline heights, 0..100, or `null` for "this reading has no chartable
   * series in the selected window". Null draws NO chart — see `barsFor`.
   */
  bars: number[] | null;
}

/**
 * Map a live `Vital` onto the card this screen draws.
 *
 * `kind` is FREE TEXT on the wire (`max_length=64`), not an enum, so this
 * matches loosely and falls back to the raw kind as the label rather than
 * dropping a reading it does not recognise — a vital the UI cannot name is
 * still a vital the patient recorded.
 */
function vitalToMetric(v: Vital, bars: number[] | null): TrendMetric {
  const k = v.kind.toLowerCase();
  const known: Record<string, { label: string; icon: TrendMetric["icon"] }> = {
    heart_rate: { label: "Heart Rate", icon: "heart-rate" },
    heartrate: { label: "Heart Rate", icon: "heart-rate" },
    blood_pressure: { label: "Blood Pressure", icon: "blood-pressure" },
    bloodpressure: { label: "Blood Pressure", icon: "blood-pressure" },
  };
  const meta = known[k] ?? { label: v.kind, icon: "heart-rate" as TrendMetric["icon"] };
  return {
    label: meta.label,
    // `value` is a STRING on the wire ("122/80") — never parsed as a number.
    value: v.value,
    unit: v.unit ?? "",
    icon: meta.icon,
    bars,
  };
}

/**
 * A reading's numeric value, or null.
 *
 * DELIBERATELY strict. "122/80" is a real and common `value`, and
 * `parseFloat` would happily return 122 — a chart of systolic pressure only,
 * drawn under a label that says "Blood Pressure" and a value that says
 * "122/80". Anything that is not a plain number gets no chart at all.
 */
function numericValue(value: string): number | null {
  const trimmed = value.trim();
  return /^-?\d+(?:\.\d+)?$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * The sparkline for one `kind`, derived from the vitals TIMELINE.
 *
 * Returns null — meaning "draw nothing" — rather than a flat or invented
 * series, in three cases: no numeric readings, fewer than two of them (one dot
 * is not a trend), or a maximum of zero (nothing to scale against). Heights are
 * a proportion of the window's largest reading, floored at 8 so a genuinely
 * small value is still visible as a bar rather than reading as a gap.
 */
function barsFor(kind: string, readings: Vital[], range: TrendRange): number[] | null {
  const since = Date.now() - RANGE_DAYS[range] * DAY_MS;
  const points = readings
    .filter((v) => v.kind === kind)
    .map((v) => ({ at: Date.parse(v.recordedAtIso), value: numericValue(v.value) }))
    .filter(
      (p): p is { at: number; value: number } =>
        Number.isFinite(p.at) && p.at >= since && p.value !== null,
    )
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_BARS);

  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.value));
  if (max <= 0) return null;
  return points.map((p) => Math.max(8, Math.round((p.value / max) * 100)));
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
  const currentUser = useCurrentUser();
  const userId = currentUser?.id;

  // `GET /v1/patients/{userId}/summary` — the latest reading per kind. Both PHI
  // routes returned 500 until 2026-08-07 (two stacked bugs — see
  // docs/api/ehr_service.md), which is why this screen was still on static data.
  //
  // `isPending` and `isError` are destructured, not just `data`. That is the
  // whole fix: see the note at the head of this file for what one shared
  // `undefined` was worth.
  const {
    data: summary,
    isPending: summaryPending,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["ehr", "summary", userId],
    queryFn: () => ehrApi.getSummary(userId as string),
    enabled: Boolean(userId),
  });

  // `GET /{userId}/vitals` — the timeline behind the sparklines. A SECOND query
  // rather than a field on the first: the summary carries one reading per kind
  // by design, and a chart needs the series.
  //
  // Its failure is NOT the screen's failure. The numbers come from the summary,
  // so a timeline that does not load costs the charts and nothing else — the
  // cards render without them, which is the same treatment a reading with too
  // few points gets.
  const { data: timeline } = useQuery({
    queryKey: ["ehr", "vitals", userId],
    queryFn: () => ehrApi.listVitals(userId as string),
    enabled: Boolean(userId),
  });

  const metrics = useMemo(() => {
    const latest = summary?.latestVitals ?? [];
    const readings = timeline ?? [];
    return latest.map((v) => vitalToMetric(v, barsFor(v.kind, readings, range)));
  }, [summary, timeline, range]);

  const { message: toastMessage, tone: toastTone, show: showToast, clear: clearToast } = useToast();
  const [saving, setSaving] = useState(false);

  // The glyph and label ON the filled Report button. It was `#ffffff` / the
  // `text-white` utility — a frozen literal that docs/BRAND.md forbids, and the
  // wrong one in principle: content on a `primary` fill is `on-primary`, which is
  // what tones correctly if the fill ever changes.
  const onPrimary = useTokenColor("on-primary");
  const primary = useTokenColor("primary");

  const canDownload = metrics.length > 0 && !saving;

  const onDownloadReport = useCallback(async () => {
    if (saving || metrics.length === 0) return;
    setSaving(true);
    try {
      // ONLY the readings, and only the ones the service returned. `doses`,
      // `milestones` and `devices` are passed empty because this screen no
      // longer has any — the builder drops a section with no lines, so the file
      // is shorter rather than padded (see lib/documents/builders.ts).
      //
      // The sparkline heights are omitted too: they are proportions of a
      // window's maximum, not measurements, and a column of bare numbers under
      // a "Latest vitals" heading would be read as readings.
      const body = buildHealthReportDocument({
        range,
        metrics: metrics.map((m) => ({ label: m.label, value: m.value, unit: m.unit })),
        doses: [],
        milestones: [],
        devices: [],
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
  }, [saving, range, showToast, metrics]);

  return (
    <PatientShell
      activeTab="overview"
      // The signed-in user, where a hardcoded photograph of a stranger used to
      // be. PatientAppBar falls back to initials and then a silhouette, so an
      // account with no photo is simply an account with no photo.
      avatarUri={currentUser?.avatarUrl}
      avatarInitials={currentUser?.displayName?.trim()[0]}
      avatarLabel={currentUser?.displayName ?? "Your profile"}
    >
      {/* `paddingBottom: 140` is UNCHANGED and must stay. PatientShell renders
          BottomNav as an `absolute bottom-0` overlay (see the LAYOUT NOTE at the
          head of PatientShell.tsx), so the bar still occupies no layout space and
          this screen still owes it the reserve. */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* The bar's centred "Health Hub" title, relocated. PatientAppBar has a
            logo in that slot and no title prop, so the page heading lives in the
            body — same call InboxScreen made. */}
        <Text className="mt-md font-headline-md text-headline-md text-primary">Health Hub</Text>

        {/* Health trends */}
        <Card className="mt-md">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-xs">
              <MaterialIcons name="monitor-heart" size={22} color={primary} />
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
                        active ? "text-on-primary" : "text-on-surface-variant"
                      }`}
                    >
                      {r}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* The three states, separately. Order matters: an error must not be
              reported as "nothing recorded yet", and neither may be drawn while
              the request is still in flight. */}
          {summaryPending ? (
            <VitalsSkeleton />
          ) : summaryError ? (
            <VitalsError retry={() => refetchSummary()} />
          ) : metrics.length === 0 ? (
            <VitalsEmpty />
          ) : (
            <View className="mt-md flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
              {/* The SHARED VitalStatCard (Figma 211:241). The sparkline goes in
                  the component's `footer` slot, which is exactly why that slot is
                  a slot and not a `chart` prop: MiniChart never becomes a
                  dependency of a primitive. */}
              {metrics.map((m) => (
                <View key={m.label} style={{ width: "50%", paddingHorizontal: 6, marginBottom: 12 }}>
                  <VitalStatCard
                    label={m.label}
                    value={m.value}
                    unit={m.unit}
                    icon={m.icon}
                    footer={m.bars ? <MiniChart bars={m.bars} /> : undefined}
                  />
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Download report. One control where there were two — its sibling
            "Export" had no `onPress` and never had one. Disabled with nothing to
            export, rather than writing an empty file under a real-sounding
            name. */}
        <View className="mt-md">
          <Button
            label={saving ? "Saving…" : "Download report (.txt)"}
            // The label names the format because the button text can't say it
            // twice; the accessible name spells out what the file is.
            accessibilityLabel="Download your health report as a text file"
            leadingIcon="download"
            size="docked"
            pill={false}
            shadow={false}
            disabled={!canDownload}
            onPress={onDownloadReport}
          />
          {metrics.length === 0 ? (
            <Text className="mt-xs text-center font-label-sm text-label-sm text-on-surface-variant">
              There are no readings to export yet.
            </Text>
          ) : null}
        </View>
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
// State panels
// ---------------------------------------------------------------------------
//
// These are the SHARED `EmptyState` / `ErrorPanel` / `SkeletonCard` now, not the
// private copies that used to sit here. The copies had drifted in the ways those
// components document: a hardcoded `fontSize: 18` on both headings (the ramp has
// no 18) and skeleton bars on `surface-container-high`, which is the same
// #242B2A as `card-surface` in dark, so the placeholder rendered as blank cards.
//
// `container="inline"` on both panels, NOT the default Card: they render INSIDE
// the Health Trends Card so the 7D/1M/3M/1Y range control survives a failure,
// and a card drawn inside a card is precisely the drift the Inline variant
// exists to prevent.

/** No shimmer — see the note in SkeletonCard for why (one Reanimated consumer). */
function VitalsSkeleton() {
  return (
    <View
      className="mt-md flex-row flex-wrap"
      style={{ marginHorizontal: -6 }}
      accessibilityLabel="Loading your readings"
    >
      {/* SkeletonCard hides ITSELF from assistive tech, so the "Loading…"
          announcement stays on this wrapper — which is also why the two cards are
          rendered per-cell rather than with `count`: the 2-up grid is these 50%
          cells, and `count` returns a fragment with no cell around each card. */}
      {[0, 1].map((i) => (
        <View key={i} style={{ width: "50%", paddingHorizontal: 6, marginBottom: 12 }}>
          <SkeletonCard shape="vital-stat-card" />
        </View>
      ))}
    </View>
  );
}

/**
 * The state the fabricated readings used to occupy.
 *
 * It says the readings could not be loaded and it does not guess at them. The
 * retry is `refetch`, which react-query owns — no manual state to reset, and
 * ErrorPanel's `retry` type is what forces it to be the real request rather than
 * a local flag.
 */
function VitalsError({ retry }: { retry: () => Promise<unknown> }) {
  return (
    <ErrorPanel
      container="inline"
      className="mt-md"
      testID="vitals-error"
      icon="cloud-off"
      title="We couldn't load your readings"
      body="Nothing is shown here rather than something out of date. Check your connection and try again."
      retry={retry}
    />
  );
}

/** A live account with no readings. Distinct from a failure, and it says so. */
function VitalsEmpty() {
  return (
    <EmptyState
      container="inline"
      className="mt-md"
      testID="vitals-empty"
      icon="monitor-heart"
      title="No readings yet"
      body="Vitals recorded by your care team will appear here."
    />
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// The local `Card` is gone — the call sites render the SHARED `Card` from
// "@/components/ui", imported under the same name so no call site changed.
// It was a hand-rolled bordered View carrying `style={cardShadow}`, which is
// exactly the drift docs/BRAND.md §Elevation exists to stop.
//
// The local `MetricTile` is likewise gone — it is the shared VitalStatCard now
// (Figma 211:241). What it took with it: the value at `fontSize: 22` (the ramp
// has no 22 step; 211:247 is `headline-lg` 24), label-above-value slot order,
// a `p-sm` 12px inset off the frame's 16, and four per-metric `tint` hexes.

/**
 * Fixed-height bar strip. Each bar is `height%` of the 40px track at 30%
 * opacity, matching the CSS `.chart-bar { opacity: 0.3 }` it came from.
 *
 * `tint` is not a parameter: the colour is `primary`, resolved BY TOKEN NAME
 * for the current mode. The four per-metric hexes it replaced were frozen
 * light-mode values and one of them was `color/error` on an in-range reading.
 *
 * It is rendered only when there IS a series — the caller passes `undefined`
 * for the footer otherwise, so an empty strip never stands in for a chart.
 */
function MiniChart({ bars }: { bars: number[] }) {
  const tint = useTokenColor("primary");
  return (
    <View
      testID="vital-sparkline"
      style={{ height: 40, flexDirection: "row", alignItems: "flex-end", gap: 2 }}
      // Decorative. The reading itself is the accessible content of the card,
      // and a screen reader announcing seven unlabelled proportions is noise.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
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

// ---------------------------------------------------------------------------
// Shadows — deleted, both of them.
// ---------------------------------------------------------------------------
// `cardShadow` was a slate-grey `0 4px 20px` on cards and one button;
// `appBarShadow` a black `0 2px 8px` on the top bar. Neither exists as a Figma
// effect or a token, and docs/BRAND.md §Elevation is explicit that cards and
// bars separate by surface tone plus a hairline. Nothing on this screen floats,
// so nothing here keeps a blur.
//
// The bar `appBarShadow` was attached to no longer exists here at all — it is
// PatientShell's PatientAppBar now, which forbids an effect structurally.
