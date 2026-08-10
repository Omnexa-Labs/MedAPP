// Patient record — `GET /v1/patients/{userId}/records` (ehr_service).
//
// ===========================================================================
// THE STATE IS DERIVED FROM THE QUERY, IN ONE PLACE, BEFORE ANYTHING RENDERS
// ===========================================================================
// This screen previously computed `record` as
//
//     const record = state === "not-found" ? undefined : findPatientRecord(id)
//
// against a local fixture, and rendered `NotFoundState` for any falsy `record`
// while `state` stayed `"ready"`. Two consequences, both of which survive a
// naive "just add a useQuery":
//
//   * a failed fetch produces `data === undefined`, which is indistinguishable
//     from "no such patient" — so a 500 would have rendered "This record may
//     have moved, or you may not have permission to view it", a reassuring
//     sentence about an outage;
//   * a missing id resolved to a DEFAULT PATIENT, so a deep link with no id
//     opened one specific named person's chart.
//
// `deriveState` below is the whole of the decision, it takes the query object
// rather than pieces of it, and it is exported so a test can assert the mapping
// without a render. Its two load-bearing rules:
//
//   NOT-FOUND REQUIRES AN EXPLICIT 404. Every other failure — 500, a network
//   drop, a parse error — is `error`. There is no path from `data === undefined`
//   to not-found.
//
//   A MISSING ID IS NOT-FOUND, and no request is made. There is no default
//   patient, and this screen cannot be opened without naming one.
//
// 403 is its own state. "You do not have access" and "this record does not
// exist" are different facts about a patient, and ehr_service gates PHI per
// consent — see the consent note in features/overview/api.ts.
//
// ===========================================================================
// WHAT THIS SCREEN NO LONGER DRAWS, AND WHY
// ===========================================================================
// `PatientBundleOut` is `patient + vitals + consents`. It carries no age, no
// ward, no patient code, no review status, no clinical summary and no care
// timeline — every one of those came from `mock-data.ts`, which is deleted (see
// ./record.ts). So the following are GONE rather than defaulted:
//
//   * the demographics line ("Ward 2A · ID PT-8821") and the age beside the name
//   * the "Needs review" / "Up to date" badge and "Reviewed 2h ago"
//   * the clinical summary paragraph
//   * the whole Care timeline card, its three fabricated entries (one naming a
//     consultation with "Dr Miller", who is not in the dev seed), its
//     attachment chip, and the "View full history" control — which toggled
//     `slice(0, 3)` against a three-entry array and therefore never revealed
//     anything
//   * "Updated 2 min ago", a literal, replaced by the newest reading's own
//     `recorded_at`
//   * "Showing saved clinical data from 09:42" — a fixed time on an offline
//     banner, now simply an error state that shows no clinical data at all
//
// Restoring any of them is an ehr_service change, recorded in
// docs/api/README.md's gap register.
//
// ===========================================================================
// ACTIONS: NOTHING REPORTS SUCCESS WITHOUT A REQUEST
// ===========================================================================
// Discharge used to open a confirmation and then render "Discharge saved —
// removed from the active roster." No request was made, no roster was touched,
// and re-entering the record showed the patient still admitted. ehr_service has
// no discharge route — no admission or episode table exists — so the flow is
// gone and Discharge joins the other unconnected actions on `ActionInfoSheet`,
// which is the pattern this screen already used correctly for prescribing,
// follow-up and lab ordering.
//
// The `?state=` preview hatch is gone too. Every async state is now reachable
// from a real query, which is what it existed to stand in for, and a URL
// parameter that forces "ready" over a failed fetch is the same lie by a
// different route.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.
// Only expo-router is used.

import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { DetailShell } from "@/components/shell";
import {
  AvatarWithFallback,
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  Icon,
  VitalStatCard,
  type RetryHandler,
} from "@/components/ui";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ApiError } from "@/types/api";
import { ehrApi, type PatientBundle } from "@/features/overview/api";
import { toPatientRecord } from "./record";
import type { PatientRecord, RecordVital } from "./types";
import { abnormalLabelFor, assessVital, toneFor } from "./vital-ranges";

type ClinicalAction = "video" | "prescription" | "follow-up" | "lab" | "discharge";
type InfoAction = Exclude<ClinicalAction, "video">;

/**
 * Every state this screen can be in. A discriminated union, so `record` exists
 * on exactly one branch and cannot be read from any other.
 */
export type RecordScreenState =
  | { kind: "loading" }
  /** No id in the route, or the service says there is no such record. */
  | { kind: "not-found"; reason: "no-id" | "404" }
  | { kind: "forbidden" }
  | { kind: "error"; offline: boolean }
  | { kind: "ready"; record: PatientRecord };

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The whole state decision, from the id and the query object.
 *
 * Exported for the test that pins "a failed fetch is an ERROR, never
 * not-found". Takes the pieces of `UseQueryResult` it uses rather than the
 * whole object so it can be called with a plain literal.
 */
export function deriveState(
  id: string | undefined,
  query: Pick<UseQueryResult<PatientBundle>, "isPending" | "isError" | "error" | "data">,
): RecordScreenState {
  // No patient named. No request was made (the query is disabled), so
  // `isPending` is true here and would otherwise read as "loading" forever.
  if (!id) return { kind: "not-found", reason: "no-id" };
  if (query.isPending) return { kind: "loading" };
  if (query.isError) {
    const status = query.error instanceof ApiError ? query.error.status : undefined;
    if (status === 404) return { kind: "not-found", reason: "404" };
    if (status === 403) return { kind: "forbidden" };
    // status 0 is `NETWORK_ERROR` from lib/api/client.ts. Still an ERROR state:
    // it changes the words, never whether clinical data is shown.
    return { kind: "error", offline: status === 0 };
  }
  // Settled, not errored, and still nothing. Not reachable through the current
  // client — which throws rather than resolving undefined — but if it ever is,
  // it is a failure, not an empty record.
  if (!query.data) return { kind: "error", offline: false };
  return { kind: "ready", record: toPatientRecord(id, query.data) };
}

export function PatientRecordScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = first(params.id);
  const [actionSheet, setActionSheet] = useState<InfoAction | null>(null);
  const currentUser = useCurrentUser();

  const query = useQuery({
    queryKey: ["ehr", "records", id],
    queryFn: () => ehrApi.getBundle(id as string),
    enabled: Boolean(id),
  });
  const state = deriveState(id, query);

  const backToRoster = () => router.replace("/(app)/active-patient-roster-2" as Href);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else backToRoster();
  };

  if (state.kind === "loading") return <LoadingState onBack={goBack} />;
  if (state.kind === "not-found")
    return <NotFoundState reason={state.reason} onBack={goBack} onRoster={backToRoster} />;
  if (state.kind === "forbidden") return <ForbiddenState onBack={goBack} onRoster={backToRoster} />;
  if (state.kind === "error")
    return (
      <ErrorState
        offline={state.offline}
        retrying={query.isFetching}
        // The promise, not `void query.refetch()`: ErrorPanel derives the
        // pending label from the request being in flight, and a handler that
        // returns nothing is the shape of the retries that refetched nothing.
        onRetry={() => query.refetch()}
        onBack={goBack}
      />
    );

  const record = state.record;

  const handleAction = (action: ClinicalAction) => {
    if (action === "video") {
      // The provider is WHOEVER IS SIGNED IN. This used to push
      // `providerName: "Dr. Julian Sterling"` — a fixed identity, on every call,
      // from every account — into a consultation the patient then sees.
      router.push({
        pathname: "/(app)/waiting-room",
        params: {
          sessionId: `patient-${record.id}`,
          viewerRole: "practitioner",
          providerId: currentUser?.id ?? "",
          providerName: currentUser?.displayName ?? "",
          patientId: record.id,
          // `display_name` is nullable; an unnamed record travels as an empty
          // string rather than as an invented name.
          patientName: record.name ?? "",
          appointmentId: `patient-${record.id}`,
        },
      } as unknown as Href);
      return;
    }
    setActionSheet(action);
  };

  return (
    <DetailShell title="Patient record" onBack={goBack}>
      <ScrollView
        accessibilityLabel="Patient record"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 24 }}
      >
        <PatientSummary record={record} onVideo={() => handleAction("video")} />
        <ClinicalActions onAction={handleAction} />
        <VitalsSection vitals={record.vitals} />
      </ScrollView>
      <ActionInfoSheet action={actionSheet} onClose={() => setActionSheet(null)} />
    </DetailShell>
  );
}

function PatientSummary({ record, onVideo }: { record: PatientRecord; onVideo: () => void }) {
  return (
    <Card testID="patient-summary-card" className="p-4">
      <View className="flex-row items-center gap-3">
        <AvatarWithFallback
          size={48}
          initials={record.initials ?? undefined}
          label={record.name ?? "Patient"}
        />
        <View className="min-w-0 flex-1">
          {/* No age: the bundle carries no date of birth. An unnamed record says
              so — it does not borrow the id as a name. */}
          <Text className="font-headline-md text-headline-md text-on-surface">
            {record.name ?? "Name not on record"}
          </Text>
          <Text className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
            Patient ID {record.patientId}
          </Text>
        </View>
      </View>
      {/* Consents are the only access fact the bundle carries, and they are why
          this record is legible at all — stated in words, not as a lock glyph. */}
      <Text className="mt-4 font-label-sm text-label-sm text-on-surface-variant">
        {record.activeConsentCount === 1
          ? "1 active access consent on this record"
          : `${record.activeConsentCount} active access consents on this record`}
      </Text>
      <View className="mt-4">
        <Button label="Start video call" leadingIcon="videocam" shadow={false} onPress={onVideo} />
      </View>
    </Card>
  );
}

function ClinicalActions({ onAction }: { onAction: (action: ClinicalAction) => void }) {
  return (
    <View>
      <Text className="font-headline-md text-headline-md text-on-surface">Clinical actions</Text>
      <View className="mt-4 gap-3">
        <View className="flex-row gap-3">
          <ActionTile label="Issue prescription" action="prescription" onPress={onAction} />
          <ActionTile label="Schedule follow-up" action="follow-up" onPress={onAction} />
        </View>
        <View className="flex-row gap-3">
          <ActionTile label="Order lab tests" action="lab" onPress={onAction} />
          <ActionTile label="Discharge patient" action="discharge" onPress={onAction} />
        </View>
      </View>
    </View>
  );
}

function ActionTile({
  label,
  action,
  onPress,
}: {
  label: string;
  action: InfoAction;
  onPress: (action: ClinicalAction) => void;
}) {
  const icon =
    action === "prescription"
      ? "prescription"
      : action === "follow-up"
        ? "appointment"
        : action === "lab"
          ? "lab-sample"
          : "hospital";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // Every one of these opens the same availability sheet now, including
      // Discharge — so the hint is the same sentence for all four rather than a
      // special case that implied one of them completed.
      accessibilityHint="Workflow not connected; opens availability details"
      onPress={() => onPress(action)}
      className="flex-1 justify-between rounded-card border border-outline-variant bg-card-surface p-4 active:opacity-80"
      style={{ height: 148 }}
    >
      <Icon name={icon} />
      <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
    </Pressable>
  );
}

/**
 * "Updated" from the data, not from a literal.
 *
 * The heading used to read "Updated 2 min ago" unconditionally. It now reports
 * the newest reading's own `recorded_at`, and says nothing at all when there
 * are no readings to date.
 */
function updatedLabel(vitals: readonly RecordVital[]): string | null {
  const newest = vitals[0];
  if (!newest) return null;
  const mins = Math.floor((Date.now() - Date.parse(newest.recordedAtIso)) / 60000);
  if (!Number.isFinite(mins) || mins < 0) return null;
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins}m ago`;
  if (mins < 1440) return `Updated ${Math.floor(mins / 60)}h ago`;
  return `Updated ${Math.floor(mins / 1440)}d ago`;
}

function VitalsSection({ vitals }: { vitals: readonly RecordVital[] }) {
  const updated = updatedLabel(vitals);
  // Assessed ONCE, here, from ./vital-ranges.ts. `tone` and the abnormal words
  // are computed from the reading; there is no prop by which a caller could
  // supply either. See the header of ./types.ts.
  const assessed = vitals.map((vital) => ({ vital, assessment: assessVital(vital) }));
  const scored = assessed.filter((entry) => entry.assessment.status !== "unclassified");
  const unscored = assessed.filter((entry) => entry.assessment.status === "unclassified");

  return (
    <Card className="p-5">
      <View className="flex-row items-center justify-between">
        <Text className="font-headline-md text-headline-md text-on-surface">Latest vitals</Text>
        {updated ? (
          <Text className="font-label-sm text-label-sm text-on-surface-variant">{updated}</Text>
        ) : null}
      </View>

      {/* `inline`, never the default card: this sits INSIDE the vitals Card, and
          a card drawn inside a card is the drift the shared panel replaces. The
          "Latest vitals" heading and its `updated` label above stay put — only
          the section's own body is empty. */}
      {assessed.length === 0 ? (
        <EmptyState
          container="inline"
          className="mt-5"
          icon="monitor-heart"
          title="No observations recorded"
          body="Nothing has been recorded against this record yet."
        />
      ) : null}

      {scored.length > 0 ? (
        <View className="mt-4 gap-3">
          {scored.map(({ vital, assessment }) => (
            <VitalStatCard
              key={vital.label}
              layout="row"
              label={vital.label}
              value={vital.value}
              unit={vital.unit ?? undefined}
              icon={vital.icon}
              tone={toneFor(assessment)}
              abnormalLabel={abnormalLabelFor(assessment)}
            />
          ))}
        </View>
      ) : null}

      {/* Readings no range could be applied to are SEPARATED, not mixed in.
          VitalStatCard has two tones and the neutral one is what an unscored
          reading has to take — so listing it beside checked readings would let
          the absence of a check read as a pass. */}
      {unscored.length > 0 ? (
        <View className="mt-5">
          <Text className="font-label-md text-label-md text-on-surface">
            Not checked against a reference range
          </Text>
          <Text className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
            No adult reference range is held for these, or the unit is missing.
          </Text>
          <View className="mt-3 gap-3">
            {unscored.map(({ vital }) => (
              <VitalStatCard
                key={vital.label}
                layout="row"
                label={vital.label}
                value={vital.value}
                unit={vital.unit ?? undefined}
                icon={vital.icon}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function ActionInfoSheet({ action, onClose }: { action: InfoAction | null; onClose: () => void }) {
  const copy = action
    ? {
        prescription: [
          "Prescription workspace",
          "No prescription has been issued. Complete prescribing will be available when the clinician workflow is connected.",
        ],
        "follow-up": [
          "Follow-up planning",
          "No appointment has been booked. Review availability with the patient first.",
        ],
        lab: ["Lab order", "No lab test has been ordered. The ordering workflow is not connected yet."],
        // Was a confirmation dialog that reported "Discharge saved — removed
        // from the active roster." Nothing was sent and nothing was removed.
        discharge: [
          "Discharge",
          "No discharge has been recorded and this patient's care episode is unchanged. Discharge will be available when the clinician workflow is connected.",
        ],
      }[action]
    : null;
  return (
    <Modal visible={Boolean(action)} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-scrim/40" onPress={onClose}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          className="rounded-t-card bg-card-surface p-5 pb-8"
        >
          <Text className="font-headline-md text-headline-md text-on-surface">{copy?.[0]}</Text>
          <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">{copy?.[1]}</Text>
          <View className="mt-6">
            <Button label="Close" shadow={false} onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LoadingState({ onBack }: { onBack: () => void }) {
  return (
    <DetailShell title="Patient record" onBack={onBack}>
      <View accessibilityLabel="Loading patient record" className="flex-1 gap-4 p-4">
        <View className="h-64 rounded-card bg-surface-container" />
        <View className="h-48 rounded-card bg-surface-container" />
        <View className="h-64 rounded-card bg-surface-container" />
      </View>
    </DetailShell>
  );
}

/**
 * The screen CHROME a terminal state needs: the app bar with its way back, and
 * a full-height centred slot for the panel.
 *
 * It no longer draws the panel itself. It used to be a fourth hand-rolled
 * anatomy — a `p-5` Card with no icon plate at all, its own type and its own
 * 24 gap to the button — and the shared `ErrorPanel` is now the one that decides
 * all of that. What is left here is what the shared component cannot own: these
 * three states replace a WHOLE SCREEN, so the app bar and the centring are the
 * screen's business.
 */
function TerminalPanel({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <DetailShell title="Patient record" onBack={onBack}>
      <View className="flex-1 items-center justify-center px-4">{children}</View>
    </DetailShell>
  );
}

function NotFoundState({
  reason,
  onBack,
  onRoster,
}: {
  reason: "no-id" | "404";
  onBack: () => void;
  onRoster: () => void;
}) {
  return (
    <TerminalPanel onBack={onBack}>
      <ErrorPanel
        testID="not-found-card"
        className="w-full"
        // A missing id looked nothing up; a 404 looked one up and there was
        // nothing there. Both are dead ends, and naming which keeps them
        // greppable rather than collapsing to "no retry".
        unrecoverable={reason === "404" ? "not-found" : "no-identifier"}
        title="Patient record unavailable"
        // The two reasons are different facts and are worded as such. Neither
        // mentions permission any more — that is `ForbiddenState`, and folding
        // the three together is what let an outage read as a missing record.
        body={
          reason === "no-id"
            ? "This link did not name a patient, so no record was opened."
            : "No record exists for this patient."
        }
        // A way OUT, not a retry: the roster is somewhere else to be, and
        // re-issuing this lookup would return the same nothing.
        action={{ label: "Back to patient roster", onPress: onRoster }}
      />
    </TerminalPanel>
  );
}

function ForbiddenState({ onBack, onRoster }: { onBack: () => void; onRoster: () => void }) {
  return (
    <TerminalPanel onBack={onBack}>
      <ErrorPanel
        testID="forbidden-card"
        className="w-full"
        unrecoverable="forbidden"
        title="You do not have access"
        body="This record exists, but no active consent grants you access to it. Ask the patient or the records team to grant access."
        action={{ label: "Back to patient roster", onPress: onRoster }}
      />
    </TerminalPanel>
  );
}

/**
 * The state the old screen could not reach.
 *
 * It shows NO clinical data. The previous offline branch rendered the full
 * record beneath a banner claiming it was "saved clinical data from 09:42" —
 * there was no cache, no saved copy and no 09:42; it was the fixture.
 */
function ErrorState({
  offline,
  retrying,
  onRetry,
  onBack,
}: {
  offline: boolean;
  /** The query's own `isFetching` — a refetch can also start elsewhere. */
  retrying: boolean;
  onRetry: RetryHandler;
  onBack: () => void;
}) {
  return (
    <TerminalPanel onBack={onBack}>
      <ErrorPanel
        testID="record-error-card"
        className="w-full"
        title={offline ? "You’re offline" : "Couldn’t load this record"}
        body={
          offline
            ? "This record could not be reached. Nothing is shown rather than something out of date."
            : "Something went wrong loading this record. No clinical data is shown."
        }
        // The only one of the three that has something to re-issue. The
        // "Retrying…" label and the disabled state are the panel's, derived from
        // the promise, so nothing here can claim a refetch that is not running.
        retry={onRetry}
        retrying={retrying}
      />
    </TerminalPanel>
  );
}
