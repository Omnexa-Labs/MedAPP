// Active medications — the patient's list.
//
// ===========================================================================
// SAMPLE DATA. THERE IS NO MEDICATION ENDPOINT.
// ===========================================================================
// This screen renders `./sample-data.ts` and issues no network request. The
// evidence for "no endpoint" is in the header of MedicationDetailsScreen.tsx
// and it is thorough; the short version is that `ehr_service` has no medication
// or prescription table, and the two `/v1/prescriptions` implementations that
// exist belong to a pharmacy and a hospital system, are staff-role-gated, and
// reject a MedApp token.
//
// The three medications are therefore LABELLED, not dressed up. Every surface
// that can carry the statement carries it: a callout above the list, a chip on
// every card, the detail screen's provenance line, and the first line of the
// shared export. A patient must not be able to reach any of them and conclude
// these are their prescriptions.
//
// ===========================================================================
// WHAT WAS REMOVED, AND WHY EACH ONE HAD TO GO
// ===========================================================================
//   * "Request refill" — added an id to a `useState` Set and rendered "Request
//     sent · Pending review · We'll notify you once it's ready." No request was
//     made, nothing was persisted, no notification would ever arrive, and
//     navigating away erased it. Removed with the two fields that fed it.
//   * "Add a medication" (twice: the footer and the empty state) — an
//     `Alert.alert` saying entry would arrive with the records connection. A
//     control whose entire behaviour is an apology.
//   * "Last filled 12 Jul · 14 days left" — a JSX literal rendered identically
//     under all three medications, backed by no field on the type. Two fabricated
//     clinical facts per card.
//   * "Offline · Updated 12 Jul at 09:42" — a fixed date that would still have
//     said 12 Jul in 2027.
//   * Both "Try again" buttons — they flipped a local enum. Nothing refetched,
//     because there was nothing to fetch.
//   * The `?state=` hatch — five async states on a screen that makes no request,
//     every one of them reachable only by URL, including states that render
//     clinical data. See ./state.ts.
//
// The share action stays: sharing is a CLIENT capability and works. It carries
// the sample-data statement into the file it writes — see ./list-export.ts.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { useCallback } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Card, Icon, InfoCallout } from "@/components/ui";
import { shareTextFile } from "@/lib/share";
import { useTokenColor } from "@/lib/tokens";
import { buildMedicationListText } from "./list-export";
import { SAMPLE_MEDICATIONS, SAMPLE_NOTICE } from "./sample-data";
import { medicationsOf, type MedicationsState } from "./state";
import type { ActiveMedication } from "./types";

export function ActiveMedicationsScreen() {
  // The seam. When a patient-scoped medication endpoint ships this becomes
  //     deriveMedicationsState(useQuery({ queryKey: […], queryFn: … }))
  // and nothing below changes: the render switches on `kind`, and no branch
  // tests a list length. Read ./state.ts before making that edit — the empty
  // state MUST NOT be reachable from a failed fetch.
  return <MedicationsList state={{ kind: "sample", medications: SAMPLE_MEDICATIONS }} />;
}

/**
 * The list, as a function of the state and nothing else.
 *
 * Split out from the screen so every branch is reachable in a test without a
 * fake network and without a URL parameter — which is what the deleted
 * `?state=` hatch was standing in for. The screen owns where the state comes
 * from; this owns what each state looks like.
 */
export function MedicationsList({ state }: { state: MedicationsState }) {
  const medications = medicationsOf(state);
  const isSample = state.kind === "sample";

  /**
   * "Share medication list" — a FILE (`@/lib/share` → expo-sharing), not a text
   * message. This is the one share in the app whose recipient wants to KEEP
   * what they are given: a pharmacist or a locum reads a medication list,
   * prints it, attaches it to a referral. `shareTextFile` degrades to the text
   * sheet on its own where file sharing is unavailable.
   *
   * A list with nothing in it opens no sheet: `buildMedicationListText` would
   * return a header and a disclaimer with nothing between them, and that is a
   * document asserting "these are your medications" over a blank list.
   *
   * `sample` travels into the body builder. A document listing three drugs the
   * reader does not take is the one artefact from this screen that outlives the
   * screen, so the statement has to be inside the file, not beside it.
   */
  const shareMedicationList = useCallback(() => {
    if (medications.length === 0) return;
    void shareTextFile({
      filename: "medapp-medications.txt",
      body: buildMedicationListText({ medications, at: new Date(), sample: isSample }),
      dialogTitle: "Share medication list",
      subject: "MedApp — medication list",
    });
  }, [isSample, medications]);

  return (
    <DetailShell
      title="Active medications"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/overview" as Href);
      }}
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share medication list"
          onPress={shareMedicationList}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
        >
          <Icon chrome="share" size={24} />
        </Pressable>
      }
    >
      <FlatList
        data={medications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: 32,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        accessibilityLabel="Active medications list"
        ListHeaderComponent={
          <View>
            {/* First thing on the screen, above the title. `tone="error"`
                structurally renders a glyph beside the words, so the statement
                is never colour-only. */}
            {isSample ? (
              <View className="mb-4">
                <InfoCallout tone="error" testID="medications-sample-notice">
                  {`${SAMPLE_NOTICE} They are the same three entries for every account, and no medication record has been loaded.`}
                </InfoCallout>
              </View>
            ) : null}
            <Text className="font-headline-xl text-headline-xl text-on-surface">
              Your current medications
            </Text>
            <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
              Keep this list up to date for safer care.
            </Text>
            {state.kind === "error" ? (
              <View className="mt-4">
                <ErrorNotice offline={state.offline} />
              </View>
            ) : null}
            {state.kind === "loading" ? <MedicationSkeleton /> : null}
          </View>
        }
        renderItem={({ item }) => <ActiveMedicationCard medication={item} sample={isSample} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        // Keyed on the STATE, never on `medications.length`. This is the line
        // the whole of ./state.ts exists to protect: a failed fetch reaches the
        // error branch above, and can never arrive here.
        ListEmptyComponent={state.kind === "empty" ? <EmptyMedications /> : null}
      />
    </DetailShell>
  );
}

export function ActiveMedicationCard({
  medication,
  sample,
}: {
  medication: ActiveMedication;
  sample: boolean;
}) {
  const primary = useTokenColor("primary");

  return (
    <Card
      className="mt-3 p-4"
      accessibilityLabel={
        sample
          ? `Sample medication. ${medication.name}, ${medication.formAndStrength}`
          : `${medication.name}, ${medication.formAndStrength}`
      }
    >
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
          {/* Was a green `success-container` pill reading "Refill available".
              The chip slot now carries provenance instead of an availability
              claim, and the tint is the error container so it reads as a
              qualification rather than as a reassurance. */}
          {sample ? (
            <View className="mt-2 self-start rounded-full bg-error-container px-3 py-1">
              <Text className="font-label-sm text-label-sm text-on-error-container">Sample</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text className="mt-4 font-body-md text-body-md text-on-surface">
        {medication.instructions}
      </Text>
      <View className="mt-4 h-px bg-outline-variant" />
      <View testID={`medication-actions-${medication.id}`} className="mt-4 flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View details for ${medication.name}`}
          onPress={() =>
            router.push({
              pathname: "/(app)/medication-details",
              params: { id: medication.id },
            } as Href)
          }
          className="min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-3 active:opacity-70"
        >
          <Text className="font-label-md text-label-md text-on-primary">View details</Text>
        </Pressable>
      </View>
    </Card>
  );
}

/**
 * Reachable only from `{ kind: "empty" }` — a service that answered and said
 * this patient has no medications. It is NOT reachable from a failure, which is
 * the whole point; the copy asks the patient to act, and asking a patient to
 * chase their clinician because a server returned 500 is the harm.
 *
 * Its "Add a medication" button is gone: it opened an Alert saying medication
 * entry was not available.
 */
function EmptyMedications() {
  return (
    <View testID="medications-empty" className="flex-1 items-center justify-center py-12">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-tint">
        <Icon name="medication" size={32} />
      </View>
      <Text className="mt-4 font-headline-md text-headline-md text-on-surface">
        No active medications
      </Text>
      <Text className="mt-2 w-full px-2 text-center font-body-md text-body-md text-on-surface-variant">
        Ask your clinician to share a prescription.
      </Text>
    </View>
  );
}

/**
 * A failure says a list could not be loaded. It never says the list is empty,
 * and it shows no medications beneath itself — there is no local cache, so
 * "showing your last saved list" (which this screen used to claim, under a
 * fixed "Updated 12 Jul at 09:42") was describing a fixture.
 */
function ErrorNotice({ offline }: { offline: boolean }) {
  return (
    <View
      accessibilityRole="alert"
      testID="medications-error"
      className="rounded-md bg-error-container p-4"
    >
      <Text className="font-label-md text-label-md text-on-error-container">
        {offline ? "You’re offline" : "Couldn’t load your medications"}
      </Text>
      <Text className="mt-1 font-body-md text-body-md text-on-error-container">
        Your medication list could not be loaded, so none is shown. This is not an empty list.
      </Text>
    </View>
  );
}

function MedicationSkeleton() {
  return (
    <View
      className="mt-6 gap-3"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading medications"
    >
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
