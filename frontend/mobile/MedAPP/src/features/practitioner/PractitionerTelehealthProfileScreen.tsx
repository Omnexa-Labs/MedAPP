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

/**
 * Absent => a deep link that named no kind, which is a doctor. The identity
 * itself is never absent — see the no-data guard in the screen.
 */
function isBookableKind(kind: string | undefined): boolean {
  return kind === undefined || BOOKABLE_KINDS.includes(kind);
}

// ===========================================================================
// `DEFAULT_PROVIDER` IS DELETED. It was a named, bookable, fictional doctor.
// ===========================================================================
//   { id: "julian-sterling", name: "Dr. Julian Sterling",
//     specialty: "Cardiologist" }
//
// Any arrival without params — a deep link, a notification tap, a param dropped
// by a push somewhere upstream — rendered that clinician's name, specialty and
// an "About" line reading "Listed in the MedApp care directory as Cardiologist",
// under a LIVE "Book appointment" dock. Pressing it pushed
// `practitionerId: "julian-sterling"` into the funnel, where three screens later
// it becomes `doctor_id` on a real `POST /v1/bookings`. So the failure mode was
// not a cosmetic placeholder: it was a patient booking a medical appointment
// with a person who does not exist, against a directory id that resolves to
// nothing.
//
// The fix is the one `ReviewAppointmentScreen` already made for exactly this
// defect (its deleted `FALLBACK`, and the 756:4813 frame that replaced it): a
// screen with no provider says it has no provider, and offers no action that
// depends on one. Never a substitute provider.

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
   * Absent => a doctor. That is the deep-link case, and it is why the existing
   * Book CTA is unaffected for every caller that predates this param.
   */
  providerKind?: string;
  /**
   * The clinician's `consultation_fee_cents`, as Find Care read it off
   * `GET /v1/doctors`. Carried into the booking funnel, never rendered here —
   * `DoctorProfileOut` is not fetched by this screen, so a fee shown on this
   * page would be a number with no request behind it. Screen 2 shows it, beside
   * the commit, which is where a price has to be.
   */
  providerFeeCents?: string;
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

/**
 * Non-empty strings only; `null`, `""`, `"undefined"` and absent all collapse to
 * `undefined`.
 *
 * `"undefined"` is in that list because expo-router serialises an absent param
 * as the literal four-letter string, and a provider named "undefined" would sail
 * straight past the no-data guard below — which is the whole thing that guard
 * exists to catch.
 */
function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "undefined" ? trimmed : undefined;
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
  const state: ProfileState = params.state ?? "default";

  /**
   * The provider, or nothing at all. Both halves are required and neither is
   * substitutable: the id is what becomes `doctor_id` on the booking, and the
   * name is the only thing that tells the patient WHO they are booking. An id
   * with no name is a page about an anonymous clinician; a name with no id is a
   * Book button that can only fail. See the DEFAULT_PROVIDER note above.
   */
  const id = text(params.providerId) ?? text(params.id);
  const name = text(params.providerName);
  const provider =
    id && name
      ? {
          id,
          name,
          // Specialty and avatar are genuinely optional — a real clinician can
          // have neither — so they degrade to absent rather than gating the page.
          specialty: text(params.providerSpecialty),
          avatar: text(params.providerAvatar),
        }
      : null;

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
  const book = () => {
    if (!provider) return;
    router.push({
      pathname: "/(app)/select-time-slot",
      params: defined({
        practitionerId: provider.id,
        practitionerName: provider.name,
        practitionerSpecialty: provider.specialty,
        practitionerAvatar: provider.avatar,
        // Straight through to screen 2, which renders it. See the param's note.
        practitionerFeeCents: text(params.providerFeeCents),
      }),
    } as unknown as Href);
  };

  /**
   * No provider, no page — the 756:4813 treatment, one screen earlier.
   *
   * This is where `DEFAULT_PROVIDER` used to answer, with a name. Hooks above
   * have already run, unconditionally.
   */
  if (!provider) {
    return (
      <DetailShell title="Provider profile">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: 24,
            flexGrow: 1,
            justifyContent: "center",
            gap: 16,
          }}
        >
          <InfoCallout tone="error">
            We don&apos;t have a provider to show. This link is missing the practitioner it was
            meant to open.
          </InfoCallout>
          <ProfileCard title="Find a clinician">
            Browse the care directory to pick a provider, then book from their profile.
          </ProfileCard>
          <Button
            label="Go to Find Care"
            size="docked"
            pill={false}
            shadow={false}
            onPress={() => router.replace("/(app)/find-care" as unknown as Href)}
          />
        </ScrollView>
        {/* No dock. There is no provider to book, so there is no booking to
            offer — a CTA that cannot end in a correct record is not an
            affordance, and here it could only ever end in a wrong one. */}
      </DetailShell>
    );
  }

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

        {/* "TRY AGAIN" IS DELETED. It called `setState("default")` on a screen
            that issues NO network request — every fact on this page arrives as a
            route param — so there was nothing to retry and nothing that could
            have failed. Pressing it just swapped the error copy for the profile
            it was already holding, which reads as a successful retry and is
            therefore worse than a dead button: it manufactures the appearance of
            a recovery. It comes back the moment this screen fetches
            `GET /v1/doctors/{id}` itself, which is the real fix and is logged in
            docs/api/README.md's gap register. Find Care is the honest escape
            meanwhile, and it is a route that exists. */}
        {state === "error" ? (
          <View className="gap-4">
            <InfoCallout tone="error">
              This provider profile is unavailable. Go back to Find Care and open it again.
            </InfoCallout>
            <ProfileCard title="Need care sooner?">
              Return to Find Care to browse other clinicians and appointment times.
            </ProfileCard>
          </View>
        ) : null}

        {state === "default" || state === "reviews-empty" ? (
          <>
            <ProviderIdentity
              name={provider.name}
              specialty={provider.specialty ?? ""}
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

            {/* Only when there IS a specialty. "Listed in the MedApp care
                directory as ." is not a sentence, and filling the hole with a
                word like "clinician" would be this file's own deleted defect at
                one field's scale. */}
            {provider.specialty ? (
              <ProfileCard title="About">
                {`Listed in the MedApp care directory as ${provider.specialty}.`}
              </ProfileCard>
            ) : null}

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
