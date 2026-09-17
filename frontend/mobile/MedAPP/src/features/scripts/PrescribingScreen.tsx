import { useEffect, useRef, useState } from "react";
import { FlatList, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { z } from "zod";
import { DetailShell } from "@/components/shell";
import {
  Button,
  Card,
  ConsentRow,
  ErrorPanel,
  InfoCallout,
  Input,
  KeyboardInset,
  SkeletonCard,
} from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { careApi } from "@/features/care/api";
import { ApiError } from "@/types/api";
import {
  clinicalApi,
  draftSchema,
  prescriptionStatus,
  type ClinicalDraft,
  type ClinicalPrescription,
  type Medicine,
  type PrescriptionOperation,
} from "./clinical-api";
import { PrescriptionContents } from "./ClinicalPrescriptionScreens";

const text = "font-body-md text-body-md text-on-surface";
const blankMedicine = (): Medicine => ({
  drug_name: "",
  strength: "",
  form: "",
  dose: "",
  route: "",
  frequency: "",
  duration: "",
  quantity: 0,
  instructions: "",
});
const blankDraft = (): ClinicalDraft => ({
  items: [blankMedicine()],
  clinical_goal: "",
  valid_until: "",
});
type Attempt = { id?: string; operation: PrescriptionOperation; body: unknown; key: string };

function Field({
  label,
  value,
  onChange,
  maxLength = 200,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <View className="gap-xs">
      <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
      <Input
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        maxLength={maxLength}
        editable={!disabled}
      />
    </View>
  );
}

function Prescribing({
  patientId,
  scope,
}: {
  patientId: string;
  scope: ReturnType<typeof useSessionScope>;
}) {
  const [offset, setOffset] = useState(0);
  const [rx, setRx] = useState<ClinicalPrescription | null>(null);
  const [draft, setDraft] = useState<ClinicalDraft>(blankDraft);
  const [mode, setMode] = useState<
    "list" | "edit" | "review" | "detail" | "cancel" | "correct" | "pharmacy"
  >("list");
  const [reviewed, setReviewed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState<Attempt | null>(null);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () => mounted.current && scope.isCurrent();
  const allowed =
    scope.user?.accountRole === "doctor" && z.string().uuid().safeParse(patientId).success;
  const query = useQuery({
    queryKey: ["prescribing", scope.owner, scope.revision, patientId, offset],
    enabled: allowed,
    gcTime: 0,
    staleTime: 0,
    queryFn: ({ signal }) =>
      clinicalApi.list(patientId, offset, { signal, isSessionCurrent: scope.isCurrent }),
  });
  const [search, setSearch] = useState("");
  const [pharmacyOffset, setPharmacyOffset] = useState(0);
  const [selectedPharmacy, setSelectedPharmacy] = useState<{ id: string; name: string } | null>(
    null,
  );
  const pharmacies = useQuery({
    queryKey: ["prescribing-pharmacies", search, pharmacyOffset],
    enabled: mode === "pharmacy" && allowed,
    queryFn: ({ signal }) =>
      careApi.listDirectoryPage(
        "pharmacies",
        { q: search, offset: pharmacyOffset, limit: 20 },
        { signal, isSessionCurrent: scope.isCurrent },
      ),
  });
  const locked = busy || !!uncertain || stale;

  async function execute(attempt: Attempt) {
    if (pending.current || !current()) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    let acknowledged = false;
    try {
      const receipt = await clinicalApi.command(
        patientId,
        attempt.id,
        attempt.operation,
        attempt.body,
        attempt.key,
        { isSessionCurrent: current },
      );
      acknowledged = true;
      if (!current()) return;
      const result = await clinicalApi.detail(patientId, receipt.id, { isSessionCurrent: current });
      if (!current()) return;
      setUncertain(null);
      setRx(result);
      setReviewed(false);
      setStale(false);
      if (result.status === "draft") {
        setDraft({
          items: result.items,
          clinical_goal: result.clinical_goal,
          valid_until: result.valid_until,
        });
        setMode(attempt.operation === "correct" ? "edit" : "review");
      } else setMode("detail");
      setNotice(
        attempt.operation === "issue" && result.status === "issued"
          ? "Prescription issued and available to the patient."
          : attempt.operation === "route" &&
              result.status === "issued" &&
              result.deliveries.some(
                (delivery) => delivery.state === "queued" || delivery.state === "sending",
              )
            ? "Pharmacy delivery queued. Confirmation will appear in the handoff status."
            : "Prescription saved.",
      );
      void query.refetch();
    } catch (failure) {
      if (!current()) return;
      setError(
        failure instanceof ApiError
          ? failure.message
          : "The result could not be confirmed. Retry the same request.",
      );
      if (
        acknowledged ||
        !(failure instanceof ApiError) ||
        failure.status === 0 ||
        failure.status >= 500 ||
        failure.status === 408
      )
        setUncertain(attempt);
      else if (failure.status === 409) setStale(true);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function command(operation: PrescriptionOperation, body: unknown) {
    if (!locked) void execute({ id: rx?.id, operation, body, key: randomUUID() });
  }
  async function open(record: ClinicalPrescription) {
    if (pending.current || !current()) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const fresh = await clinicalApi.detail(patientId, record.id, { isSessionCurrent: current });
      if (!current()) return;
      setRx(fresh);
      setDraft({
        items: fresh.items,
        clinical_goal: fresh.clinical_goal,
        valid_until: fresh.valid_until,
      });
      setMode(fresh.status === "draft" ? "edit" : "detail");
      setReviewed(false);
      setStale(false);
      setNotice(null);
    } catch (failure) {
      if (current())
        setError(
          failure instanceof ApiError ? failure.message : "Could not reload the prescription.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function save() {
    const parsed = draftSchema.safeParse(draft);
    if (!parsed.success) {
      setError(
        "Complete each medicine, its dose, route, frequency, duration, quantity, and a valid YYYY-MM-DD dispensing expiry.",
      );
      return;
    }
    command(rx ? "update" : "create", rx ? { ...parsed.data, version: rx.version } : parsed.data);
  }
  function navigateBack() {
    if (locked) return;
    if (mode !== "list") {
      setMode("list");
      setRx(null);
      setError(null);
      setNotice(null);
    } else if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/(app)/patient-record", params: { id: patientId } } as Href);
  }
  const feedback = (
    <View className="gap-sm">
      {error ? <InfoCallout tone="error">{error}</InfoCallout> : null}
      {notice ? (
        <View accessibilityLiveRegion="polite">
          <InfoCallout>{notice}</InfoCallout>
        </View>
      ) : null}
      {uncertain ? (
        <>
          <InfoCallout>
            The request may have saved. Keep the contents unchanged and retry to retrieve its
            result.
          </InfoCallout>
          <Button
            label="Retry the same request"
            disabled={busy}
            onPress={() => void execute(uncertain)}
          />
        </>
      ) : null}
      {stale ? (
        <Button
          label="Reload saved record"
          disabled={busy}
          onPress={() => (rx ? void open(rx) : (setStale(false), void query.refetch()))}
        />
      ) : null}
    </View>
  );

  if (!allowed)
    return (
      <DetailShell title="Prescribing" onBack={() => router.back()}>
        <View className="p-md">
          <InfoCallout>
            Prescribing is available to verified doctors from an authorized patient record.
          </InfoCallout>
        </View>
      </DetailShell>
    );
  if (query.isPending)
    return (
      <DetailShell title="Prescribing" onBack={navigateBack}>
        <SkeletonCard shape="provider-card" count={2} />
      </DetailShell>
    );
  if (query.error && mode === "list")
    return (
      <DetailShell title="Prescribing" onBack={navigateBack}>
        <ErrorPanel
          title="Prescribing access unavailable"
          body={
            query.error instanceof ApiError
              ? query.error.message
              : "Your approval and patient permission could not be checked."
          }
          retry={() => query.refetch()}
        />
      </DetailShell>
    );
  if (mode === "list")
    return (
      <DetailShell title="Patient prescriptions" onBack={navigateBack}>
        <FlatList
          data={query.data?.items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
          refreshing={query.isFetching}
          onRefresh={() => void query.refetch()}
          ListHeaderComponent={
            <View className="gap-sm">
              {feedback}
              <Text selectable className={text}>
                Patient {patientId}
              </Text>
              <Button
                label="Create prescription"
                disabled={busy}
                onPress={() => {
                  setRx(null);
                  setDraft(blankDraft());
                  setMode("edit");
                  setError(null);
                  setNotice(null);
                }}
              />
            </View>
          }
          ListEmptyComponent={
            <Text className={text}>No prescriptions recorded for this patient.</Text>
          }
          renderItem={({ item }) => (
            <Card className="gap-sm">
              <Text className="font-headline-md text-headline-md text-on-surface">
                {item.items.map((line) => line.drug_name).join(", ")}
              </Text>
              <Text className={text}>
                {prescriptionStatus(item)} · {item.prescriber_name}
              </Text>
              <Button
                label="Open prescription"
                variant="outline"
                disabled={busy}
                onPress={() => void open(item)}
              />
            </Card>
          )}
          ListFooterComponent={
            <View className="gap-sm">
              {offset ? (
                <Button
                  label="Previous prescriptions"
                  variant="outline"
                  onPress={() => setOffset(offset - 25)}
                />
              ) : null}
              {query.data?.next_offset != null ? (
                <Button
                  label="More prescriptions"
                  onPress={() => setOffset(query.data!.next_offset!)}
                />
              ) : null}
            </View>
          }
        />
      </DetailShell>
    );

  const own = rx?.author_id === scope.owner;
  return (
    <DetailShell
      title={
        mode === "edit"
          ? "Issue prescription"
          : mode === "review"
            ? "Review prescription"
            : "Prescription"
      }
      onBack={navigateBack}
    >
      <KeyboardInset>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}
        >
          {feedback}
          <Text selectable className="font-label-md text-label-md text-on-surface">
            Patient {patientId}
          </Text>
          {mode === "edit" ? (
            <>
              {draft.items.map((item, index) => (
                <Card key={index} className="gap-sm">
                  <Text className="font-headline-md text-headline-md text-on-surface">
                    Medicine {index + 1}
                  </Text>
                  {(
                    [
                      ["drug_name", "Medicine name", 255],
                      ["strength", "Strength", 64],
                      ["form", "Form (for example, tablet or capsule)", 64],
                      ["dose", "Dose", 80],
                      ["route", "Route", 40],
                      ["frequency", "Frequency", 80],
                      ["duration", "Duration", 80],
                      ["instructions", "Patient instructions", 200],
                    ] as const
                  ).map(([key, label, maxLength]) => (
                    <Field
                      key={key}
                      label={`${label} ${index + 1}`}
                      value={item[key]}
                      maxLength={maxLength}
                      disabled={locked}
                      onChange={(value) =>
                        setDraft({
                          ...draft,
                          items: draft.items.map((line, i) =>
                            i === index ? { ...line, [key]: value } : line,
                          ),
                        })
                      }
                    />
                  ))}
                  <Field
                    label={`Dispense quantity ${index + 1}`}
                    value={item.quantity ? String(item.quantity) : ""}
                    maxLength={7}
                    disabled={locked}
                    onChange={(value) => {
                      if (/^\d*$/.test(value))
                        setDraft({
                          ...draft,
                          items: draft.items.map((line, i) =>
                            i === index ? { ...line, quantity: Number(value) } : line,
                          ),
                        });
                    }}
                  />
                  {draft.items.length > 1 ? (
                    <Button
                      label={`Remove medicine ${index + 1}`}
                      variant="outline"
                      disabled={locked}
                      onPress={() =>
                        setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })
                      }
                    />
                  ) : null}
                </Card>
              ))}
              {draft.items.length < 20 ? (
                <Button
                  label="Add medicine"
                  variant="outline"
                  disabled={locked}
                  onPress={() => setDraft({ ...draft, items: [...draft.items, blankMedicine()] })}
                />
              ) : null}
              <Card className="gap-sm">
                <Field
                  label="Clinical goal (optional)"
                  value={draft.clinical_goal}
                  maxLength={500}
                  disabled={locked}
                  onChange={(value) => setDraft({ ...draft, clinical_goal: value })}
                />
                <Field
                  label="Valid for dispensing through (YYYY-MM-DD, UTC)"
                  value={draft.valid_until}
                  maxLength={10}
                  disabled={locked}
                  onChange={(value) => setDraft({ ...draft, valid_until: value })}
                />
              </Card>
              <InfoCallout>
                Enter the complete medicine name and strength. Confirm dose, directions and total
                quantity yourself. Automated allergy and interaction checks are not available.
              </InfoCallout>
              <Button
                label={busy ? "Saving…" : "Save draft and review"}
                disabled={locked}
                onPress={save}
              />
            </>
          ) : rx ? (
            <>
              <PrescriptionContents rx={rx} />
              {mode === "review" && own ? (
                <>
                  <ConsentRow
                    checked={reviewed}
                    onChange={(value) => {
                      if (!locked) setReviewed(value);
                    }}
                    accessibilityLabel="I reviewed the patient, medicines, allergies, directions and quantities"
                    labelPressable
                  >
                    I reviewed the patient, medicines, allergies, directions and quantities.
                  </ConsentRow>
                  <Button
                    label="Issue prescription"
                    disabled={locked || !reviewed}
                    onPress={() =>
                      command("issue", { version: rx.version, clinical_review_confirmed: true })
                    }
                  />
                  <Button
                    label="Edit draft"
                    variant="outline"
                    disabled={locked}
                    onPress={() => setMode("edit")}
                  />
                </>
              ) : null}
              {(mode === "cancel" || mode === "correct") && own ? (
                <Card className="gap-sm">
                  <InfoCallout>
                    {mode === "cancel"
                      ? "This withdraws the prescription. Previously supplied quantities remain in the pharmacy history. Pharmacy withdrawal may still be pending."
                      : "This withdraws the original and creates a replacement draft. Review and issue the replacement separately."}
                  </InfoCallout>
                  <Field
                    label="Reason for this change"
                    value={reason}
                    maxLength={500}
                    disabled={locked}
                    onChange={setReason}
                  />
                  <Button
                    label={mode === "cancel" ? "Confirm cancellation" : "Create replacement draft"}
                    disabled={locked || reason.trim().length < 3}
                    onPress={() => command(mode, { version: rx.version, reason: reason.trim() })}
                  />
                </Card>
              ) : null}
              {mode === "pharmacy" && own ? (
                <Card className="gap-sm">
                  <Field
                    label="Search pharmacy"
                    value={search}
                    disabled={locked}
                    onChange={(value) => {
                      setSearch(value);
                      setPharmacyOffset(0);
                      setSelectedPharmacy(null);
                    }}
                  />
                  {pharmacies.isPending ? (
                    <Text className={text}>Loading pharmacies…</Text>
                  ) : pharmacies.error ? (
                    <ErrorPanel
                      title="Could not load pharmacies"
                      body="Try the directory again."
                      retry={() => pharmacies.refetch()}
                    />
                  ) : (
                    <>
                      {pharmacies.data?.entries.map((entry) => (
                        <Button
                          key={entry.id}
                          label={`Select ${entry.name}`}
                          variant={selectedPharmacy?.id === entry.id ? "primary" : "outline"}
                          disabled={locked}
                          onPress={() => setSelectedPharmacy({ id: entry.id, name: entry.name })}
                        />
                      ))}
                      {!pharmacies.data?.entries.length ? (
                        <Text className={text}>No matching pharmacies.</Text>
                      ) : null}
                      {pharmacyOffset > 0 ? (
                        <Button
                          label="Previous pharmacies"
                          disabled={locked}
                          variant="outline"
                          onPress={() => setPharmacyOffset(pharmacyOffset - 20)}
                        />
                      ) : null}
                      {pharmacies.data?.nextOffset != null ? (
                        <Button
                          label="More pharmacies"
                          disabled={locked}
                          variant="outline"
                          onPress={() => setPharmacyOffset(pharmacies.data!.nextOffset!)}
                        />
                      ) : null}
                    </>
                  )}
                  {selectedPharmacy ? (
                    <>
                      <InfoCallout>
                        Send this prescription to {selectedPharmacy.name}. The pharmacy must confirm
                        receipt before collection can be arranged.
                      </InfoCallout>
                      <Button
                        label="Confirm pharmacy handoff"
                        disabled={locked}
                        onPress={() =>
                          command("route", {
                            version: rx.version,
                            pharmacy_id: selectedPharmacy.id,
                          })
                        }
                      />
                    </>
                  ) : null}
                </Card>
              ) : null}
              {mode === "detail" && own ? (
                <View className="gap-sm">
                  {rx.status === "issued" && !rx.pharmacy_id ? (
                    <Button
                      label="Choose pharmacy"
                      disabled={locked}
                      onPress={() => setMode("pharmacy")}
                    />
                  ) : null}
                  {rx.status === "issued" || rx.status === "draft" ? (
                    <Button
                      label="Cancel prescription"
                      variant="outline"
                      disabled={locked}
                      onPress={() => {
                        setReason("");
                        setMode("cancel");
                      }}
                    />
                  ) : null}
                  {(rx.status === "issued" || rx.status === "cancelled") && !rx.replacement_id ? (
                    <Button
                      label="Prepare correction"
                      variant="outline"
                      disabled={locked}
                      onPress={() => {
                        setReason("");
                        setMode("correct");
                      }}
                    />
                  ) : null}
                  {rx.deliveries.some((delivery) => delivery.state === "attention") ? (
                    <Button
                      label="Retry pharmacy handoff"
                      disabled={locked}
                      onPress={() => command("retry", { version: rx.version })}
                    />
                  ) : null}
                </View>
              ) : null}
              <Button
                label="Refresh saved prescription"
                variant="outline"
                disabled={locked}
                onPress={() => void open(rx)}
              />
            </>
          ) : null}
          <Button
            label="Back to patient prescriptions"
            variant="outline"
            disabled={locked}
            onPress={() => {
              setMode("list");
              setRx(null);
              setError(null);
              void query.refetch();
            }}
          />
        </ScrollView>
      </KeyboardInset>
    </DetailShell>
  );
}

export function PrescribingScreen() {
  const params = useLocalSearchParams<{ patientId?: string }>();
  const scope = useSessionScope();
  const patientId = typeof params.patientId === "string" ? params.patientId : "";
  return (
    <Prescribing
      key={`${scope.owner}:${scope.revision}:${patientId}`}
      patientId={patientId}
      scope={scope}
    />
  );
}
