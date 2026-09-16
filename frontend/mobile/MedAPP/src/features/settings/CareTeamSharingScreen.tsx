import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell/DetailShell";
import {
  Badge,
  Button,
  Card,
  ConsentRow,
  InfoCallout,
  Input,
  KeyboardInset,
} from "@/components/ui";
import { useAuthStore } from "@/store/auth-store";
import { useTokenColor } from "@/lib/tokens";
import { useDebouncedValue } from "@/features/care/hooks/use-debounced-value";
import { ApiError } from "@/types/api";
import {
  careTeamApi,
  permissionLabel,
  type CareClinician,
  type CareConsent,
  type ClinicianRole,
  type ConsentDuration,
} from "./care-team-api";

type Choice =
  { kind: "grant"; clinician: CareClinician } | { kind: "revoke"; consent: CareConsent };

export function CareTeamSharingScreen() {
  const revision = useAuthStore((state) => state.revision);
  const owner = useAuthStore((state) => state.user?.id);
  if (!owner) return null;
  return <SharingContent key={`${owner}:${revision}`} owner={owner} revision={revision} />;
}

function SharingContent({ owner, revision }: { owner: string; revision: number }) {
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  const pending = useRef(false);
  const isCurrent = useCallback(
    () =>
      mounted.current &&
      useAuthStore.getState().revision === revision &&
      useAuthStore.getState().user?.id === owner &&
      useAuthStore.getState().isAuthenticated,
    [owner, revision],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const api = careTeamApi(isCurrent);
  const [history, setHistory] = useState(false);
  const [role, setRole] = useState<ClinicianRole>("doctor");
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim());
  const [choice, setChoice] = useState<Choice | null>(null);
  const [allowVitals, setAllowVitals] = useState(false);
  const [duration, setDuration] = useState<ConsentDuration>(30);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scrim = useTokenColor("scrim", 0.4);
  const consents = useInfiniteQuery({
    queryKey: ["patient-consents", owner, history],
    queryFn: ({ pageParam }) => api.list(owner, pageParam, history),
    initialPageParam: 0,
    getNextPageParam: (page) => page.next_offset ?? undefined,
    gcTime: 0,
  });
  const directory = useQuery({
    queryKey: ["care-team-clinicians", owner, role, query],
    queryFn: ({ signal }) => api.search(role, query, signal),
    enabled: query.length >= 2,
    gcTime: 0,
  });
  const items = [
    ...new Map(
      consents.data?.pages.flatMap((page) => page.items).map((item) => [item.consent_id, item]) ??
        [],
    ).values(),
  ];
  const clinicians = directory.data?.filter((person) => person.userId !== owner) ?? [];

  function select(next: Choice) {
    setChoice(next);
    setAllowVitals(false);
    setDuration(30);
    setError(null);
    setNotice(null);
    setUncertain(false);
  }
  function close() {
    if (!pending.current) {
      setChoice(null);
      setError(null);
      setUncertain(false);
    }
  }
  async function finish(message: string) {
    if (!isCurrent()) return;
    setChoice(null);
    setError(null);
    setUncertain(false);
    setNotice(message);
    await queryClient.invalidateQueries({ queryKey: ["patient-consents", owner] });
  }
  async function submit() {
    if (!choice || pending.current || !isCurrent() || uncertain) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (choice.kind === "grant") {
        await api.grant(owner, choice.clinician.userId, allowVitals, duration);
        await finish("Sharing permission saved.");
      } else {
        await api.revoke(owner, choice.consent.consent_id);
        await finish("Sharing permission revoked. Previously added vitals remain in your record.");
      }
    } catch (failure) {
      if (!isCurrent()) return;
      setError(
        failure instanceof ApiError ? failure.message : "Couldn't update sharing. Try again.",
      );
      if (
        failure instanceof ApiError &&
        (failure.isNetwork || failure.status === 409 || failure.status >= 500)
      )
        setUncertain(true);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function checkOutcome() {
    if (!choice || pending.current || !isCurrent()) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const clinicianId =
        choice.kind === "grant" ? choice.clinician.userId : choice.consent.doctor_user_id;
      // The active list is filtered to this clinician, so paging cannot hide the outcome.
      const page = await api.list(owner, 0, false, clinicianId);
      if (!isCurrent()) return;
      if (
        choice.kind === "grant" &&
        page.items.some(
          (entry) => entry.scope === "records" || entry.scope === "records_and_vitals",
        )
      )
        await finish(
          "This clinician already has an active permission. Review it below before making changes.",
        );
      else if (
        choice.kind === "revoke" &&
        !page.items.some((entry) => entry.consent_id === choice.consent.consent_id)
      )
        await finish("This sharing permission is no longer active.");
      else {
        setUncertain(false);
        setError("The requested change hasn't taken effect. You can try again.");
      }
    } catch (failure) {
      if (isCurrent())
        setError(
          failure instanceof ApiError ? failure.message : "Couldn't check sharing. Try again.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const chosenName =
    choice?.kind === "grant"
      ? choice.clinician.name
      : (choice?.consent.clinician_display_name ?? "Clinician details unavailable");
  return (
    <DetailShell
      title="Care-team sharing"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/security-privacy" as Href);
      }}
    >
      <KeyboardInset>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Card className="gap-3 p-4">
            <Text className="font-headline-md text-headline-md text-on-surface">
              Choose who can access your EHR
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Share your EHR summary and recorded vitals with a named doctor or nurse. You can also
              allow them to add vitals, choose an expiry, and revoke access here.
            </Text>
            <InfoCallout>
              This permission covers the EHR summary and vitals only. It does not share uploaded
              files, lab results, prescriptions, messages or research data.
            </InfoCallout>
            {notice ? (
              <View accessibilityLiveRegion="polite">
                <InfoCallout>{notice}</InfoCallout>
              </View>
            ) : null}
            <Text className="font-headline-md text-headline-md text-on-surface">
              Find a clinician
            </Text>
            <View className="flex-row gap-2">
              {(["doctor", "nurse"] as const).map((kind) => (
                <View key={kind} className="flex-1">
                  <Button
                    label={kind === "doctor" ? "Doctors" : "Nurses"}
                    variant={role === kind ? "primary" : "outline"}
                    onPress={() => setRole(kind)}
                  />
                </View>
              ))}
            </View>
            <Input
              accessibilityLabel="Search clinicians by name or specialty"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              placeholder="Name or specialty"
            />
            {query.length < 2 ? (
              <Text className="font-body-md text-body-md text-on-surface-variant">
                Enter at least two characters to search.
              </Text>
            ) : directory.isPending ? (
              <ActivityIndicator accessibilityLabel="Searching clinicians" />
            ) : directory.isError ? (
              <>
                <InfoCallout tone="error">
                  Couldn't load clinicians. Check your connection and try again.
                </InfoCallout>
                <Button
                  label="Retry clinician search"
                  variant="outline"
                  onPress={() => void directory.refetch()}
                />
              </>
            ) : !clinicians.length ? (
              <Text className="font-body-md text-body-md text-on-surface-variant">
                No matching clinicians found.
              </Text>
            ) : (
              clinicians.map((person) => (
                <View
                  key={person.profileId || person.userId}
                  className="gap-2 border-t border-outline-variant pt-3"
                >
                  <Text className="font-label-md text-label-md text-on-surface">{person.name}</Text>
                  <Text className="font-body-md text-body-md text-on-surface-variant">
                    {person.role === "doctor" ? "Doctor" : "Nurse"}
                    {person.specialty ? ` · ${person.specialty}` : ""}
                  </Text>
                  <Button
                    label={`Choose ${person.name}`}
                    variant="outline"
                    onPress={() => select({ kind: "grant", clinician: person })}
                  />
                </View>
              ))
            )}
          </Card>
          <Card className="mt-4 gap-3 p-4">
            <Text className="font-headline-md text-headline-md text-on-surface">
              Your sharing permissions
            </Text>
            <Button
              label={history ? "Show active permissions" : "Show sharing history"}
              variant="outline"
              onPress={() => setHistory(!history)}
            />
            {consents.isPending ? (
              <ActivityIndicator accessibilityLabel="Loading sharing permissions" />
            ) : consents.isError ? (
              <>
                <InfoCallout tone="error">Couldn't load sharing permissions.</InfoCallout>
                <Button label="Retry sharing permissions" onPress={() => void consents.refetch()} />
              </>
            ) : !items.length ? (
              <Text className="font-body-md text-body-md text-on-surface-variant">
                {history ? "No sharing history yet." : "You have no active sharing permissions."}
              </Text>
            ) : (
              items.map((consent) => (
                <View
                  key={consent.consent_id}
                  className="gap-2 border-t border-outline-variant pt-3"
                >
                  <Text className="font-label-md text-label-md text-on-surface">
                    {consent.clinician_display_name ?? "Clinician details unavailable"}
                  </Text>
                  <Badge
                    label={
                      consent.status === "active"
                        ? "Active"
                        : consent.status === "expired"
                          ? "Expired"
                          : "Revoked"
                    }
                    tone={consent.status === "active" ? "success" : "neutral"}
                  />
                  <Text className="font-body-md text-body-md text-on-surface">
                    {permissionLabel(consent.scope)}
                  </Text>
                  <Text className="font-body-md text-body-md text-on-surface-variant">
                    Granted {date(consent.granted_at)}
                    {consent.expires_at
                      ? ` · Expires ${date(consent.expires_at)}`
                      : " · No expiry set"}
                  </Text>
                  {consent.status === "active" ? (
                    <Button
                      label={`Revoke access for ${consent.clinician_display_name ?? "this clinician"}`}
                      variant="outline"
                      onPress={() => select({ kind: "revoke", consent })}
                    />
                  ) : null}
                </View>
              ))
            )}
            {consents.hasNextPage ? (
              <Button
                label={consents.isFetchingNextPage ? "Loading…" : "Load more permissions"}
                variant="outline"
                disabled={consents.isFetchingNextPage}
                onPress={() => void consents.fetchNextPage()}
              />
            ) : null}
          </Card>
        </ScrollView>
      </KeyboardInset>
      <Modal visible={!!choice} transparent animationType="fade" onRequestClose={close}>
        <View className="flex-1 justify-center p-4" style={{ backgroundColor: scrim }}>
          <KeyboardInset>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            >
              <Card className="gap-4 p-6" accessibilityViewIsModal>
                <Text
                  accessibilityRole="header"
                  className="font-headline-md text-headline-md text-on-surface"
                >
                  {choice?.kind === "grant" ? "Confirm sharing" : "Revoke sharing"}
                </Text>
                <Text className="font-label-md text-label-md text-on-surface">{chosenName}</Text>
                {choice?.kind === "grant" ? (
                  <>
                    <Text className="font-body-md text-body-md text-on-surface-variant">
                      This clinician will be able to view your EHR summary and vitals, including
                      future vitals, for the duration you choose.
                    </Text>
                    <ConsentRow
                      checked={allowVitals}
                      onChange={(value) => {
                        if (!busy && !uncertain) setAllowVitals(value);
                      }}
                      accessibilityLabel="Also allow this clinician to add vitals"
                      labelPressable
                    >
                      Also allow this clinician to add vitals
                    </ConsentRow>
                    <Text className="font-label-md text-label-md text-on-surface">Share for</Text>
                    <View className="flex-row gap-2">
                      {([7, 30, 90] as const).map((days) => (
                        <View key={days} className="flex-1">
                          <Button
                            label={`${days} days`}
                            variant={duration === days ? "primary" : "outline"}
                            disabled={busy || uncertain}
                            onPress={() => setDuration(days)}
                          />
                        </View>
                      ))}
                    </View>
                    <InfoCallout>
                      {allowVitals
                        ? "They can view your EHR and add new vitals. This does not allow changes to existing entries."
                        : "They can view your EHR and vitals. They cannot add vitals with this permission."}{" "}
                      You can revoke this access at any time.
                    </InfoCallout>
                  </>
                ) : (
                  <Text className="font-body-md text-body-md text-on-surface-variant">
                    New EHR requests under this permission will be denied after revocation. An
                    already authorized request may finish. Revoking access cannot remove information
                    already viewed or copied, or delete recorded vitals.
                  </Text>
                )}
                {error ? (
                  <View accessibilityRole="alert">
                    <InfoCallout tone="error">{error}</InfoCallout>
                  </View>
                ) : null}
                {uncertain ? (
                  <>
                    <InfoCallout>
                      The change may have saved. Check the current permission before trying again.
                    </InfoCallout>
                    <Button
                      label={busy ? "Checking…" : "Check permission status"}
                      disabled={busy}
                      onPress={() => void checkOutcome()}
                    />
                  </>
                ) : null}
                <Button
                  label={
                    busy
                      ? "Saving…"
                      : choice?.kind === "grant"
                        ? "Confirm sharing"
                        : "Confirm revoke"
                  }
                  disabled={busy || uncertain}
                  onPress={() => void submit()}
                />
                <Button label="Cancel" variant="outline" disabled={busy} onPress={close} />
              </Card>
            </ScrollView>
          </KeyboardInset>
        </View>
      </Modal>
    </DetailShell>
  );
}

function date(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "date unavailable" : timestamp.toLocaleString();
}
