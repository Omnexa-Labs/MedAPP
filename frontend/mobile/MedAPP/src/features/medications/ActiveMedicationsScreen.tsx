import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Button, Card, Icon } from "@/components/ui";
import { shareTextFile } from "@/lib/share";
import { useTokenColor } from "@/lib/tokens";
import { buildMedicationListText } from "./list-export";
import { ACTIVE_MEDICATIONS } from "./mock-data";
import type { ActiveMedication, MedicationScreenState } from "./types";

const VALID_STATES: readonly MedicationScreenState[] = ["ready", "loading", "empty", "error", "offline"];

function initialState(value: string | string[] | undefined): MedicationScreenState {
  const state = Array.isArray(value) ? value[0] : value;
  return VALID_STATES.includes(state as MedicationScreenState) ? (state as MedicationScreenState) : "ready";
}

export function ActiveMedicationsScreen() {
  const { state: requestedState } = useLocalSearchParams<{ state?: string }>();
  const [screenState, setScreenState] = useState(() => initialState(requestedState));
  const [requestedRefills, setRequestedRefills] = useState<ReadonlySet<string>>(() => new Set());
  const [requestedMedication, setRequestedMedication] = useState<ActiveMedication | null>(null);
  const medications = useMemo(
    () => (screenState === "empty" ? [] : ACTIVE_MEDICATIONS),
    [screenState],
  );
  const isLoading = screenState === "loading";
  const hasError = screenState === "error";
  const isOffline = screenState === "offline";

  const requestRefill = (medication: ActiveMedication) => {
    setRequestedRefills((current) => new Set(current).add(medication.id));
    setRequestedMedication(medication);
  };

  const addMedication = () => {
    Alert.alert("Add medication", "Medication entry will be available when your records connection is set up.");
  };

  /**
   * "Share medication list" — was an Alert saying sharing would arrive with the
   * records connection. It never needed one: the list is already on the device,
   * and handing it to another app is a client capability, not a backend one.
   *
   * A FILE (`@/lib/share` → expo-sharing), not a text message. This is the one
   * share in the app whose recipient wants to KEEP what they are given — a
   * pharmacist or a locum reads a medication list, prints it, attaches it to a
   * referral. `shareTextFile` degrades to the text sheet on its own where file
   * sharing is unavailable, so there is nothing to branch on here.
   *
   * The empty state opens no sheet. `buildMedicationListText` would happily
   * return a header and a disclaimer with nothing between them, and a share
   * sheet onto that is worse than the button appearing to do nothing — it is a
   * document asserting "these are your medications" over a blank list.
   *
   * `offline` is passed through so the export dates itself honestly — see
   * ./list-export.ts.
   */
  const shareMedicationList = useCallback(() => {
    if (medications.length === 0) return;
    void shareTextFile({
      filename: "medapp-medications.txt",
      body: buildMedicationListText({ medications, at: new Date(), offline: isOffline }),
      dialogTitle: "Share medication list",
      subject: "MedApp — active medications",
    });
  }, [isOffline, medications]);

  return (
    <DetailShell
      title="Active medications"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/overview" as Href);
      }}
      actions={
        <Pressable accessibilityRole="button" accessibilityLabel="Share medication list" onPress={shareMedicationList} className="h-11 w-11 items-center justify-center rounded-full active:opacity-70">
          <Icon chrome="share" size={24} />
        </Pressable>
      }
    >
      {requestedMedication ? (
          <RefillRequestSuccess medication={requestedMedication} onBackToMedications={() => setRequestedMedication(null)} />
        ) : <FlatList
          data={isLoading ? [] : medications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          accessibilityLabel="Active medications list"
          ListHeaderComponent={
            <View>
              <Text className="font-headline-xl text-headline-xl text-on-surface">Your current medications</Text>
              <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
                Keep this list up to date for safer care.
              </Text>
              {isOffline ? <OfflineNotice onRetry={() => setScreenState("ready")} /> : null}
              {hasError ? <ErrorNotice onRetry={() => setScreenState("ready")} /> : null}
              {isLoading ? <MedicationSkeleton /> : null}
              {isOffline ? (
                <View className="mt-6">
                  <Text className="font-label-md text-label-md text-on-surface">Showing your last saved list</Text>
                  <Text className="mt-1 font-label-sm text-label-sm text-on-surface-variant">Offline · Updated 12 Jul at 09:42</Text>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <ActiveMedicationCard
              medication={item}
              refillRequested={requestedRefills.has(item.id)}
              offline={isOffline}
              onRequestRefill={() => requestRefill(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            !isLoading ? <EmptyMedications onAdd={addMedication} /> : null
          }
          ListFooterComponent={
            !isLoading && medications.length > 0 && isOffline ? (
              <Text className="mt-6 px-2 text-center font-label-sm text-label-sm text-on-surface-variant">
                Reconnect to request a refill or update this list.
              </Text>
            ) : !isLoading && medications.length > 0 ? (
              <View className="mt-6">
                <Button
                  label="Add a medication"
                  variant="outline"
                  pill={false}
                  shadow={false}
                  leadingIcon="add"
                  onPress={addMedication}
                />
                <Text className="mt-3 px-2 text-center font-label-sm text-label-sm text-on-surface-variant">
                  Add or import a medication from your clinician.
                </Text>
              </View>
            ) : null
          }
        />}
    </DetailShell>
  );
}

function RefillRequestSuccess({
  medication,
  onBackToMedications,
}: {
  medication: ActiveMedication;
  onBackToMedications: () => void;
}) {
  const success = useTokenColor("success");

  return (
    <View className="flex-1 px-4 pt-6">
      <Text className="font-headline-xl text-headline-xl text-on-surface">Request refill</Text>
      <Text className="mt-1 font-body-md text-body-md text-on-surface-variant">{medication.formAndStrength}</Text>
      <Card className="mt-6 p-4">
        <View className="h-11 w-11 items-center justify-center rounded-md bg-surface-container">
          <Icon chrome="check" size={20} color={success} />
        </View>
        <Text className="mt-4 font-headline-md text-headline-md text-success">Request sent</Text>
        <Text className="mt-2 font-body-md text-body-md text-on-surface">We&apos;ll notify you once it&apos;s ready.</Text>
        <View className="mt-4 self-start rounded-full bg-surface-container px-3 py-1">
          <Text className="font-label-sm text-label-sm text-on-surface">Pending review</Text>
        </View>
      </Card>
      <View className="mt-10">
        <Button label="Back to medications" shadow={false} onPress={onBackToMedications} />
        <Text className="mt-3 px-2 text-center font-label-sm text-label-sm text-on-surface-variant">
          Cancel before the pharmacy starts processing.
        </Text>
      </View>
    </View>
  );
}

export function ActiveMedicationCard({
  medication,
  refillRequested,
  offline,
  onRequestRefill,
}: {
  medication: ActiveMedication;
  refillRequested: boolean;
  offline: boolean;
  onRequestRefill: () => void;
}) {
  const primary = useTokenColor("primary");

  return (
    <Card className="mt-3 p-4" accessibilityLabel={`${medication.name}, ${medication.formAndStrength}`}>
      <View className="flex-row items-start gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-md bg-primary-tint">
          <Icon name="medication" size={24} color={primary} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-headline-md text-headline-md text-on-surface" numberOfLines={2}>
            {medication.name}
          </Text>
          <Text className="mt-1 font-label-md text-label-md text-on-surface-variant" numberOfLines={2}>
            {medication.formAndStrength}
          </Text>
          <View className="mt-2 self-start rounded-full bg-success-container px-3 py-1">
            <Text className="font-label-sm text-label-sm text-on-success-container">
              {medication.refillAvailable ? "Refill available" : medication.refillLabel}
            </Text>
          </View>
        </View>
      </View>

      <Text className="mt-4 font-body-md text-body-md text-on-surface">{medication.instructions}</Text>
      <View className="mt-4 h-px bg-outline-variant" />
      <Text className="mt-3 font-label-sm text-label-sm text-on-surface-variant">Last filled 12 Jul · 14 days left</Text>
      <View testID={`medication-actions-${medication.id}`} className="mt-4 flex-row gap-3">
        {offline ? (
          <View accessibilityLabel={`Refills unavailable offline for ${medication.name}`} className="min-h-11 flex-1 items-center justify-center rounded-md bg-surface-container-high px-3">
            <Text className="font-label-md text-label-md text-on-surface-variant">Unavailable offline</Text>
          </View>
        ) : medication.refillAvailable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={refillRequested ? `Refill request sent for ${medication.name}` : `Request refill for ${medication.name}`}
            accessibilityState={{ disabled: refillRequested }}
            disabled={refillRequested}
            onPress={onRequestRefill}
            className={`min-h-11 flex-1 items-center justify-center rounded-md px-3 ${refillRequested ? "bg-success-container" : "border border-primary bg-surface"}`}
          >
              <Text className={`font-label-md text-label-md ${refillRequested ? "text-on-success-container" : "text-primary"}`}>
              {refillRequested ? "Requested" : "Request refill"}
            </Text>
          </Pressable>
        ) : (
          <View className="min-h-11 flex-1 items-center justify-center rounded-md bg-surface-container-high px-3">
            <Text className="font-label-md text-label-md text-on-surface-variant">Refill unavailable</Text>
          </View>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`View details for ${medication.name}`} onPress={() => router.push({ pathname: "/(app)/medication-details", params: { id: medication.id } } as Href)} className="min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-3 active:opacity-70">
          <Text className="font-label-md text-label-md text-on-primary">View details</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function MedicationSkeleton() {
  return (
    <View className="mt-6 gap-3" accessibilityRole="progressbar" accessibilityLabel="Loading medications">
      {[0, 1, 2].map((item) => (
        <Card key={item} className="p-4">
          <View className="h-5 w-2/3 rounded-md bg-surface-container-high" />
          <View className="mt-3 h-4 w-1/2 rounded-md bg-surface-container-high" />
          <View className="mt-4 h-16 rounded-md bg-surface-container-high" />
        </Card>
      ))}
    </View>
  );
}

function EmptyMedications({ onAdd }: { onAdd: () => void }) {
  return (
    <View className="flex-1 items-center justify-center py-12">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-tint">
        <Icon name="medication" size={32} />
      </View>
      <Text className="mt-4 font-headline-md text-headline-md text-on-surface">No active medications</Text>
      <Text className="mt-2 w-full px-2 text-center font-body-md text-body-md text-on-surface-variant">
        Ask your clinician to share a prescription.
      </Text>
      <View className="mt-6 w-full">
        <Button label="Add a medication" pill={false} shadow={false} leadingIcon="add" onPress={onAdd} />
      </View>
      <Text className="mt-3 w-full px-2 text-center font-label-sm text-label-sm text-on-surface-variant">
        Clinician verification is required.
      </Text>
    </View>
  );
}

function OfflineNotice({ onRetry }: { onRetry: () => void }) {
  const error = useTokenColor("error");
  return (
    <View accessibilityRole="alert" className="mt-4 flex-row items-start gap-3 rounded-md bg-error-container p-4">
      <Icon chrome="cloud-off" size={20} color={error} />
      <View className="flex-1">
        <Text className="font-label-md text-label-md" style={{ color: error }}>Couldn&apos;t refresh medications</Text>
        <Text className="mt-1 font-body-md text-body-md text-on-error-container">You&apos;re offline. We&apos;re showing your last saved list.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry refreshing medications" onPress={onRetry} className="mt-3 min-h-11 self-start justify-center rounded-md px-3 active:opacity-70">
          <Text className="font-label-md text-label-md" style={{ color: error }}>Try again</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ErrorNotice({ onRetry }: { onRetry: () => void }) {
  const error = useTokenColor("error");
  return (
    <View accessibilityRole="alert" className="mt-6 rounded-md bg-error-container p-4">
      <View className="flex-row items-start gap-3">
        <Icon chrome="error-outline" size={24} color={error} />
        <View className="flex-1">
          <Text className="font-label-md text-label-md text-on-error-container">Couldn&apos;t refresh medications</Text>
          <Text className="mt-1 font-body-md text-body-md text-on-error-container">
            Showing your last saved list. Check your connection and try again.
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Try loading medications again" onPress={onRetry} className="mt-3 min-h-11 self-start justify-center rounded-md px-3 active:opacity-70">
            <Text className="font-label-md text-label-md text-on-error-container">Try again</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
