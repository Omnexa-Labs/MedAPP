// Medication details — the full record for one medication.
//
// Figma: `medication_details` 828:5944 on page 558:615 (dark proof 828:7564,
// loading 828:7118).
//
// ===========================================================================
// WHERE THE DATA COMES FROM: local mock data. There is NO medication endpoint.
// ===========================================================================
//
// This screen renders `./mock-data.ts` and issues no network request. That is a
// deliberate, evidenced conclusion, not a placeholder left for later — and it is
// stated here because the last time this question went unanswered on this
// project a fabricated `/v1/appointments` shipped past 595 mocked tests and
// every real Confirm 404'd (see features/appointments/api.ts).
//
// What was actually checked, in `backend/`:
//
//   * The gateway maps `/v1/patients` -> ehr_service (api_gateway/app/config.py).
//     ehr_service defines FOUR routes under that prefix
//     (ehr_service/app/routers/records.py): `{id}/records`, `{id}/summary`,
//     `{id}/vitals` (GET + POST) and `{id}/consents`. Its entire schema is
//     PatientRecord / VitalReading / Consent / AccessAudit
//     (ehr_service/app/models/record.py). `PatientBundleOut` is
//     `patient + vitals + consents`. There is no medication or prescription
//     table, column, or field anywhere in the service.
//
//   * `/v1/prescriptions` DOES exist — twice — but neither instance is reachable
//     from this app, and neither is patient-facing:
//       - pms_service/app/routers/prescriptions.py is a pharmacy management
//         system. Its list endpoint takes `status` and `source` filters and NO
//         patient filter at all: it returns every prescription in the pharmacy
//         tenant. Its `customer_id` is a nullable pharmacy customer, not a MedApp
//         user id, and it is gated on `require_roles("pharmacy_admin",
//         "pharmacist", "cashier")` — roles a patient does not hold.
//       - hms_service/app/routers/pharmacy.py is the hospital-side equivalent.
//     Neither `pms_service` nor `hms_service` appears in the gateway's `ROUTES`
//     map, and neither has a `*_service_url` setting for it to appear under. The
//     mobile client cannot address them.
//
// So the honest options were mock data or a fabricated endpoint. This is the
// former. When a patient-scoped medication endpoint ships, this file changes in
// one place — swap the `useMedication` lookup for a query and follow the shape
// of features/appointments/api.ts (a typed adapter module, wire names at the
// module edge, no endpoint literal in the screen). The gap belongs in
// docs/PIPELINE.md §5 alongside the "In Review" status gap.
//
// ---------------------------------------------------------------------------
// FRAME ACCESS — DISCLOSED
// ---------------------------------------------------------------------------
// The Figma MCP server was unauthorized for this session, so 828:5944 could not
// be read (`get_screenshot` / `get_variable_defs` were both unavailable). The
// layout below is therefore assembled from the design-system components the
// booking detail screens already instance for exactly this job — SectionHeader
// outside the card, Card + IconTile + KeyValueRow rows inside it, the same
// composition as ReviewAppointmentScreen 756:4213 — plus the canon values
// supplied with the task. It needs a visual gate against 828:5944 and 828:7564
// before it is called done; nothing here should be treated as frame-verified
// pixel geometry. No value on screen is invented: every one traces to
// mock-data.ts.
//
// ---------------------------------------------------------------------------
// 360dp, NOT 393dp
// ---------------------------------------------------------------------------
// Measured on an Itel S25 Ultra at 360dp — 33dp narrower than the 393dp the
// frames are drawn at. The chain, in dp:
//
//   screen                          360
//   - screen gutter 16 x2         =  32   -> content 328   (393 gives 361)
//   - Card p-md 24 x2             =  48
//   - Card hairline 1 x2          =   2   -> card inner 278 (393 gives 311)
//   - IconTile 40 + gap-4 16      =  56   -> KeyValueRow 222 (393 gives 255)
//
// 255 -> 222 is a 13% loss on the value column, and it changes a wrap:
// "Take 1 tablet with breakfast and dinner." is 40 characters, which at
// `label-sm` 12px Inter Medium (~6.2dp average advance) measures ~250dp. That
// fits 255 on one line and does NOT fit 222 — so the directions row is one line
// at 393 and TWO lines at 360. This is precisely the class of defect the 393dp
// web captures cannot surface, so the row is declared `valueLines={2}` and the
// loading skeleton reserves two lines for it. Every other value is short enough
// to be single-line at both widths: "Tablet · 500 mg" ~94dp, "Dr. Ama Boateng"
// ~94dp, "2 remaining" ~69dp.
//
// The title is `headline-md` 20px Manrope SemiBold (~11dp average advance) in the
// same 222dp column: "Metformin" is ~99dp and single-line, but the column only
// holds ~20 characters, so a longer drug name wraps. `numberOfLines={2}` caps it
// and the skeleton reserves two lines — see the loading note below.
//
// ---------------------------------------------------------------------------
// THE LOADING STATE RESERVES THE LOADED HEIGHT — STRUCTURALLY
// ---------------------------------------------------------------------------
// Required, and done by construction rather than by matching numbers twice:
//
//  1. Every SectionHeader and every field LABEL renders for real in the loading
//     state. They are static chrome, not data — nothing about "Prescribed by" is
//     pending — so they are the same <Text> nodes in both states and their
//     height is identical by definition, not by arithmetic. Only the VALUES,
//     which genuinely are unknown, become bars.
//  2. A value bar is exactly one line box of the ramp it replaces
//     (`RAMP.labelSm` = 12 x 1.3), stacked inside the same `mt-1` wrapper
//     KeyValueRow uses, so N bars occupy exactly what an N-line value occupies.
//  3. Row height is `max(IconTile 40, text block)` in both states, and the tile
//     is present in both.
//
// The one thing a skeleton cannot know is how many lines the unloaded NAME will
// take, so it reserves the canon's worst case of two — matching `numberOfLines`
// on the loaded title. A 1-line name (Amlodipine) therefore settles 28dp shorter
// than its skeleton; reserving 2 and shrinking is the correct direction, since
// the alternative pushes content down as it arrives.
//
// ---------------------------------------------------------------------------
// NOT-FOUND IS A REAL STATE
// ---------------------------------------------------------------------------
// An unmatched `id` (a stale deep link) renders an explicit "not found" panel.
// It must never fall through to a card with a generic title and empty values —
// on a medication record that reads as "this drug, no dosage".
//
// ---------------------------------------------------------------------------
// DELIBERATELY ABSENT
// ---------------------------------------------------------------------------
// No "Request refill" or "Share" action. Refill requests are ActiveMedications-
// Screen's flow and its state lives there; adding a second, non-communicating
// entry point without the frame to specify it would be inventing behaviour. No
// <Badge>: Badge.tsx sets its caption at `text-[10px]`, under docs/BRAND.md's
// 12sp floor, so refill count is a KeyValueRow value at `label-sm` 12 instead.
// Flagged, not worked around silently.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { ScrollView, Text, View } from "react-native";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { DetailShell } from "@/components/shell";
import {
  Card,
  IconTile,
  InfoCallout,
  KeyValueRow,
  SectionHeader,
  type AnyIconName,
} from "@/components/ui";
import { ACTIVE_MEDICATIONS } from "./mock-data";
import type { ActiveMedication, MedicationScreenState } from "./types";

/**
 * Line boxes off the type ramp in tailwind.config.js, as the multiplication that
 * produces them rather than as pre-computed pixels — so a change to the ramp is
 * visible here instead of silently desynchronising the skeleton from the text it
 * stands in for. `label-sm` is 12/1.3 and `headline-md` is 20/1.4.
 */
const RAMP = {
  labelSm: 12 * 1.3,
  headlineMd: 20 * 1.4,
} as const;

/**
 * The `?state=` preview hatch, matching ActiveMedicationsScreen's convention so
 * the designed loading frame (828:7118) is reachable on device without faking a
 * slow network.
 *
 * Only two of `MedicationScreenState`'s five values mean anything to a single
 * record: `empty` is a property of a LIST, and `error`/`offline` are properties
 * of a request this screen does not make. Anything unrecognised — including those
 * three — resolves to `ready`, so a bad param can never strand the screen in a
 * state it has no design for.
 */
const PREVIEWABLE = ["ready", "loading"] as const satisfies readonly MedicationScreenState[];

type PreviewableState = (typeof PREVIEWABLE)[number];

function requestedState(value: string | string[] | undefined): PreviewableState {
  const state = Array.isArray(value) ? value[0] : value;
  return PREVIEWABLE.includes(state as PreviewableState) ? (state as PreviewableState) : "ready";
}

/** One placeholder line box, sized to the ramp entry it stands in for. */
function ValueBar({ width, height }: { width: `${number}%`; height: number }) {
  return <View className="rounded-xs bg-surface-container-high" style={{ width, height }} />;
}

/**
 * A labelled fact, with its value pending or present.
 *
 * The label is the SAME <Text> in both branches — see the loading note in the
 * header. Only the value swaps.
 */
function DetailField({
  icon,
  label,
  value,
  valueLines = 1,
  loading,
}: {
  icon: AnyIconName;
  label: string;
  value: string;
  /** Lines the loaded value occupies AT 360dp. See the arithmetic in the header. */
  valueLines?: number;
  loading: boolean;
}) {
  return (
    <View className="w-full flex-row items-start gap-4">
      {/* Decorative: the label names the fact in words. */}
      <IconTile icon={icon} />
      {loading ? (
        <View className="min-w-0 flex-1">
          <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
          {/* Mirrors KeyValueRow's own `mt-1` value wrapper exactly. */}
          <View className="mt-1">
            {Array.from({ length: valueLines }).map((_, line) => (
              <ValueBar
                key={line}
                height={RAMP.labelSm}
                width={line === valueLines - 1 ? "62%" : "100%"}
              />
            ))}
          </View>
        </View>
      ) : (
        <KeyValueRow label={label} value={value} />
      )}
    </View>
  );
}

export function MedicationDetailsScreen() {
  const { id, state } = useLocalSearchParams<{ id?: string; state?: string }>();
  const medication = ACTIVE_MEDICATIONS.find((item) => item.id === id);
  const loading = requestedState(state) === "loading";

  return (
    <DetailShell
      title="Medication details"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/overview" as Href);
      }}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* A stale deep link gets told so, not given an empty record. */}
        {!medication && !loading ? (
          <NotFound />
        ) : (
          <MedicationRecord medication={medication} loading={loading} />
        )}
      </ScrollView>
    </DetailShell>
  );
}

/**
 * `medication` is undefined only while loading — the not-found branch above owns
 * the other case — so every value falls back to the empty string, which the
 * loading branch never renders anyway.
 */
function MedicationRecord({
  medication,
  loading,
}: {
  medication: ActiveMedication | undefined;
  loading: boolean;
}) {
  const refills = medication?.refillsRemaining;

  return (
    <View
      className="gap-6"
      // One announcement for the whole pending screen; the bars themselves are
      // unlabelled Views and say nothing.
      accessibilityRole={loading ? "progressbar" : undefined}
      accessibilityLabel={loading ? "Loading medication details" : undefined}
      testID={loading ? "medication-details-loading" : "medication-details"}
    >
      {/* -- Identity -------------------------------------------------------- */}
      <Card>
        <View className="w-full flex-row items-start gap-4">
          <IconTile icon="medication" />
          <View className="min-w-0 flex-1">
            {loading ? (
              <>
                {/* Two lines: the loaded title is capped at 2 and reserving the
                    worst case shrinks rather than pushes. Header note. */}
                <ValueBar width="100%" height={RAMP.headlineMd} />
                <ValueBar width="55%" height={RAMP.headlineMd} />
                <View className="mt-1">
                  <ValueBar width="48%" height={RAMP.labelSm} />
                </View>
              </>
            ) : (
              <>
                <Text
                  className="font-headline-md text-headline-md text-on-surface"
                  numberOfLines={2}
                >
                  {medication?.name}
                </Text>
                <Text className="mt-1 font-label-md text-label-md text-on-surface-variant">
                  {medication?.formAndStrength}
                </Text>
              </>
            )}
          </View>
        </View>
      </Card>

      {/* -- How to take it -------------------------------------------------- */}
      <View className="gap-3">
        <SectionHeader title="How to take it" />
        <Card className="gap-4">
          <DetailField
            icon="schedule"
            label="Directions"
            value={medication?.instructions ?? ""}
            // Two lines at 360dp, one at 393dp. See the header arithmetic.
            valueLines={2}
            loading={loading}
          />
          <DetailField
            icon="pills"
            label="Form and strength"
            value={medication?.formAndStrength ?? ""}
            loading={loading}
          />
        </Card>
      </View>

      {/* -- Prescription ---------------------------------------------------- */}
      {/* Rendered when there is a prescription to describe. A self-reported
          entry has neither a prescriber nor a refill count, and the whole
          section is absent rather than present-and-blank. */}
      {loading || medication?.prescriberName || refills !== undefined ? (
        <View className="gap-3">
          <SectionHeader title="Prescription" />
          <Card className="gap-4">
            {loading || medication?.prescriberName ? (
              <DetailField
                icon="doctor"
                label="Prescribed by"
                value={medication?.prescriberName ?? ""}
                loading={loading}
              />
            ) : null}
            {loading || refills !== undefined ? (
              <DetailField
                icon="prescription"
                label="Refills"
                // 0 is a fact and must read as one — "None remaining", never a
                // blank and never a bare "0".
                value={refills === 0 ? "None remaining" : `${refills} remaining`}
                loading={loading}
              />
            ) : null}
          </Card>
        </View>
      ) : null}

      {/* -- Provenance ------------------------------------------------------ */}
      {/* Where the record came from, in words. Not colour-only: docs/BRAND.md
          forbids colour as the sole signal for clinical meaning. */}
      {!loading && medication ? (
        <InfoCallout icon={medication.source === "prescribed" ? "verified-user" : "person"}>
          {medication.source === "prescribed"
            ? "This record came from your prescriber."
            : "You added this record yourself. Ask your clinician to confirm it."}
        </InfoCallout>
      ) : null}
    </View>
  );
}

function NotFound() {
  return (
    <View className="gap-6">
      <Card>
        <View className="w-full flex-row items-start gap-4">
          <IconTile icon="medication" />
          <View className="min-w-0 flex-1">
            <Text className="font-headline-md text-headline-md text-on-surface">
              Medication not found
            </Text>
            <Text className="mt-1 font-label-md text-label-md text-on-surface-variant">
              This record is no longer in your list
            </Text>
          </View>
        </View>
      </Card>
      <InfoCallout icon="info-outline">
        It may have been stopped or replaced. Open your medication list to see what you are taking
        now.
      </InfoCallout>
    </View>
  );
}
