// Medication tracker — the day's doses as a timeline.
//
// Frame: UI_screens/Patient_facing_screens/advanced_medication_timeline_tracker.
// That folder supersedes `medication_tracker_1` and `medication_tracker_2`, which
// are earlier passes at THIS screen (a Morning/Afternoon/Evening list and a
// "Daily Progress + PRN" list respectively), not separate destinations. One
// screen is built, from the latest pass.
//
// ===========================================================================
// SAMPLE DATA. THERE IS NO MEDICATION ENDPOINT AND NO DOSE HISTORY ENDPOINT.
// ===========================================================================
// Same position as ActiveMedicationsScreen, and for the same reason — read its
// header. The doses come from ./schedule-sample-data.ts, reference the drugs
// already in ./sample-data.ts, and are labelled by the shared `SAMPLE_NOTICE` in
// a callout above the grid.
//
// ===========================================================================
// THE DOSE MARKERS ARE NOT BUTTONS. THIS IS THE "REQUEST REFILL" RULE.
// ===========================================================================
// The frame draws tappable-looking check circles and a "+" affordance, which
// reads as tap-to-mark-taken. Building that would produce a control that flips a
// `useState`, shows a tick, records nothing, notifies nobody, and forgets the
// whole thing on navigate — which is precisely the "Request refill" control
// ActiveMedicationsScreen deleted, and for a more dangerous datum: a patient who
// ticks a dose and later checks whether they took it would be reading their own
// unsaved tap back as a clinical fact.
//
// So the markers RENDER status and do not accept touch. When a dose-logging
// endpoint exists they become Pressables and this comment goes with them.
//
// ===========================================================================
// ONLY TODAY IS SELECTABLE, AND THE OTHER DAYS SAY SO
// ===========================================================================
// The frame's day strip implies a week of history. There is none. The two ways to
// fake it are both worse than admitting it: repeating today's four doses under
// every date invents a week the patient never had, and deriving plausible
// statuses from each date's distance from today invents an adherence record —
// which is the one number on this screen a clinician might act on.
//
// Non-today pills are therefore `unavailable`, which `DatePill` renders dashed,
// announces as ", unavailable", and — the part that matters — sets
// `disabled` on. There is no dead onPress behind them.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Button, Card, DatePill, Icon, InfoCallout, SectionHeader } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { SAMPLE_MEDICATIONS, SAMPLE_NOTICE } from "./sample-data";
import { buildSampleDaySchedule, SAMPLE_NOW_MINUTE } from "./schedule-sample-data";
import {
  adherenceOf,
  dayStrip,
  dosesByMedication,
  doseTimesOf,
  formatMinuteOfDay,
  localDateKey,
  type DaySchedule,
  type DoseStatus,
  type ScheduledDose,
  type StripDay,
} from "./schedule";
import type { ActiveMedication } from "./types";

/** Left gutter holding the drug name. Fixed so every row's columns line up. */
const NAME_COLUMN_WIDTH = 120;
/** One time column. Wide enough for a 44pt marker plus breathing room. */
const TIME_COLUMN_WIDTH = 72;

export function MedicationTrackerScreen() {
  // One clock read, at mount. `useMemo` with an empty dep list rather than a
  // module constant: a module-level `new Date()` is evaluated at import and would
  // pin the strip to whenever the bundle was first loaded, which on a
  // long-running app is yesterday.
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => localDateKey(today), [today]);
  const days = useMemo(() => dayStrip(today), [today]);

  // Held even though only one value is reachable today, because it is the seam:
  // when dose history ships, `unavailable` comes off the other pills and this
  // already carries the selection.
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const schedule = useMemo(() => buildSampleDaySchedule(selectedDate), [selectedDate]);

  return (
    <MedicationTracker
      days={days}
      todayKey={todayKey}
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      schedule={schedule}
      medications={SAMPLE_MEDICATIONS}
      nowMinute={SAMPLE_NOW_MINUTE}
      sample
    />
  );
}

export type MedicationTrackerProps = {
  days: readonly StripDay[];
  todayKey: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  schedule: DaySchedule;
  medications: readonly ActiveMedication[];
  /**
   * Where the "now" line sits, in minutes from midnight, or `undefined` to draw
   * no line — which is what a day that is not today must pass. A now-line on a
   * past or future date is a claim about a time that is not happening.
   */
  nowMinute?: number;
  sample: boolean;
};

/**
 * The tracker, as a function of its props and nothing else.
 *
 * Split from the screen for the same reason `MedicationsList` is: every branch —
 * no doses, no adherence yet, sample vs real — is then reachable in a test
 * without a fake clock and without a URL parameter.
 */
export function MedicationTracker({
  days,
  todayKey,
  selectedDate,
  onSelectDate,
  schedule,
  medications,
  nowMinute,
  sample,
}: MedicationTrackerProps) {
  const rows = useMemo(() => dosesByMedication(schedule, medications), [schedule, medications]);
  const times = useMemo(() => doseTimesOf(schedule), [schedule]);
  const adherence = useMemo(() => adherenceOf(schedule), [schedule]);

  return (
    <DetailShell
      title="Medication tracker"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/active-medications" as Href);
      }}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {sample ? (
          <View className="mb-4">
            <InfoCallout tone="error" testID="tracker-sample-notice">
              {`${SAMPLE_NOTICE} The doses below are the same for every account, and no dose history has been loaded.`}
            </InfoCallout>
          </View>
        ) : null}

        <AdherenceCard adherence={adherence} />

        <View className="mt-6">
          <SectionHeader title="Schedule" icon="calendar" testID="tracker-schedule-header" />
        </View>
        <DayStrip
          days={days}
          todayKey={todayKey}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />

        <View className="mt-4">
          <DoseGrid rows={rows} times={times} nowMinute={nowMinute} />
        </View>

        <DoseKey />

        {/* The frame's "Add New Medication". Wired now that the flow exists —
            expo-camera was added for it, so the viewfinder is real. What the flow
            still cannot do is write to the medication record; AddMedicationScreen
            says so at the top and ends in a share rather than a save, so this
            button leads somewhere honest rather than to an Alert apologising. */}
        <View className="mt-6">
          <Button
            label="Add new medication"
            leadingIcon="add"
            onPress={() => router.push("/(app)/add-medication" as Href)}
            testID="tracker-add-medication"
          />
        </View>

        {/* The frame's "Manage Prescriptions & Refills". Wired now that
            PrescriptionHistoryScreen exists — it was held back rather than
            shipped as a link to a route that did not resolve. */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Manage prescriptions and refills"
          onPress={() => router.push("/(app)/prescription-history" as Href)}
          className="mt-6 min-h-11 items-center justify-center rounded-md border border-outline-variant px-4 active:opacity-70"
          testID="tracker-manage-prescriptions"
        >
          <Text className="font-label-md text-label-md text-primary">
            Manage prescriptions &amp; refills
          </Text>
        </Pressable>
      </ScrollView>
    </DetailShell>
  );
}

/**
 * The headline figure — or no figure at all.
 *
 * `adherence === undefined` means no dose has fallen due yet (see
 * `adherenceOf`). The card then states that, rather than rendering "0%", which
 * at 6am would reproach a patient who has missed nothing.
 */
function AdherenceCard({ adherence }: { adherence: number | undefined }) {
  const primary = useTokenColor("primary");

  return (
    <Card className="p-4" testID="tracker-adherence">
      <View className="flex-row items-start gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-md bg-primary-tint">
          <Icon name="pills" size={24} color={primary} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-headline-md text-headline-md text-on-surface">Daily adherence</Text>
          {adherence === undefined ? (
            <Text className="mt-1 font-body-md text-body-md text-on-surface-variant">
              No doses are due yet today, so there is nothing to report.
            </Text>
          ) : (
            <>
              <Text className="mt-1 font-headline-xl text-headline-xl text-on-surface">
                {adherence}%
              </Text>
              <Text className="mt-1 font-body-md text-body-md text-on-surface-variant">
                of the doses due so far today have been taken.
              </Text>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

function DayStrip({
  days,
  todayKey,
  selectedDate,
  onSelectDate,
}: {
  days: readonly StripDay[];
  todayKey: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
      accessibilityLabel="Select a day"
      testID="tracker-day-strip"
    >
      {days.map((day) => {
        // Everything except today. See the header: there is no dose history, and
        // `unavailable` is what makes that a disabled control rather than a
        // pill with a dead handler behind it.
        const unavailable = day.date !== todayKey;
        return (
          <DatePill
            key={day.date}
            day={day.weekdayLabel}
            date={day.dayLabel}
            month={day.monthLabel}
            selected={day.date === selectedDate}
            unavailable={unavailable}
            onPress={() => onSelectDate(day.date)}
            testID={`tracker-day-${day.date}`}
          />
        );
      })}
    </ScrollView>
  );
}

/**
 * Medications down the side, dose times across the top.
 *
 * Horizontally scrollable because the column count is the number of DISTINCT
 * dose times, which is data — a four-times-a-day regimen must not push its last
 * marker off the edge, which is what the frame's fixed 06/08/10/12 header would
 * do.
 */
function DoseGrid({
  rows,
  times,
  nowMinute,
}: {
  rows: readonly { medication: ActiveMedication; doses: readonly ScheduledDose[] }[];
  times: readonly number[];
  nowMinute: number | undefined;
}) {
  if (times.length === 0) {
    return (
      <Card className="p-4" testID="tracker-grid-empty">
        <Text className="font-body-md text-body-md text-on-surface-variant">
          No doses are scheduled on this day.
        </Text>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0" testID="tracker-grid">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Column header: the times. */}
          <View className="flex-row border-b border-outline-variant">
            <View style={{ width: NAME_COLUMN_WIDTH }} />
            {times.map((time) => (
              <View
                key={time}
                style={{ width: TIME_COLUMN_WIDTH }}
                className="items-center justify-center py-3"
              >
                <Text className="font-label-sm text-label-sm text-on-surface-variant">
                  {formatMinuteOfDay(time)}
                </Text>
              </View>
            ))}
          </View>

          {rows.map(({ medication, doses }) => (
            <View
              key={medication.id}
              className="flex-row border-b border-outline-variant"
              testID={`tracker-row-${medication.id}`}
            >
              <View
                style={{ width: NAME_COLUMN_WIDTH }}
                className="justify-center border-r border-outline-variant px-3 py-4"
              >
                <Text
                  className="font-label-md text-label-md text-on-surface"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {medication.name}
                </Text>
                <Text
                  className="mt-0.5 font-label-sm text-label-sm text-on-surface-variant"
                  numberOfLines={1}
                >
                  {medication.formAndStrength}
                </Text>
              </View>

              {times.map((time) => {
                const dose = doses.find((candidate) => candidate.minuteOfDay === time);
                return (
                  <View
                    key={time}
                    style={{ width: TIME_COLUMN_WIDTH }}
                    className="items-center justify-center py-4"
                  >
                    {dose ? (
                      <DoseMarker
                        status={dose.status}
                        medicationName={medication.name}
                        time={formatMinuteOfDay(time)}
                        testID={`dose-${dose.id}`}
                      />
                    ) : (
                      // Deliberately empty and unlabelled. "No dose at 13:00"
                      // announced on every gap would bury the doses that exist
                      // under a screenful of absences.
                      <View className="h-1 w-1 rounded-full bg-outline-variant" />
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {nowMinute !== undefined ? <NowFootnote nowMinute={nowMinute} /> : null}
    </Card>
  );
}

const MARKER: Record<DoseStatus, { container: string; icon: "check" | "close" | "schedule"; word: string }> =
  {
    taken: { container: "bg-primary", icon: "check", word: "taken" },
    missed: { container: "bg-error-container", icon: "close", word: "missed" },
    // Outlined, not filled: an upcoming dose has no outcome, and a filled
    // neutral circle reads as a third outcome rather than as the absence of one.
    upcoming: { container: "border border-outline-variant", icon: "schedule", word: "still to come" },
  };

/**
 * A dose's status. NOT a Pressable — see the header.
 *
 * The glyph carries the meaning alongside the tint so the three states are
 * distinguishable without colour vision, and the accessibility label spells the
 * status in words because a tick and a cross are the same shape to a screen
 * reader.
 */
function DoseMarker({
  status,
  medicationName,
  time,
  testID,
}: {
  status: DoseStatus;
  medicationName: string;
  time: string;
  testID: string;
}) {
  const spec = MARKER[status];
  const onPrimary = useTokenColor("on-primary");
  const onErrorContainer = useTokenColor("on-error-container");
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const color =
    status === "taken" ? onPrimary : status === "missed" ? onErrorContainer : onSurfaceVariant;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${medicationName} at ${time}: ${spec.word}`}
      testID={testID}
      className={`h-11 w-11 items-center justify-center rounded-full ${spec.container}`}
    >
      <Icon chrome={spec.icon} size={20} color={color} />
    </View>
  );
}

/**
 * The frame draws a vertical "now" line through the grid. A line positioned by
 * absolute offset inside a horizontally scrolling grid has to track the scroll
 * to stay over the right column, and gets it wrong at every other viewport — so
 * the same fact is stated in words instead, where it cannot drift out of
 * alignment.
 */
function NowFootnote({ nowMinute }: { nowMinute: number }) {
  return (
    <View className="border-t border-outline-variant px-3 py-2">
      <Text className="font-label-sm text-label-sm text-on-surface-variant">
        {`As of ${formatMinuteOfDay(nowMinute)}`}
      </Text>
    </View>
  );
}

/** Names the three marker states, because a tint plus a glyph still needs a key. */
function DoseKey() {
  return (
    <View className="mt-4 flex-row flex-wrap gap-x-4 gap-y-2" testID="tracker-key">
      {(["taken", "missed", "upcoming"] as const).map((status) => (
        <View key={status} className="flex-row items-center gap-2">
          <View
            className={`h-3 w-3 rounded-full ${
              status === "taken"
                ? "bg-primary"
                : status === "missed"
                  ? "bg-error-container"
                  : "border border-outline-variant"
            }`}
          />
          <Text className="font-label-sm text-label-sm text-on-surface-variant">
            {MARKER[status].word}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Both footer controls from the frame are now wired, to destinations that exist.
//
// The one thing still missing under "Add new medication" is PERSISTENCE. The
// camera is real (expo-camera was added for it) but there is no medication
// endpoint, so that flow ends in a share rather than a save — see the header of
// AddMedicationScreen. This button is honest only because that screen states the
// limitation itself; if that notice is ever removed without an endpoint behind it,
// this becomes the "Add a medication" control ActiveMedicationsScreen deleted
// twice.
