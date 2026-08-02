import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
// TWO shells on purpose. The roster itself is the practitioner "Patients" TAB
// ROOT, so it keeps PractitionerShell and its bottom nav. `ReviewSaved` is a
// pushed terminal confirmation with a back button and no tab set — the detail
// case, so it takes DetailShell. Neither is forced onto the other: giving the
// roster a back-button bar would strand the practitioner with no tabs, and
// giving ReviewSaved a tab bar is what docs/BRAND.md §App shell forbids.
import { DetailShell, PractitionerShell } from "@/components/shell";
import {
  AvatarWithFallback,
  Badge,
  Button,
  Card,
  ChoiceChip,
  ChoiceChipRow,
  Icon,
  SearchField,
} from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { PENDING_INTAKES, TRIAGE_PATIENTS } from "./mock-data";
import type {
  ClinicalFilter,
  PendingIntake,
  Roster2ScreenState,
  RosterScope,
  RosterSort,
  TriageMetric,
  TriagePatient,
} from "./types";

const STATES: readonly Roster2ScreenState[] = [
  "ready",
  "loading",
  "empty",
  "offline",
  "review-saved",
  "intake-accepted",
  "intake-error",
];
const NEEDS_REVIEW_COUNT = TRIAGE_PATIENTS.filter(
  (patient) => patient.workflowStatus === "needs-review",
).length;
type WardFilter = "All wards" | "Ward 2A";
type ConditionFilter = "All conditions" | "Cardiology";
type IntakeOutcome = "accepted" | "declined" | "error" | null;

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}
function stateFrom(value?: string | string[]) {
  const candidate = first(value);
  return STATES.includes(candidate as Roster2ScreenState)
    ? (candidate as Roster2ScreenState)
    : "ready";
}
function scopeFrom(value?: string | string[]): RosterScope {
  const candidate = first(value);
  return candidate === "active" || candidate === "pending" ? candidate : "all";
}
function clinicalFrom(value?: string | string[]): ClinicalFilter {
  const candidate = first(value);
  return candidate === "critical" || candidate === "all" ? candidate : "needs-review";
}

export function ActivePatientRoster2Screen() {
  const params = useLocalSearchParams<{
    state?: string;
    scope?: string;
    clinical?: string;
    query?: string;
    ward?: string;
    condition?: string;
    sort?: string;
  }>();
  const [screenState, setScreenState] = useState(() => stateFrom(params.state));
  const [query, setQuery] = useState(() => params.query ?? "");
  const [scope, setScope] = useState<RosterScope>(() => scopeFrom(params.scope));
  const [clinical, setClinical] = useState<ClinicalFilter>(() => clinicalFrom(params.clinical));
  const [ward, setWard] = useState<WardFilter>(() =>
    params.ward === "Ward 2A" ? "Ward 2A" : "All wards",
  );
  const [condition, setCondition] = useState<ConditionFilter>(() =>
    params.condition === "Cardiology" ? "Cardiology" : "All conditions",
  );
  const [sort, setSort] = useState<RosterSort>(() =>
    params.sort === "latest" ? "latest" : "priority",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftWard, setDraftWard] = useState<WardFilter>(ward);
  const [draftCondition, setDraftCondition] = useState<ConditionFilter>(condition);
  const [draftSort, setDraftSort] = useState<RosterSort>(sort);
  const [reviewing, setReviewing] = useState<TriagePatient | null>(null);
  const [decision, setDecision] = useState<{
    intake: PendingIntake;
    action: "accept" | "decline";
  } | null>(null);
  const [intakeOutcome, setIntakeOutcome] = useState<IntakeOutcome>(() =>
    screenState === "intake-accepted"
      ? "accepted"
      : screenState === "intake-error"
        ? "error"
        : null,
  );
  const loading = screenState === "loading";
  const offline = screenState === "offline";
  const advancedCount =
    Number(ward !== "All wards") +
    Number(condition !== "All conditions") +
    Number(sort !== "priority");

  const patients = useMemo(() => {
    if (screenState === "empty" || scope === "pending") return [];
    let matches = TRIAGE_PATIENTS.filter((patient) =>
      `${patient.name} ${patient.ward} ${patient.condition}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    if (clinical === "needs-review")
      matches = matches.filter((patient) => patient.workflowStatus === "needs-review");
    if (clinical === "critical")
      matches = matches.filter((patient) => patient.level === "Critical");
    if (ward !== "All wards") matches = matches.filter((patient) => patient.ward === ward);
    if (condition !== "All conditions")
      matches = matches.filter((patient) => patient.conditionGroup === condition);
    return [...matches].sort((a, b) =>
      sort === "latest"
        ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
        : Number(b.level === "Critical") - Number(a.level === "Critical"),
    );
  }, [clinical, condition, query, scope, screenState, sort, ward]);

  if (reviewing || screenState === "review-saved")
    return (
      <ReviewSaved
        patient={reviewing ?? TRIAGE_PATIENTS[0]}
        onBack={() => {
          setReviewing(null);
          setScreenState("ready");
        }}
      />
    );

  const clearFilters = () => {
    setQuery("");
    setScope("all");
    setClinical("needs-review");
    setWard("All wards");
    setCondition("All conditions");
    setSort("priority");
    setScreenState("ready");
  };
  const openFilters = () => {
    setDraftWard(ward);
    setDraftCondition(condition);
    setDraftSort(sort);
    setFiltersOpen(true);
  };
  const confirmDecision = () => {
    if (!decision) return;
    const outcome = offline ? "error" : decision.action === "accept" ? "accepted" : "declined";
    if (offline) setScreenState("ready");
    setIntakeOutcome(outcome);
    if (outcome === "accepted") setScope("all");
    setDecision(null);
  };
  const retryIntake = () => {
    setScreenState("ready");
    setScope("all");
    setIntakeOutcome("accepted");
  };

  return (
    <PractitionerShell activeTab="patients" hideBack>
      <FlatList
        accessibilityLabel="Patient roster"
        data={loading ? [] : patients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 96, flexGrow: 1 }}
        ListHeaderComponent={
          <RosterHeader
            loading={loading}
            offline={offline}
            query={query}
            onQuery={setQuery}
            scope={scope}
            onScope={setScope}
            clinical={clinical}
            onClinical={setClinical}
            advancedCount={advancedCount}
            ward={ward}
            condition={condition}
            sort={sort}
            onFilters={openFilters}
            onRetry={() => setScreenState("ready")}
            outcome={intakeOutcome}
            onOutcomeRetry={retryIntake}
            onOutcomeCancel={() => setIntakeOutcome(null)}
          />
        }
        renderItem={({ item }) => <TriageCard patient={item} onReview={() => setReviewing(item)} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          loading ? null : scope === "pending" ? (
            <PendingIntakes
              onDecision={(intake, action) => setDecision({ intake, action })}
              outcome={intakeOutcome}
              query={query}
              onClear={clearFilters}
            />
          ) : (
            <EmptyState search={query.length > 0} onClear={clearFilters} />
          )
        }
      />
      <FilterSheet
        visible={filtersOpen}
        ward={draftWard}
        condition={draftCondition}
        sort={draftSort}
        onWard={setDraftWard}
        onCondition={setDraftCondition}
        onSort={setDraftSort}
        onClose={() => setFiltersOpen(false)}
        onClear={() => {
          setDraftWard("All wards");
          setDraftCondition("All conditions");
          setDraftSort("priority");
        }}
        onApply={() => {
          setWard(draftWard);
          setCondition(draftCondition);
          setSort(draftSort);
          setFiltersOpen(false);
        }}
      />
      <DecisionModal
        decision={decision}
        onCancel={() => setDecision(null)}
        onConfirm={confirmDecision}
      />
    </PractitionerShell>
  );
}

function RosterHeader({
  loading,
  offline,
  query,
  onQuery,
  scope,
  onScope,
  clinical,
  onClinical,
  advancedCount,
  ward,
  condition,
  sort,
  onFilters,
  onRetry,
  outcome,
  onOutcomeRetry,
  onOutcomeCancel,
}: {
  loading: boolean;
  offline: boolean;
  query: string;
  onQuery: (v: string) => void;
  scope: RosterScope;
  onScope: (v: RosterScope) => void;
  clinical: ClinicalFilter;
  onClinical: (v: ClinicalFilter) => void;
  advancedCount: number;
  ward: WardFilter;
  condition: ConditionFilter;
  sort: RosterSort;
  onFilters: () => void;
  onRetry: () => void;
  outcome: IntakeOutcome;
  onOutcomeRetry: () => void;
  onOutcomeCancel: () => void;
}) {
  if (loading)
    return (
      <View>
        <Text className="font-headline-xl text-headline-xl text-on-surface">Patient roster</Text>
        <Text className="mt-1 font-body-md text-body-md text-on-surface-variant">
          Loading patient observations.
        </Text>
        <View className="mt-6 gap-3" accessibilityLabel="Loading patient roster">
          <View className="h-56 rounded-card bg-surface-container" />
          <View className="h-56 rounded-card bg-surface-container" />
        </View>
      </View>
    );
  return (
    <View>
      <Text className="font-headline-xl text-headline-xl text-on-surface">Patient roster</Text>
      <Text className="mt-1 font-body-md text-body-md text-on-surface-variant">
        {outcome === "accepted"
          ? "13 active patients · 1 intake accepted"
          : outcome === "error"
            ? "Intake response not saved"
            : scope === "pending"
              ? "1 pending intake request"
              : `${TRIAGE_PATIENTS.length} patients · ${NEEDS_REVIEW_COUNT} need review`}
      </Text>
      {offline ? <OfflineBanner onRetry={onRetry} /> : null}
      {outcome ? (
        <OutcomeBanner outcome={outcome} onRetry={onOutcomeRetry} onCancel={onOutcomeCancel} />
      ) : null}
      <View className="mt-4">
        <SearchField
          value={query}
          onChangeText={onQuery}
          placeholder="Search patient or ward"
          accessibilityLabel="Search patient or ward"
        />
      </View>
      <Text className="mt-4 font-label-sm text-label-sm text-on-surface-variant">Care scope</Text>
      <View className="mt-2" accessibilityRole="radiogroup" accessibilityLabel="Care scope">
        <ChoiceChipRow>
          {(["all", "active", "pending"] as const).map((value) => (
            <ChoiceChip
              key={value}
              label={value === "all" ? "All patients" : value === "active" ? "Active" : "Pending"}
              selected={scope === value}
              onPress={() => onScope(value)}
              role="radio"
            />
          ))}
        </ChoiceChipRow>
      </View>
      <Text className="mt-4 font-label-sm text-label-sm text-on-surface-variant">
        Clinical filters
      </Text>
      <View className="mt-2">
        <ChoiceChipRow>
          <ChoiceChip
            label={`Needs review · ${NEEDS_REVIEW_COUNT}`}
            selected={clinical === "needs-review"}
            onPress={() => onClinical(clinical === "needs-review" ? "all" : "needs-review")}
          />
          <ChoiceChip
            label="Critical"
            selected={clinical === "critical"}
            onPress={() => onClinical(clinical === "critical" ? "all" : "critical")}
          />
          <ChoiceChip
            label={`Filters${advancedCount ? ` · ${advancedCount}` : ""}`}
            selected={advancedCount > 0}
            showSelectedCheck={false}
            onPress={onFilters}
          />
        </ChoiceChipRow>
      </View>
      {advancedCount ? (
        <Text className="mt-3 font-label-sm text-label-sm text-on-surface-variant">
          Applied: {ward !== "All wards" ? ward : ""}
          {ward !== "All wards" && condition !== "All conditions" ? " · " : ""}
          {condition !== "All conditions" ? condition : ""}
          {`${ward !== "All wards" || condition !== "All conditions" ? " · " : ""}${sort === "latest" ? "Latest" : "Priority"}`}
        </Text>
      ) : null}
      <Text className="mt-5 font-headline-md text-headline-md text-on-surface">
        {scope === "pending"
          ? "Pending intake"
          : sort === "latest"
            ? "Latest roster updates"
            : "Priority queue"}
      </Text>
      <Text className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
        {scope === "pending"
          ? "Review new referrals before they enter active care."
          : "Ordered by clinical priority."}
      </Text>
    </View>
  );
}

function FilterSheet({
  visible,
  ward,
  condition,
  sort,
  onWard,
  onCondition,
  onSort,
  onClose,
  onClear,
  onApply,
}: {
  visible: boolean;
  ward: WardFilter;
  condition: ConditionFilter;
  sort: RosterSort;
  onWard: (v: WardFilter) => void;
  onCondition: (v: ConditionFilter) => void;
  onSort: (v: RosterSort) => void;
  onClose: () => void;
  onClear: () => void;
  onApply: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-scrim/40" onPress={onClose}>
        <Pressable
          accessibilityViewIsModal
          className="rounded-t-card bg-surface p-4 pb-8"
          onPress={(event) => event.stopPropagation()}
        >
          <Text className="font-headline-xl text-headline-xl text-on-surface">Filters</Text>
          <Text className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Refine the roster without losing your search.
          </Text>
          <FilterGroup label="Ward">
            <ChoiceChipRow>
              <ChoiceChip
                label="All wards"
                selected={ward === "All wards"}
                onPress={() => onWard("All wards")}
                role="radio"
              />
              <ChoiceChip
                label="Ward 2A"
                selected={ward === "Ward 2A"}
                onPress={() => onWard("Ward 2A")}
                role="radio"
              />
            </ChoiceChipRow>
          </FilterGroup>
          <FilterGroup label="Condition">
            <ChoiceChipRow>
              <ChoiceChip
                label="All conditions"
                selected={condition === "All conditions"}
                onPress={() => onCondition("All conditions")}
                role="radio"
              />
              <ChoiceChip
                label="Cardiology"
                selected={condition === "Cardiology"}
                onPress={() => onCondition("Cardiology")}
                role="radio"
              />
            </ChoiceChipRow>
          </FilterGroup>
          <FilterGroup label="Sort">
            <ChoiceChipRow>
              <ChoiceChip
                label="Priority"
                selected={sort === "priority"}
                onPress={() => onSort("priority")}
                role="radio"
              />
              <ChoiceChip
                label="Latest"
                selected={sort === "latest"}
                onPress={() => onSort("latest")}
                role="radio"
              />
            </ChoiceChipRow>
          </FilterGroup>
          <View className="mt-6 flex-row gap-3">
            <View className="flex-1">
              <Button label="Clear" variant="outline" shadow={false} onPress={onClear} />
            </View>
            <View className="flex-1">
              <Button label="Apply filters" shadow={false} onPress={onApply} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="mt-5">
      <Text className="mb-2 font-label-md text-label-md text-on-surface">{label}</Text>
      {children}
    </View>
  );
}

function PendingIntakes({
  onDecision,
  outcome,
  query,
  onClear,
}: {
  onDecision: (intake: PendingIntake, action: "accept" | "decline") => void;
  outcome: IntakeOutcome;
  query: string;
  onClear: () => void;
}) {
  if (outcome === "accepted" || outcome === "declined") return null;
  const matches = PENDING_INTAKES.filter((intake) =>
    `${intake.name} ${intake.referralReason} ${intake.referredBy}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  if (!matches.length) return <EmptyState search={Boolean(query)} onClear={onClear} />;
  return (
    <View className="mt-4">
      {matches.map((intake) => (
        <Card key={intake.id} className="p-4">
          <View className="flex-row items-center gap-3">
            <AvatarWithFallback initials={intake.initials} label={intake.name} tone="tertiary" />
            <View className="flex-1">
              <Text className="font-headline-md text-headline-md text-on-surface">
                {intake.name}
              </Text>
              <Badge label="Pending review" tone="info" />
            </View>
          </View>
          <Text className="mt-4 font-body-md text-body-md text-on-surface">
            {intake.referralReason}
          </Text>
          <Text className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
            Referred by {intake.referredBy}
          </Text>
          <View className="mt-5 flex-row gap-3">
            <View className="flex-1">
              <Button label="Accept" shadow={false} onPress={() => onDecision(intake, "accept")} />
            </View>
            <View className="flex-1">
              <Button
                label="Decline"
                variant="outline"
                shadow={false}
                onPress={() => onDecision(intake, "decline")}
              />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

function DecisionModal({
  decision,
  onCancel,
  onConfirm,
}: {
  decision: { intake: PendingIntake; action: "accept" | "decline" } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={Boolean(decision)} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-scrim/40 px-6">
        <Card className="w-full p-5">
          <Text className="font-headline-md text-headline-md text-on-surface">
            {decision?.action === "accept" ? "Accept intake?" : "Decline intake?"}
          </Text>
          <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
            Confirm this action for {decision?.intake.name}.
          </Text>
          <View className="mt-5 flex-row gap-3">
            <View className="flex-1">
              <Button label="Cancel" variant="outline" shadow={false} onPress={onCancel} />
            </View>
            <View className="flex-1">
              <Button label="Confirm" shadow={false} onPress={onConfirm} />
            </View>
          </View>
        </Card>
      </View>
    </Modal>
  );
}

function OutcomeBanner({
  outcome,
  onRetry,
  onCancel,
}: {
  outcome: Exclude<IntakeOutcome, null>;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const accepted = outcome === "accepted";
  const declined = outcome === "declined";
  return (
    <Card
      className={`mt-4 p-4 ${outcome === "error" ? "bg-error-container" : "bg-success-container"}`}
    >
      <Text
        className={`font-headline-md text-headline-md ${outcome === "error" ? "text-on-error-container" : "text-on-success-container"}`}
      >
        {accepted ? "Intake accepted" : declined ? "Intake declined" : "Couldn’t update intake"}
      </Text>
      <Text
        className={`mt-1 font-body-md text-body-md ${outcome === "error" ? "text-on-error-container" : "text-on-success-container"}`}
      >
        {accepted
          ? "Marcus Chen is now in your active care roster."
          : declined
            ? "The referral was declined and removed from the queue."
            : "Check your connection and try again."}
      </Text>
      {accepted ? (
        <View className="mt-4">
          <Button
            label="View patient"
            fullWidth={false}
            shadow={false}
            onPress={() =>
              router.push({
                pathname: "/(app)/patient-record",
                params: { id: "marcus-chen" },
              } as unknown as Href)
            }
          />
        </View>
      ) : outcome === "error" ? (
        <View className="mt-4 flex-row gap-3">
          <View className="flex-1">
            <Button label="Try again" shadow={false} onPress={onRetry} />
          </View>
          <View className="flex-1">
            <Button label="Cancel" variant="outline" shadow={false} onPress={onCancel} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}
function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mt-4 bg-error-container p-4">
      <Text className="font-headline-md text-headline-md text-on-error-container">
        Roster unavailable
      </Text>
      <Text className="mt-1 font-body-md text-body-md text-on-error-container">
        Reconnect to refresh the roster. Your selected filters are retained.
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

function TriageCard({ patient, onReview }: { patient: TriagePatient; onReview: () => void }) {
  const critical = patient.level === "Critical";
  const openRecord = () =>
    router.push({
      pathname: "/(app)/patient-record",
      params: { id: patient.id },
    } as unknown as Href);
  return (
    <Card className="p-4">
      <View className="flex-row items-center gap-3">
        <AvatarWithFallback
          initials={patient.initials}
          label={patient.name}
          tone={critical ? "tertiary" : "secondary"}
        />
        <View className="min-w-0 flex-1">
          <Text className="font-headline-md text-headline-md text-on-surface">{patient.name}</Text>
          <Text className="mt-1 font-label-md text-label-md text-on-surface-variant">
            {patient.ward} · {patient.age} years
          </Text>
        </View>
      </View>
      <View className="mt-3">
        <Badge
          label={critical ? "Critical · abnormal vital signs" : "Stable · care-plan follow-up"}
          tone={critical ? "error" : "success"}
        />
      </View>
      <Text className="mt-3 font-body-md text-body-md text-on-surface">{patient.condition}</Text>
      <View className="mt-4 flex-row overflow-hidden rounded-md border border-outline-variant">
        {patient.metrics.map((metric) => (
          <Metric key={metric.label} metric={metric} />
        ))}
      </View>
      <View className="mt-4 flex-row items-center justify-between gap-3 border-t border-outline-variant pt-3">
        <Text className="flex-1 font-label-sm text-label-sm text-on-surface-variant">
          {patient.updated}
        </Text>
        <Button
          label={critical ? "Review now" : "View record"}
          size="md"
          fullWidth={false}
          shadow={false}
          onPress={critical ? onReview : openRecord}
        />
      </View>
      <Text className="mt-4 font-label-sm text-label-sm text-on-surface-variant">
        Latest clinical note
      </Text>
      {/* `body-md`, not the `body-sm` this had: that class does not exist in
              tailwind.config.js, and NativeWind drops unknown utilities silently,
              so a clinical note was rendering in RN's default system font. The ramp
              has no regular-weight 14 step — if the design wants one, it needs
              adding to BRAND rather than invented at a call site. */}
          <Text className="mt-1 font-body-md text-body-md text-on-surface">
            {patient.clinicalNote}
          </Text>
    </Card>
  );
}
function Metric({ metric }: { metric: TriageMetric }) {
  const alert = metric.status === "critical";
  return (
    <View className={`flex-1 p-3 ${alert ? "bg-error-container" : "bg-surface"}`}>
      <Text
        className={`font-label-sm text-label-sm ${alert ? "text-on-error-container" : "text-on-surface-variant"}`}
      >
        {metric.label}
      </Text>
      <Text
        className={`mt-1 font-label-md text-label-md ${alert ? "text-on-error-container" : "text-on-surface"}`}
      >
        {metric.value}
      </Text>
      {metric.unit ? (
        <Text className="font-label-sm text-label-sm text-on-surface-variant">{metric.unit}</Text>
      ) : null}
    </View>
  );
}
function EmptyState({ search, onClear }: { search: boolean; onClear: () => void }) {
  return (
    <View className="items-center px-5 py-16">
      <Text className="font-headline-md text-headline-md text-on-surface">
        {search ? "No patients match your search" : "No matches for these filters"}
      </Text>
      <Text className="mt-2 text-center font-body-md text-body-md text-on-surface-variant">
        {search
          ? "Clear the search or try another patient or ward."
          : "Clear filters or choose a different ward or condition."}
      </Text>
      <View className="mt-6">
        <Button
          label="Clear filters"
          variant="outline"
          fullWidth={false}
          shadow={false}
          onPress={onClear}
        />
      </View>
    </View>
  );
}
function ReviewSaved({ patient, onBack }: { patient: TriagePatient; onBack: () => void }) {
  // The panel is `success-container`, so everything on it takes
  // `on-success-container`. It previously mixed `success` (the full-strength
  // accent) and `on-surface` on that fill — the accent-on-container mispairing
  // docs/BRAND.md records as having shipped three times as illegible dark mode.
  const onSuccessContainer = useTokenColor("on-success-container");
  return (
    <DetailShell title="Review patient" onBack={onBack}>
      <View className="flex-1 px-4 pt-6">
        <Card className="bg-success-container p-6">
          <Icon chrome="check" size={28} color={onSuccessContainer} />
          <Text className="mt-3 text-center font-headline-md text-headline-md text-on-success-container">
            Review saved
          </Text>
          <Text className="mt-2 text-center font-body-md text-body-md text-on-success-container">
            {patient.name}&apos;s critical-care review was recorded.
          </Text>
        </Card>
        <View className="mt-8">
          <Button label="Back to roster" shadow={false} onPress={onBack} />
        </View>
      </View>
    </DetailShell>
  );
}
