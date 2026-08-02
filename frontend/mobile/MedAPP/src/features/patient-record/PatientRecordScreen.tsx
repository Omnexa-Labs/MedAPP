import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { DetailShell } from "@/components/shell";
import { AvatarWithFallback, Badge, Button, Card, Icon, VitalStatCard } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { findPatientRecord } from "./mock-data";
import type { PatientRecord, PatientRecordPreviewState, RecordVital, TimelineEntry } from "./types";

const PREVIEW_STATES: readonly PatientRecordPreviewState[] = [
  "ready",
  "loading",
  "offline",
  "not-found",
  "vitals-unavailable",
  "discharge-saved",
  "discharge-failed",
];

type ClinicalAction = "video" | "prescription" | "follow-up" | "lab" | "discharge";

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function previewState(value?: string | string[]): PatientRecordPreviewState {
  const candidate = first(value);
  return PREVIEW_STATES.includes(candidate as PatientRecordPreviewState)
    ? (candidate as PatientRecordPreviewState)
    : "ready";
}

export function PatientRecordScreen() {
  const params = useLocalSearchParams<{ id?: string; state?: string }>();
  const [state, setState] = useState(() => previewState(params.state));
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [actionSheet, setActionSheet] = useState<
    Exclude<ClinicalAction, "discharge"> | "document" | null
  >(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const record = state === "not-found" ? undefined : findPatientRecord(first(params.id));

  const backToRoster = () => router.replace("/(app)/active-patient-roster-2" as Href);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else backToRoster();
  };

  if (state === "loading") return <LoadingState onBack={goBack} />;
  if (!record) return <NotFoundState onBack={goBack} onRoster={backToRoster} />;
  if (state === "discharge-saved")
    return <DischargeSaved record={record} onRoster={backToRoster} />;

  const offline = state === "offline";
  const vitalsUnavailable = state === "vitals-unavailable";
  const handleAction = (action: ClinicalAction) => {
    if (offline) return;
    if (action === "video") {
      router.push({
        pathname: "/(app)/waiting-room",
        params: {
          sessionId: `patient-${record.id}`,
          viewerRole: "practitioner",
          providerId: "julian-sterling",
          providerName: "Dr. Julian Sterling",
          providerSpecialty: "Cardiologist",
          patientId: record.id,
          patientName: record.name,
          appointmentId: `patient-${record.id}`,
        },
      } as unknown as Href);
      return;
    }
    if (action === "discharge") {
      setDischargeOpen(true);
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
        {offline ? <OfflineBanner onRetry={() => setState("ready")} /> : null}
        {state === "discharge-failed" ? (
          <DischargeFailure
            onRetry={() => setDischargeOpen(true)}
            onCancel={() => setState("ready")}
          />
        ) : null}
        <PatientSummary record={record} offline={offline} onVideo={() => handleAction("video")} />
        <ClinicalActions offline={offline} onAction={handleAction} />
        <VitalsSection
          unavailable={vitalsUnavailable}
          vitals={record.vitals}
          onReconnect={() => setState("ready")}
        />
        <TimelineSection
          entries={record.timeline}
          expanded={historyExpanded}
          onToggle={() => setHistoryExpanded((value) => !value)}
          onDocument={() => setActionSheet("document")}
        />
      </ScrollView>
      <DischargeDialog
        record={record}
        visible={dischargeOpen}
        onCancel={() => setDischargeOpen(false)}
        onConfirm={() => {
          setDischargeOpen(false);
          setState("discharge-saved");
        }}
      />
      <ActionInfoSheet action={actionSheet} onClose={() => setActionSheet(null)} />
    </DetailShell>
  );
}

function PatientSummary({
  record,
  offline,
  onVideo,
}: {
  record: PatientRecord;
  offline: boolean;
  onVideo: () => void;
}) {
  const onPrimary = useTokenColor("on-primary");
  return (
    <Card testID="patient-summary-card" className="p-4">
      <View className="flex-row items-center gap-3">
        <AvatarWithFallback size={48} initials={record.initials} label={record.name} />
        <View className="min-w-0 flex-1">
          <Text className="font-headline-md text-headline-md text-on-surface">
            {record.name}, {record.age}
          </Text>
          <Text className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
            {record.ward} · ID {record.patientCode}
          </Text>
        </View>
      </View>
      <View className="mt-4 flex-row flex-wrap items-center gap-2">
        <Badge
          label={record.reviewStatus}
          tone={record.reviewStatus === "Needs review" ? "info" : "success"}
        />
        <Text className="font-label-sm text-label-sm text-on-surface-variant">
          {record.reviewed}
        </Text>
      </View>
      <Text className="mt-4 font-body-md text-body-md text-on-surface-variant">
        {record.summary}
      </Text>
      <View className="mt-4">
        {offline ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start video call"
            accessibilityHint="Unavailable while offline"
            accessibilityState={{ disabled: true }}
            disabled
            className="w-full flex-row items-center justify-center gap-2 rounded-full bg-primary py-6"
            style={{ opacity: 0.38 }}
          >
            <Icon chrome="videocam" size={20} color={onPrimary} />
            <Text className="font-label-md text-label-md text-on-primary">Start video call</Text>
          </Pressable>
        ) : (
          <Button
            label="Start video call"
            leadingIcon="videocam"
            shadow={false}
            onPress={onVideo}
          />
        )}
      </View>
    </Card>
  );
}

function ClinicalActions({
  offline,
  onAction,
}: {
  offline: boolean;
  onAction: (action: ClinicalAction) => void;
}) {
  return (
    <View>
      <Text className="font-headline-md text-headline-md text-on-surface">Clinical actions</Text>
      <View className="mt-4 gap-3">
        <View className="flex-row gap-3">
          <ActionTile
            label="Issue prescription"
            action="prescription"
            offline={offline}
            onPress={onAction}
          />
          <ActionTile
            label="Schedule follow-up"
            action="follow-up"
            offline={offline}
            onPress={onAction}
          />
        </View>
        <View className="flex-row gap-3">
          <ActionTile label="Order lab tests" action="lab" offline={offline} onPress={onAction} />
          <ActionTile
            label="Discharge patient"
            action="discharge"
            offline={offline}
            onPress={onAction}
          />
        </View>
      </View>
    </View>
  );
}

function ActionTile({
  label,
  action,
  offline,
  onPress,
}: {
  label: string;
  action: Exclude<ClinicalAction, "video">;
  offline: boolean;
  onPress: (action: ClinicalAction) => void;
}) {
  const destructive = action === "discharge";
  const content = useTokenColor(destructive ? "error" : "primary");
  const icon =
    action === "prescription"
      ? "prescription"
      : action === "follow-up"
        ? "appointment"
        : "lab-sample";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={
        offline
          ? "Unavailable while offline"
          : action === "discharge"
            ? "Opens discharge confirmation"
            : "Workflow not connected; opens availability details"
      }
      accessibilityState={{ disabled: offline }}
      disabled={offline}
      onPress={() => onPress(action)}
      className={`flex-1 justify-between rounded-card border border-outline-variant p-4 active:opacity-80 ${destructive ? "bg-error-container" : "bg-card-surface"}`}
      style={{ height: 148, opacity: offline ? 0.38 : 1 }}
    >
      {destructive ? (
        <Icon chrome="logout" color={content} />
      ) : (
        <Icon name={icon} color={content} />
      )}
      <Text
        className={`font-label-md text-label-md ${destructive ? "text-error" : "text-on-surface"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function VitalsSection({
  unavailable,
  vitals,
  onReconnect,
}: {
  unavailable: boolean;
  vitals: readonly RecordVital[];
  onReconnect: () => void;
}) {
  return (
    <Card className="p-5">
      <View className="flex-row items-center justify-between">
        <Text className="font-headline-md text-headline-md text-on-surface">Latest vitals</Text>
        <Text className="font-label-sm text-label-sm text-on-surface-variant">
          Updated 2 min ago
        </Text>
      </View>
      {unavailable ? (
        <View accessibilityLiveRegion="polite" className="mt-5 items-center py-5">
          <Icon chrome="cloud-off" />
          <Text className="mt-3 font-label-md text-label-md text-on-surface">
            Live readings unavailable
          </Text>
          <Text className="mt-1 text-center font-body-md text-body-md text-on-surface-variant">
            Reconnect the bedside monitor or review the latest saved observations.
          </Text>
          <View className="mt-4">
            <Button
              label="Reconnect"
              variant="outline"
              fullWidth={false}
              shadow={false}
              onPress={onReconnect}
            />
          </View>
        </View>
      ) : (
        <View className="mt-4 gap-3">
          {/* Was a private `VitalRow` — the SEVENTH copy of "a labelled clinical
              measurement". `VitalStatCard` exists because six earlier copies
              drifted, and it now carries a `layout="row"` axis so a horizontal
              line is a supported case rather than a reason to fork. `tone` picks
              the token pair; this screen passes no colour. */}
          {vitals.map((vital) => (
            <VitalStatCard
              key={vital.label}
              layout="row"
              label={vital.label}
              value={vital.value}
              unit={vital.unit}
              icon={vital.icon}
              tone={vital.abnormal ? "abnormal" : "normal"}
              abnormalLabel="Above target"
            />
          ))}
        </View>
      )}
    </Card>
  );
}


function TimelineSection({
  entries,
  expanded,
  onToggle,
  onDocument,
}: {
  entries: readonly TimelineEntry[];
  expanded: boolean;
  onToggle: () => void;
  onDocument: () => void;
}) {
  return (
    <Card className="p-5">
      <Text className="font-headline-md text-headline-md text-on-surface">Care timeline</Text>
      <View className="mt-5 gap-6">
        {(expanded ? entries : entries.slice(0, 3)).map((entry) => (
          <View key={entry.id} className="flex-row gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <Icon name={entry.icon} size={20} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-label-md text-label-md text-on-surface">{entry.title}</Text>
              <Text className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
                {entry.timestamp}
              </Text>
              <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
                {entry.detail}
              </Text>
              {entry.attachment ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${entry.attachment}`}
                  onPress={onDocument}
                  className="mt-3 min-h-11 flex-row items-center gap-2 self-start rounded-md border border-outline-variant px-3 py-2 active:opacity-70"
                >
                  <Icon chrome="picture-as-pdf" size={20} />
                  <Text className="font-label-sm text-label-sm text-on-surface">
                    {entry.attachment}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View full history"
        onPress={onToggle}
        className="mt-6 min-h-11 items-center justify-center rounded-full active:opacity-70"
      >
        <Text className="font-label-md text-label-md text-primary">
          {expanded ? "Show recent history" : "View full history"}
        </Text>
      </Pressable>
    </Card>
  );
}

function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <Card accessibilityLiveRegion="assertive" className="bg-error-container p-4">
      <Text className="font-headline-md text-headline-md text-on-error-container">
        You’re offline
      </Text>
      <Text className="mt-1 font-body-md text-body-md text-on-error-container">
        Showing saved clinical data from 09:42. Live actions are unavailable.
      </Text>
      <View className="mt-4">
        <Button
          label="Try again"
          variant="outline"
          fullWidth={false}
          shadow={false}
          onPress={onRetry}
        />
      </View>
    </Card>
  );
}

function DischargeDialog({
  record,
  visible,
  onCancel,
  onConfirm,
}: {
  record: PatientRecord;
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 justify-end bg-scrim/40" onPress={onCancel}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          className="rounded-t-card bg-card-surface p-5 pb-8"
        >
          <Text className="font-headline-md text-headline-md text-on-surface">
            Discharge {record.name}?
          </Text>
          <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
            This ends the active care episode and removes the patient from the active roster. The
            clinical record remains available.
          </Text>
          <View className="mt-4 rounded-md bg-error-container p-4">
            <Text className="font-label-md text-label-md text-on-error-container">
              Confirm only after medication reconciliation and follow-up arrangements are complete.
            </Text>
          </View>
          <View className="mt-6 flex-row gap-3">
            <View className="flex-1">
              <Button label="Cancel" variant="outline" shadow={false} onPress={onCancel} />
            </View>
            <View className="flex-1">
              <Button label="Confirm discharge" shadow={false} onPress={onConfirm} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DischargeFailure({ onRetry, onCancel }: { onRetry: () => void; onCancel: () => void }) {
  return (
    <Card accessibilityLiveRegion="assertive" className="bg-error-container p-4">
      <Text className="font-headline-md text-headline-md text-on-error-container">
        Couldn’t discharge patient
      </Text>
      <Text className="mt-3 font-body-md text-body-md text-on-error-container">
        No changes were saved. Check your connection and try again, or cancel to keep reviewing the
        record.
      </Text>
      <View className="mt-3 flex-row gap-3">
        <Button label="Try again" fullWidth={false} shadow={false} onPress={onRetry} />
        <Button
          label="Cancel"
          variant="outline"
          fullWidth={false}
          shadow={false}
          onPress={onCancel}
        />
      </View>
    </Card>
  );
}

function ActionInfoSheet({
  action,
  onClose,
}: {
  action: Exclude<ClinicalAction, "discharge"> | "document" | null;
  onClose: () => void;
}) {
  const copy = action
    ? {
        video: ["Video call setup", "A consultation room must be created before a call can start."],
        prescription: [
          "Prescription workspace",
          "No prescription has been issued. Complete prescribing will be available when the clinician workflow is connected.",
        ],
        "follow-up": [
          "Follow-up planning",
          "No appointment has been booked. Review availability with the patient first.",
        ],
        lab: [
          "Lab order",
          "No lab test has been ordered. The ordering workflow is not connected yet.",
        ],
        document: ["Blood_Panel_V4.pdf", "Document preview is not available on this device yet."],
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
          <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
            {copy?.[1]}
          </Text>
          <View className="mt-6">
            <Button label="Close" shadow={false} onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// The local `ScreenFrame` that used to sit here is gone: it was this screen's
// private copy of the wrapper `DetailShell` now owns, and it is the reason the
// `scheme` prop was threaded through three state components that never used it
// for anything but a StatusBar. The shell resolves the scheme itself.

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

function NotFoundState({ onBack, onRoster }: { onBack: () => void; onRoster: () => void }) {
  return (
    <DetailShell title="Patient record" onBack={onBack}>
      <View className="flex-1 items-center justify-center px-4">
        <Card
          testID="not-found-card"
          className="w-full items-center justify-center p-5"
          style={{ height: 220 }}
        >
          <Text className="text-center font-headline-md text-headline-md text-on-surface">
            Patient record unavailable
          </Text>
          <Text className="mt-2 text-center font-body-md text-body-md text-on-surface-variant">
            This record may have moved, or you may not have permission to view it.
          </Text>
          <View className="mt-6 w-full">
            <Button label="Back to patient roster" shadow={false} onPress={onRoster} />
          </View>
        </Card>
      </View>
    </DetailShell>
  );
}

function DischargeSaved({ record, onRoster }: { record: PatientRecord; onRoster: () => void }) {
  return (
    <DetailShell title="Patient record" onBack={onRoster}>
      <View className="flex-1 items-center justify-center px-4">
        <Card
          testID="discharge-saved-card"
          className="w-full items-center justify-center p-5"
          style={{ height: 220 }}
        >
          <Text className="text-center font-headline-lg text-headline-lg text-on-surface">
            Discharge saved
          </Text>
          <Text className="mt-2 text-center font-body-md text-body-md text-on-surface-variant">
            {record.name} was removed from the active roster. Her record remains available in
            patient history.
          </Text>
          <View className="mt-8 w-full">
            <Button label="Back to patient roster" shadow={false} onPress={onRoster} />
          </View>
        </Card>
      </View>
    </DetailShell>
  );
}
