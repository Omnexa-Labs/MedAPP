import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DetailShell } from "@/components/shell";
import {
  Button,
  Card,
  DockedActionBar,
  InfoCallout,
  SectionHeader,
} from "@/components/ui";
import { ProviderIdentity } from "@/features/telehealth";

const CTA_EDGE_GAP = 16;

/**
 * Which directory kinds this screen may offer a booking for — and it is exactly
 * one.
 *
 * This is a backend fact, not a product preference.
 * `backend/services/booking_service/app/schemas/booking.py` defines
 * `BookingCreate { doctor_id: UUID, ... }`; `src/features/booking/api.ts` binds
 * to it as `doctorId`, and `ReviewAppointmentScreen` fills that field from the
 * `practitionerId` this screen pushes. A nurse_id or a pharmacist_id sent down
 * that path does not fail loudly — it writes a booking row against a provider
 * who is not a doctor. So the CTA is withheld rather than offered and then
 * betrayed at the last step.
 *
 * The rule lives HERE, next to the CTA it gates, rather than in the directory:
 * find-care forwards the entry's `category` verbatim and makes no claim about
 * bookability, so there is one decision in one place.
 */
const BOOKABLE_KINDS: readonly string[] = ["doctors"];

/** Absent => the deep-link / DEFAULT_PROVIDER case, which is a doctor. */
function isBookableKind(kind: string | undefined): boolean {
  return kind === undefined || BOOKABLE_KINDS.includes(kind);
}
const DEFAULT_PROVIDER = {
  id: "julian-sterling",
  name: "Dr. Julian Sterling",
  specialty: "Cardiologist",
  avatar: undefined as string | undefined,
};

type ProfileState = "default" | "loading" | "error" | "reviews-empty";

type Params = {
  id?: string;
  providerId?: string;
  providerName?: string;
  providerSpecialty?: string;
  providerAvatar?: string;
  /**
   * The directory `category` the entry came from — "doctors" | "nurses" |
   * "pharmacists". It is what decides whether this screen offers a booking dock;
   * see `isBookableCategory` in FindCareScreen for why only doctors qualify
   * (`booking_service`'s BookingCreate takes `doctor_id`, and ReviewAppointment
   * forwards `practitionerId` straight into it).
   *
   * Absent => a doctor. That is the deep-link and DEFAULT_PROVIDER case, and it
   * is why the existing Book CTA is unaffected for every caller that predates
   * this param.
   */
  providerKind?: string;
  state?: ProfileState;
};

/**
 * Route params serialise `undefined` as the literal string "undefined", which
 * would reach `select-time-slot` as an avatar URI and render a broken image
 * behind the practitioner's name. Same helper, same reason, as
 * SelectTimeSlotScreen's own `defined()`.
 */
function defined(params: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function initialsFor(name: string) {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ProfileCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <SectionHeader title={title} />
      <Card className="gap-2 p-4">
        <Text className="font-label-md text-label-md text-on-surface">{title}</Text>
        <Text className="font-body-md text-body-md text-on-surface-variant">{children}</Text>
      </Card>
    </View>
  );
}

function LoadingProfile() {
  return (
    <View accessibilityLabel="Loading provider profile" className="gap-4">
      <View className="h-[100px] rounded-card bg-surface-container-low" />
      <View className="h-11 w-32 rounded-md bg-surface-container-low" />
      <View className="h-28 rounded-card bg-surface-container-low" />
      <View className="h-11 w-52 rounded-md bg-surface-container-low" />
      <View className="h-28 rounded-card bg-surface-container-low" />
    </View>
  );
}

export function PractitionerTelehealthProfileScreen() {
  const params = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  const ctaBottom = CTA_EDGE_GAP + insets.bottom;
  const [state, setState] = useState<ProfileState>(params.state ?? "default");

  const provider = {
    id: params.providerId ?? params.id ?? DEFAULT_PROVIDER.id,
    name: params.providerName ?? DEFAULT_PROVIDER.name,
    specialty: params.providerSpecialty ?? DEFAULT_PROVIDER.specialty,
    avatar: params.providerAvatar ?? DEFAULT_PROVIDER.avatar,
  };

  const bookable = isBookableKind(params.providerKind);

  /**
   * The hand-off into step 1 of the booking journey.
   *
   * `practitionerId` is the load-bearing one — SelectTimeSlot keys its
   * availability query on it and ReviewAppointment refuses to submit without it
   * (it becomes `doctor_id`). The other three are what step 1 draws in its
   * `PractitionerSummaryRow`, so a push without them lands on a picker with a
   * blank clinician above it.
   *
   * No rating is sent, and that is deliberate: nothing here knows one, and
   * SelectTimeSlot's `asRating` drops a half-supplied pair rather than inventing
   * a score beside a named clinician.
   */
  const book = () =>
    router.push({
      pathname: "/(app)/select-time-slot",
      params: defined({
        practitionerId: provider.id,
        practitionerName: provider.name,
        practitionerSpecialty: provider.specialty,
        practitionerAvatar: provider.avatar,
      }),
    } as unknown as Href);

  return (
    <DetailShell title="Provider profile" claimsBottomInset={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 20,
          // The 112 is the docked bar's reserve. With no dock there is nothing
          // to clear, but the shell still passes `claimsBottomInset={false}`,
          // so the inset has to be paid here or the last card sits under the
          // gesture bar.
          paddingBottom: (bookable ? 112 : 24) + ctaBottom,
          gap: 16,
        }}
      >
        {state === "loading" ? <LoadingProfile /> : null}

        {state === "error" ? (
          <View className="gap-4">
            <InfoCallout tone="error">
              This provider profile is unavailable. Check your connection and try again.
            </InfoCallout>
            <Button
              label="Try again"
              variant="outline"
              size="docked"
              pill={false}
              shadow={false}
              onPress={() => setState("default")}
            />
            <ProfileCard title="Need care sooner?">
              Return to Find Care to browse other available clinicians and appointment times.
            </ProfileCard>
          </View>
        ) : null}

        {state === "default" || state === "reviews-empty" ? (
          <>
            <ProviderIdentity
              name={provider.name}
              specialty={provider.specialty}
              avatarUri={provider.avatar}
              initials={initialsFor(provider.name)}
            />

            {/* Non-bookable kinds say so, in words, at the top of the profile —
                rather than the user reading the whole page and only then finding
                no CTA where every other provider has one. Colour is not the
                signal; the sentence is. */}
            {bookable ? null : (
              <InfoCallout tone="info">
                Online booking isn&apos;t available for this provider yet. You can still see who
                they are here, and book with a doctor from Find Care.
              </InfoCallout>
            )}

            <ProfileCard title="About">
              {`Listed in the MedApp care directory as ${provider.specialty}.`}
            </ProfileCard>

            {/* Video-visit guidance is a claim about how an appointment with
                THIS provider runs, so it is scoped to the providers who can
                actually be booked. */}
            {bookable ? (
              <ProfileCard title="Video visit details">
                Join from a quiet, private place with a stable connection. The visit length is
                shown with the slot you pick on the next step.
              </ProfileCard>
            ) : null}

            {state === "reviews-empty" ? (
              <ProfileCard title="Patient reviews">
                No patient reviews yet. Qualifications and availability are still verified.
              </ProfileCard>
            ) : (
              <ProfileCard title="Availability & reviews">
                Availability is chosen on the next step. Ratings appear here once the practitioner
                service publishes them.
              </ProfileCard>
            )}
          </>
        ) : null}
      </ScrollView>

      {/* The dock is the funnel's hinge, so what hides it is deliberate:
          - `error`, because there is nothing loaded to book against;
          - a non-bookable `providerKind`, because `BookingCreate.doctor_id`
            would be filled with a nurse or pharmacist id three screens later.
          A CTA that cannot end in a correct record is not an affordance. */}
      {state !== "error" && bookable ? (
        <DockedActionBar
          primary={{
            label: "Book appointment",
            onPress: book,
            disabled: state === "loading",
          }}
          testID="provider-booking-dock"
        />
      ) : null}
    </DetailShell>
  );
}
