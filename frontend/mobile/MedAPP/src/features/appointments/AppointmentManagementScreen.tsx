// Appointment Management screen — translated from the Stitch
// "Clinical Vitality - Appointments" HTML.
//
// Entry points:
//   - BookingConfirmedScreen → "View My Appointments"
//   - HomeScreen → Upcoming Appointments section header → "View All"
//   - (future) Any "My Appointments" entry across the app
//
// ============================================================================
// THIS IS A DETAIL SCREEN (product-owner ruling, 2026-08-01)
// ============================================================================
// It used to describe itself as "a root-level destination screen" and wore the
// patient tab bar with Home forced active, on the reasoning that Home "is the
// entry path most users will use". The PO has ruled the other way: Appointments
// is NOT one of the five patient tabs, so the bar could only ever render a lie —
// either nothing selected, or Home selected while the user is demonstrably not
// on Home. Figma has no `Active=Appointments` value to fake it with, and that
// absence is deliberate (`Patient BottomTabBar` set 740:1015 ships exactly the
// five tab values).
//
// So the chrome is now the canonical detail chrome, which is one rule in
// docs/BRAND.md §App shell and not two: "Detail screens don't get the bottom nav
// — they get a back button in the app bar instead."
//
//   was   hand-rolled bar (avatar + "MedApp" wordmark + dead bell) + BottomNav
//   then  <DetailAppBar title="Appointments" /> inside a hand-rolled
//         SafeAreaView + StatusBar wrapper, Figma 193:120, no bottom nav
//   now   <DetailShell title="Appointments">, which owns that wrapper too —
//         the 15 improvised copies of it are what DetailShell exists to delete
//
// What that trade actually costs and buys:
//   - GAINED a real way out. The old bar had none; the only exit was a tab,
//     which navigated somewhere unrelated.
//   - LOST the five-tab jump-off. Intended: a detail screen returns to where it
//     was pushed from, and both entry points (BookingConfirmed, HomeScreen
//     "View All") are themselves tab roots.
//   - LOST a dead bell (a Pressable with no `onPress` at all) and a wordmark
//     rendered as `<Text>`. Neither belongs on a detail bar — 193:120's own
//     description: "No logo — the logo belongs only on tab-root screens."
//   - The 28px body `<Text>Appointments</Text>` is GONE, because the bar now
//     carries the screen name and two identical headings one above the other is
//     a stutter for a screen reader as much as for the eye. The subtitle line
//     ("Manage your clinical sessions and history.") is kept.
//
// Entry points are unchanged and both push, so `router.back()` — DetailAppBar's
// default — is always correct here.
//
// Translation rules:
//   - tabs (Upcoming | Past) → segmented control with bottom underline.
//   - status pills → inline-coloured pills.
//   - Past tab uses muted/grayscale cards with "View Summary" CTA.
//   - location_on → location-on. calendar_today → calendar-today.
//
// ============================================================================
// LIVE DATA (2026-08-02)
// ============================================================================
// This screen rendered two hardcoded arrays and issued no network request at
// all, under a note promising `useQuery(["appointments"])` "once
// GET /v1/appointments ships". **That endpoint does not exist and is not
// coming.** The gateway routes `/v1/bookings` to booking_service, which is
// where a booking made in this app actually lands — so a patient could finish
// the booking flow, get a 201, come here, and see two invented appointments
// with someone else's name on them.
//
// It now reads `GET /v1/bookings` through `features/appointments/api.ts`.
// Three things the wire cannot give us, all handled by showing less rather
// than inventing more, and all logged in docs/PIPELINE.md §5:
//
//   - **"In Review" is gone.** `BookingStatus` is `booked | cancelled`; no
//     pending state exists to map onto. Completed is derived from the clock.
//   - **Facility is hidden.** `BookingOut` has no facility and the doctor
//     profile has no practice address.
//   - **Consultation type is whatever `reason` holds.** `BookingCreate` still has
//     no column for the TYPE the user picks, so the server does not know what
//     kind of appointment this was.
//
// The MODE is no longer on that list. `mode` and `room_id` ship on `bookings`
// (migration 20260803_0002), so the two things 550:1826 draws and this file used
// to refuse to build are now facts the server reports: the modality badge
// (550:2613) and, on a video visit, a join control. See `ModalityBadge` and the
// join block in `UpcomingCard` — including the third state the frame does not
// draw, a video booking whose room could not be provisioned.
//
// Cancelled bookings appear under Past, labelled as cancelled — not silently
// dropped, and never relabelled "Completed", which on a medical record would
// assert attendance that did not happen.

import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  appointmentsApi,
  type Appointment,
  type AppointmentMode,
} from "@/features/appointments/api";
import { DetailShell } from "@/components/shell";
import { AvatarWithFallback, Button, Icon } from "@/components/ui";
import { blendTokens, useTokenColor } from "@/lib/tokens";
import { useResolvedScheme } from "@/lib/theme";

interface UpcomingAppointment {
  id: string;
  /**
   * Carried for the telehealth handoff only. `WaitingRoomScreen` falls back to a
   * hardcoded "Dr. Julian Sterling" when it is given no `providerId`, and a real
   * appointment must not land on that stub.
   */
  doctorId: string;
  doctorName: string;
  specialty: string;
  facility: string;
  avatarUri: string;
  status: "confirmed";
  dateLabel: string; // "Tuesday, Oct 24 • 10:30 AM"
  consultationType: string;
  /** Drives the modality badge AND the presence of a join control. */
  mode: AppointmentMode;
  /**
   * The telemedicine room, when the service provisioned one. `mode === "video"`
   * with no `roomId` is a real backend state, and it renders as pending — see
   * `ModalityBadge` / the join block in `UpcomingCard`.
   */
  roomId?: string;
  /** Carried into the waiting room so it can name the clinician. */
  startsAtIso: string;
}

interface PastAppointment {
  id: string;
  doctorName: string;
  specialty: string;
  facility: string;
  completedLabel: string; // "Completed on Monday, Sep 12 • 09:00 AM"
}

// ---------------------------------------------------------------------------
// Wire -> card
// ---------------------------------------------------------------------------

/**
 * `Tuesday, Oct 24 • 10:30 AM`, in the device's own locale and zone.
 *
 * The server stores an instant; a patient reads a wall clock. Formatting on
 * the device is the only way "10:30 AM" means the time they will turn up.
 */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} • ${time}`;
}

/**
 * The clinician's name, or an honest stand-in.
 *
 * `hydrate` leaves `doctor` null when doctor_service could not resolve the id.
 * "Unknown clinician" is deliberate: an appointment the patient genuinely has
 * should still be visible with its time intact, and a blank name is more
 * truthful than borrowing one from somewhere else.
 */
function doctorName(a: Appointment): string {
  return a.doctor?.name ?? "Unknown clinician";
}

/**
 * "Dr. Kwabena Osei" -> "KO". The honorific is dropped so every clinician does
 * not initial as "D".
 */
function initialsOf(name: string): string {
  const words = name.replace(/^Dr\.?\s+/i, "").split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function toUpcoming(a: Appointment): UpcomingAppointment {
  return {
    id: a.id,
    doctorId: a.doctorId,
    doctorName: doctorName(a),
    specialty: a.doctor?.specialty ?? "",
    // BookingOut carries no facility, and doctor_service has no practice
    // address on the profile. The row is hidden rather than filled with the
    // clinic name the mock used to assert. Logged in PIPELINE §5.
    facility: "",
    avatarUri: a.doctor?.avatarUri ?? "",
    status: "confirmed",
    dateLabel: formatWhen(a.startsAtIso),
    // TYPE is still dropped by `BookingCreate` — there is no column for it — so
    // `reason` remains the only free text that survives the round trip. MODE is
    // no longer in that category: it is stored, and it arrives below.
    consultationType: a.reason ?? "",
    mode: a.mode,
    roomId: a.roomId,
    startsAtIso: a.startsAtIso,
  };
}

function toPast(a: Appointment): PastAppointment {
  const when = formatWhen(a.startsAtIso);
  return {
    id: a.id,
    doctorName: doctorName(a),
    specialty: a.doctor?.specialty ?? "",
    facility: "",
    completedLabel:
      a.status === "cancelled" ? `Cancelled — was ${when}` : `Completed on ${when}`,
  };
}

/**
 * Status chip tones, taken from the design system's own status vocabulary
 * (`Badge`'s TONE table) rather than invented here — same tint-over-accent
 * shape, so the two agree when this screen finally adopts `Badge`.
 *
 * Both entries used to be literals, and the pair was the textbook version of
 * the hex-in-two-roles trap:
 *
 *   confirmed  bg rgba(0,104,95,0.12)  = `primary` at a tint  -> bg-primary/10
 *              text #00685f            = `primary` as CONTENT -> text-primary
 *   in_review  bg rgba(0,131,120,0.15) = `primary-container`  -> see below
 *              text #008378            = `primary-container`  -> see below
 *
 * `#008378` is literally the light value of `primary-container`, and matching
 * the hex is exactly what must NOT be done here: `primary-container` is a
 * SURFACE token whose dark value is #005049, so using it as the chip's label
 * colour would have painted dark teal text on a dark teal wash the moment the
 * app flipped. A container token's content pair is `on-primary-container`,
 * never the container itself.
 *
 * "In Review" is therefore the `info` tone — `tertiary`, the accent the design
 * system already reserves for informational status. That also fixes a second
 * defect the literals hid: at #00685f vs #008378 the two statuses differed by
 * one barely-perceptible shade of the same teal, i.e. a clinical state
 * signalled by colour alone at a distance no one can resolve (docs/BRAND.md
 * §Colour rules).
 */
const STATUS_STYLES: Record<
  UpcomingAppointment["status"],
  { bg: string; text: string; label: string }
> = {
  confirmed: {
    // Figma 550:2613 fills this badge with `success-container`. The frame pairs
    // it with `on-surface-variant`; the code uses `on-success-container`, which
    // is that container's OWN content pair and the rule this codebase applies
    // everywhere else — a container's label must be its `on-` token or the two
    // stop flipping together. Visually identical (dark green on pale green),
    // and noted in PIPELINE §5 so the frame can be corrected rather than the
    // deviation forgotten.
    //
    // It was `primary/10` + `primary`, which read as brand accent rather than
    // "this is confirmed" — the same teal as every other affordance on the card.
    bg: "bg-success-container",
    text: "text-on-success-container",
    label: "Confirmed",
  },
  // "In Review" is gone, not restyled. `BookingStatus` is `booked | cancelled`;
  // nothing in booking_service can produce a pending state, so the pill could
  // only ever have been decoration. Keeping it would have meant picking some
  // client-side proxy for "under review" and presenting a guess as a fact about
  // the patient's care. The gap is logged in docs/PIPELINE.md §5 — if the
  // backend adds the state, the tone that was here is `tertiary`.
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AppointmentManagementScreen() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  // `GET /v1/bookings`, scoped to the bearer token. This screen rendered two
  // hardcoded arrays until now, so a booking made in the app was invisible the
  // moment the user landed here.
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => appointmentsApi.listAppointments(),
  });

  const upcoming = (data?.upcoming ?? []).map(toUpcoming);
  const past = (data?.past ?? []).map(toPast);
  const rows = tab === "upcoming" ? upcoming : past;

  // Resolved in JS because RN has no `currentColor` for a glyph or a spinner.
  const spinner = useTokenColor("primary");
  const dangerGlyph = useTokenColor("error");
  const mutedGlyph = useTokenColor("on-surface-variant");

  return (
    /* DetailShell owns the safe area, the StatusBar and the bar (Figma 193:120).
       The `useResolvedScheme()` StatusBar line this screen hand-rolled is now
       the shell's, verbatim and in one place; the local hook call is gone.

       `claimsBottomInset` is left at its default. The old wrapper passed
       `edges={["top","left","right"]}` — correct only while the deleted bottom
       nav was sitting in that inset. With no nav and nothing pinned, the shell
       claims it so the list cannot run under the gesture bar.

       No `onBack`: both entry points (BookingConfirmed, HomeScreen "View All")
       push, so DetailAppBar's default `router.back()` is right, and it no-ops
       rather than throwing if this screen is ever deep-linked with no history.
       The bar takes no `style`/`className`, so this screen cannot grow a private
       variant of it again — which is how it got a frozen `#00685f` bell before. */
    <DetailShell title="Appointments">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 16,
          // 32, not the 140 this screen carried. That 140 was sized to clear the
          // bottom nav; the nav is gone and the shell now adds the bottom inset
          // on top, so keeping it would leave ~170px of dead space under the last
          // card. 32 is what the three sibling booking screens use.
          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Subtitle only — the screen name now lives in the app bar (see the
            header note). Repeating it here at 28px would announce
            "Appointments, heading. Appointments." */}
        <Text className="font-body-md text-on-surface-variant mb-md">
          Manage your clinical sessions and history.
        </Text>

        {/* ==================================================================
            "Book new" — the missing head of the new-booking funnel
            ==================================================================
            Until this button, this screen offered Reschedule and nothing else,
            which meant a patient could move an appointment they already had and
            could not make one they didn't. There was no "book" affordance
            anywhere in the app except on the practitioner profile, and the only
            way into that profile is the provider directory, which had no inbound
            link at all. This is one of the two ends that reconnects.

            IT ROUTES TO `find-care`, NOT TO `select-time-slot`, and that is the
            whole decision. `select-time-slot` is a slot picker FOR a
            practitioner — its own params are practitionerName /
            practitionerSpecialty / practitionerAvatar, which is exactly what
            Reschedule passes it two hundred lines below, because a reschedule
            already knows the doctor. A NEW booking does not. A "Book" button
            that jumped straight to the slot picker would have to either invent a
            practitioner or push no params and land the screen in its
            expired/no-data state, and a push that lands a screen in its "session
            expired" state is not a working link. So the order is the honest one:
            choose a provider, then a slot.

              Appointments -> Book new -> find-care -> provider card
                           -> practitioner-telehealth-profile -> Book appointment
                           -> select-time-slot -> review-appointment
                           -> booking-confirmed

            `find-care` is a directory root and takes no params, so there is
            nothing to carry — the push is complete as written.

            The shared `Button`, not a sixth hand-rolled Pressable: this file
            already draws four (Reschedule / Cancel / View Summary and the tabs),
            all of them private, and the flagged structural clean-up above says
            those move to the design system as one job. A NEW control has no
            reason to join the queue.

            `shadow={false}` is not cosmetic. `Button`'s primary variant carries
            the `elevation/cta` blur by default, and this screen's closing note
            states plainly that nothing on it floats — no sheet, menu, dialog,
            toast or FAB — which is why every shadow here was deleted rather than
            retokenised. An inline CTA in a scrolling page is not a floating
            surface, so it must opt out or that statement stops being true.

            It sits above the segmented control on purpose: booking is not a
            property of the Upcoming tab or the Past tab, and putting it inside
            either would make it disappear when you switched. */}
        <Button
          label="Book new appointment"
          variant="primary"
          size="cta"
          leadingIcon="add"
          shadow={false}
          onPress={() =>
            // Route added in an earlier iteration — typedRoutes regenerates the
            // pathname union on the next dev server start, matching the cast the
            // Reschedule push below already uses.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.push("/(app)/find-care" as any)
          }
          className="mb-md"
        />

        {/* Tabs */}
        <View
          className="mb-md flex-row border-b border-outline-variant/40"
          style={{ marginHorizontal: -4 }}
        >
          <TabButton
            label="Upcoming"
            active={tab === "upcoming"}
            onPress={() => setTab("upcoming")}
          />
          <TabButton
            label="Past"
            active={tab === "past"}
            onPress={() => setTab("past")}
          />
        </View>

        {/* List.

            The three async states are inline rather than shared components:
            `EmptyState 517:1773` and `ErrorPanel 517:2111` are approved in
            Figma and have no code counterpart yet. Building both here would
            make this screen their unreviewed first draft. Logged in
            docs/PIPELINE.md §5; when they land, these three blocks collapse
            into instances. */}
        <View className="gap-md">
          {isPending ? (
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Loading your appointments"
              className="items-center gap-sm py-2xl"
            >
              <ActivityIndicator color={spinner} />
              <Text className="text-on-surface-variant" style={{ fontSize: 14 }}>
                Loading your appointments…
              </Text>
            </View>
          ) : isError ? (
            <View className="items-center gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
              <Icon chrome="error-outline" size={24} color={dangerGlyph} />
              <Text
                className="text-center text-on-surface"
                style={{ fontSize: 15, fontWeight: "600" }}
              >
                We couldn&rsquo;t load your appointments
              </Text>
              {/* The message, not just "something went wrong": a patient who
                  can tell an offline phone from a server fault knows whether
                  retrying is worth anything. */}
              <Text
                className="text-center text-on-surface-variant"
                style={{ fontSize: 13 }}
              >
                {error instanceof Error && error.message
                  ? error.message
                  : "Check your connection and try again."}
              </Text>
              <Button
                label={isRefetching ? "Retrying…" : "Try again"}
                variant="secondary"
                onPress={() => void refetch()}
                disabled={isRefetching}
                accessibilityLabel="Retry loading appointments"
              />
            </View>
          ) : rows.length === 0 ? (
            <View className="items-center gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
              <Icon chrome="calendar-today" size={24} color={mutedGlyph} />
              <Text
                className="text-center text-on-surface"
                style={{ fontSize: 15, fontWeight: "600" }}
              >
                {tab === "upcoming" ? "No upcoming appointments" : "No past appointments"}
              </Text>
              <Text
                className="text-center text-on-surface-variant"
                style={{ fontSize: 13 }}
              >
                {tab === "upcoming"
                  ? "When you book with a clinician, it will appear here."
                  : "Appointments you have attended will be listed here."}
              </Text>
              {/* Only on Upcoming: offering "Book" under the history tab
                  answers a question the user did not ask. */}
              {tab === "upcoming" ? (
                <Button
                  label="Find a clinician"
                  variant="primary"
                  onPress={() => router.push("/(app)/find-care" as never)}
                />
              ) : null}
            </View>
          ) : tab === "upcoming" ? (
            upcoming.map((a) => <UpcomingCard key={a.id} appointment={a} />)
          ) : (
            past.map((a) => <PastCard key={a.id} appointment={a} />)
          )}
        </View>
      </ScrollView>
      {/* No bottom nav — DetailShell has no prop for one, structurally, and
          docs/BRAND.md §App shell forbids one on a detail screen. */}
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  // Both were literals, and both are the SAME role in two states rather than
  // two colours: the selected tab's indicator and its label are the accent
  // (`primary`), the unselected label is de-emphasised body content
  // (`on-surface-variant`). `#3d4947` is the light value of the latter, but the
  // match is a coincidence — read as a colour it would have stayed a
  // near-black grey on a near-black page, which is what the dark capture shows
  // for "Past". `transparent` stays literal: the unselected tab has no
  // indicator, which is an absence, not a colour.
  const accent = useTokenColor("primary");
  const muted = useTokenColor("on-surface-variant");

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 14,
        alignItems: "center",
        borderBottomWidth: 2,
        borderBottomColor: active ? accent : "transparent",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: active ? accent : muted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Modality badge (Figma 550:2613)
// ---------------------------------------------------------------------------

/**
 * "In person" / "Video call", beside the Confirmed pill.
 *
 * WHY IT IS AN OUTLINED PILL AND NOT A SECOND FILLED ONE. It sits immediately
 * next to the status pill, and status is the higher-stakes signal — whether the
 * appointment is happening at all. Two filled containers in one row read as two
 * statuses and make the eye choose; the frame's `outline-variant` hairline on the
 * card's own surface puts the modality one level down, which is the hierarchy
 * 550:2613 draws. It also means the badge carries no status tone it has not
 * earned: a video visit is neither good news nor a warning.
 *
 * COLOUR IS NOT THE SIGNAL, and here it could not be even in principle — both
 * variants are the same neutral pair. The GLYPH plus the WORDS carry the
 * difference (docs/BRAND.md §Colour rules), so this reads identically to someone
 * who cannot distinguish the two glyph shapes.
 *
 * The glyphs are `chrome`, matching `location-on` two rows above in this same
 * card and the `videocam` the confirmation screen's checklist already uses:
 * neither modality is a clinical concept with a Health Icon, and `hospital`
 * (a building) would be wrong for "you are attending in person".
 */
const MODALITY: Record<AppointmentMode, { icon: "location-on" | "videocam"; label: string }> = {
  "in-person": { icon: "location-on", label: "In person" },
  video: { icon: "videocam", label: "Video call" },
};

function ModalityBadge({ mode }: { mode: AppointmentMode }) {
  const label = useTokenColor("on-surface-variant");
  // The `?? "in-person"` is not dead code the type system makes unreachable:
  // `mode` crosses a network boundary, and an unindexed value here would throw
  // INSIDE the card and take the whole appointments list down with it — a badge
  // must never be able to cost a patient sight of when they are due. Same
  // direction as the adapter's fallback, for the same asymmetry.
  const m = MODALITY[mode] ?? MODALITY["in-person"];

  return (
    <View
      // Not `accessibilityRole="text"`: grouping the glyph and the words under
      // one label is what stops a screen reader announcing an icon name beside
      // the word it already said.
      accessible
      accessibilityLabel={m.label}
      className="flex-row items-center border border-outline-variant"
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        gap: 4,
      }}
    >
      {/* Decorative — `accessible` above already speaks the label. */}
      <Icon chrome={m.icon} size={14} color={label} />
      <Text
        className="text-on-surface-variant"
        // 12, the ramp's floor, matched to the Confirmed pill beside it so the
        // two pills share a baseline and a cap height.
        style={{ fontSize: 12, fontWeight: "600" }}
      >
        {m.label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Upcoming card
// ---------------------------------------------------------------------------

function UpcomingCard({
  appointment,
}: {
  appointment: UpcomingAppointment;
}) {
  const statusStyle = STATUS_STYLES[appointment.status];
  // Icon `color` and a Pressable's style-callback background are the two things
  // that cannot be a class, so they resolve by TOKEN NAME for the current mode
  // (src/lib/tokens.ts) instead of carrying a hex.
  const mutedGlyph = useTokenColor("on-surface-variant");
  const accent = useTokenColor("primary");
  const neutralLabel = useTokenColor("on-surface");
  const danger = useTokenColor("error");
  // The pressed wash is the same accent at the same 8% the literals used, so
  // the press feels identical — it just composites over whichever card surface
  // is underneath in the current mode.
  const accentPressed = useTokenColor("primary", 0.08);
  const dangerPressed = useTokenColor("error", 0.08);

  return (
    // Card: no drop shadow (docs/BRAND.md §Elevation). The hairline goes from
    // `outline-variant/30` to FULL strength, because with the blur gone the
    // hairline and the fill step are the entire separation — a 30% hairline
    // against a near-equal background is no edge at all.
    //
    // FLAGGED for a later pass, deliberately NOT done here: this is not the
    // shared `Card`. Adopting it would take the radius 12 -> 24 on this card
    // only, and UpcomingCard/PastCard are a matched pair rendered in the same
    // list — half-migrating them would trade one inconsistency for a worse,
    // more local one. Both should move to `Card` together, along with this
    // screen's ~30 literal hexes, as one job.
    <View className="rounded-xl border border-outline-variant bg-card-surface p-md">
      {/* Header row */}
      <View className="mb-md flex-row items-start gap-sm">
        <View className="flex-1 flex-row items-center gap-md">
          {/* `AvatarWithFallback`, not a raw `<Image>`. The photo_url on a
              doctor profile routinely does not resolve — the seeded ones point
              at a host that does not exist — and a dead <Image> renders as a
              56px hole with the name floating beside it, which reads as a
              broken screen rather than a doctor with no photo. The fallback
              chain (image -> initials -> silhouette) is exactly this case. */}
          <AvatarWithFallback
            uri={appointment.avatarUri || null}
            initials={initialsOf(appointment.doctorName)}
            label={appointment.doctorName}
            size={56}
            tone="tint"
          />
          <View className="flex-1">
            <Text
              className="text-on-surface"
              style={{ fontSize: 20, fontWeight: "600" }}
              numberOfLines={1}
            >
              {appointment.doctorName}
            </Text>
            {appointment.specialty ? (
              <Text
                className="text-primary mt-xs"
                // 14px title case, per the frame. It was 10px uppercase with
                // letterspacing — an eyebrow treatment, which made a clinician's
                // specialty shout ("GENERAL PRACTICE") where the design reads it
                // as a quiet subtitle. 10px also sat under BRAND's 12sp floor.
                style={{ fontSize: 14, fontWeight: "600" }}
                numberOfLines={1}
              >
                {appointment.specialty}
              </Text>
            ) : null}
            {/* Hidden when unknown. `BookingOut` has no facility and the doctor
                profile has no practice address, so this row is empty for every
                real appointment today — and a location pin with nothing beside
                it reads as a failed load rather than an absent fact. */}
            {appointment.facility ? (
              <View className="mt-xs flex-row items-center gap-xs">
                {/* Decorative — the facility name is right beside it. */}
                <Icon chrome="location-on" size={14} color={mutedGlyph} />
                <Text
                  className="text-on-surface-variant"
                  style={{ fontSize: 12 }}
                  numberOfLines={1}
                >
                  {appointment.facility}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

      </View>

      {/* Status row.

          The pill used to share the identity row, which capped the name's
          width — at the frame's 20px a real clinician's name truncated to
          "Dr. Kwaben…". Figma 550:2613 puts it on its own row for exactly that
          reason, so the name gets the full card width. */}
      <View className="mb-md flex-row items-center gap-xs">
        <View
          className={statusStyle.bg}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
          }}
        >
          <Text
            className={statusStyle.text}
            style={{
              // 12, the ramp's floor. It was 11 — under BRAND's minimum, on the
              // one label that states whether the appointment is happening.
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {statusStyle.label}
          </Text>
        </View>
        {/* The modality badge, now buildable — the mode is stored on the row
            (migration 20260803_0002) instead of being discarded at the boundary,
            so this states a fact rather than guessing at one. */}
        <ModalityBadge mode={appointment.mode} />
      </View>

      {/* Date/Time strip */}
      <View
        className="mb-md flex-row items-center gap-sm rounded-lg bg-surface-container-low p-sm"
      >
        {/* Decorative — the date is the content of the row. */}
        <Icon chrome="calendar-today" size={20} color={accent} />
        <View className="flex-1">
          <Text
            className="text-on-surface"
            style={{ fontSize: 14, fontWeight: "600" }}
          >
            {appointment.dateLabel}
          </Text>
          <Text
            className="text-on-surface-variant mt-xs"
            style={{
              fontSize: 12,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {appointment.consultationType}
          </Text>
        </View>
      </View>

      {/* ==================================================================
          "Join video call" (Figma 550:1826) — video bookings ONLY, and only
          once there is a room to join.
          ==================================================================
          THREE STATES, not two, because the backend really has three:

            in-person              nothing here at all
            video + room_id        the join button
            video + room_id null   a pending note, NOT a disabled button

          The third is not a defensive hypothetical. `provision_room` never
          raises: when `telemedicine_service` cannot create the room, the booking
          still returns 201 with `room_id: null` and one server-side log line.
          There is a real row in the seeded database in exactly that state. A
          button rendered over it would either be dead (a control that looks live
          and does nothing — the same defect as the confirmation screen's old
          share icon) or would have to invent a room id, which is the mistake
          that cost this project a round.

          WHY THE WAITING ROOM AND NOT THE CALL. `/(app)/telemedicine-consultation`
          is the call itself; `/(app)/waiting-room` is the screen that checks the
          microphone, the camera and the connection, lets the patient mute or
          turn the camera off BEFORE anyone sees them, and then
          `router.replace()`s into the consultation once the other side is ready.
          Routing straight to the consultation would skip the hardware check and
          drop a patient into a live video call with a camera they had no chance
          to configure — and it would strand them there, since the waiting room is
          also where the "provider hasn't joined yet" state is drawn. The
          consultation screen is reached THROUGH the waiting room, exactly as
          `WaitingRoomScreen.join` already does it.

          The room id travels as `sessionId`, which is the field
          `TelehealthSessionParams` already reserves for it — not a new param and
          not a URL. There is no `join_url` in this system: joining is
          `GET /v1/rooms/{id}/token` then `POST /v1/rooms/{id}/join`, so the
          handle is all the app needs and the route is built in-app from it. */}
      {appointment.mode === "video" ? (
        appointment.roomId ? (
          <Button
            label="Join video call"
            variant="primary"
            size="cta"
            leadingIcon="videocam"
            // Nothing on this screen floats (see the closing note), so the
            // primary variant's `elevation/cta` blur is opted out of here as it
            // is on "Book new appointment".
            shadow={false}
            className="mb-sm"
            accessibilityLabel={`Join video call with ${appointment.doctorName}`}
            onPress={() =>
              router.push({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                pathname: "/(app)/waiting-room" as any,
                params: {
                  // The room handle, under the name the telehealth session type
                  // already gives it.
                  sessionId: appointment.roomId,
                  appointmentId: appointment.id,
                  providerId: appointment.doctorId,
                  providerName: appointment.doctorName,
                  providerSpecialty: appointment.specialty,
                  providerAvatar: appointment.avatarUri,
                  startAt: appointment.startsAtIso,
                  // The patient's own view. `parseViewerRole` defaults to this
                  // anyway; stating it means a future practitioner entry point
                  // cannot inherit the wrong one by omission.
                  viewerRole: "patient",
                },
              })
            }
          />
        ) : (
          /* Pending, stated in words. Not a disabled "Join video call" — a
             greyed control tells the patient they are doing something wrong,
             when in fact the room is not ready and there is nothing for them to
             do. `InfoCallout` is not used: it is a page-level tint and this is
             inside a card, which the component's own header rules out. */
          <View
            className="mb-sm flex-row items-start gap-sm rounded-lg border border-outline-variant p-sm"
            accessible
            accessibilityLabel="Video link pending. We'll add the join button to this appointment as soon as the room is ready."
          >
            {/* Decorative — the sentence beside it says the same thing. */}
            <Icon chrome="schedule" size={20} color={mutedGlyph} />
            <View className="flex-1">
              <Text className="text-on-surface" style={{ fontSize: 14, fontWeight: "600" }}>
                Video link pending
              </Text>
              <Text className="text-on-surface-variant mt-xs" style={{ fontSize: 12 }}>
                We&rsquo;ll add the join button here as soon as the room is ready.
              </Text>
            </View>
          </View>
        )
      ) : null}

      {/* Action buttons */}
      <View className="flex-row gap-sm">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reschedule appointment"
          onPress={() =>
            router.push({
              // Route added this iteration — typedRoutes regenerates on dev server start.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pathname: "/(app)/select-time-slot" as any,
              params: {
                practitionerName: appointment.doctorName,
                practitionerSpecialty: appointment.specialty,
                practitionerAvatar: appointment.avatarUri,
              },
            })
          }
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: accent,
            backgroundColor: pressed ? accentPressed : "transparent",
            alignItems: "center",
          })}
        >
          {/* `on-surface`, not the accent. The frame gives Reschedule a
              neutral label inside an `outline-variant` border: it is the
              secondary of the two actions, and painting it brand-teal made it
              compete with Cancel's error red for the eye. */}
          <Text style={{ color: neutralLabel, fontSize: 14, fontWeight: "600" }}>
            Reschedule
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel appointment"
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: danger,
            backgroundColor: pressed ? dangerPressed : "transparent",
            alignItems: "center",
          })}
          onPress={() => {
            // TODO: hook into DELETE /v1/appointments/:id once ready.
          }}
        >
          <Text style={{ color: danger, fontSize: 14, fontWeight: "600" }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Past card
// ---------------------------------------------------------------------------

function PastCard({ appointment }: { appointment: PastAppointment }) {
  const { scheme } = useResolvedScheme();
  const mutedGlyph = useTokenColor("on-surface-variant");
  // The avatar placeholder silhouette is deliberately low-emphasis, which is
  // what `outline` is for — it clears the 3:1 icon floor in both modes without
  // reading as content.
  const placeholderGlyph = useTokenColor("outline");
  // M3 state layer rather than a second grey: the tonal button's own surface
  // tinted 8% towards its content colour. The literals were `#dee4e1` resting
  // and `#d6dbd9` pressed — two hand-picked light greys that both stayed light
  // grey in dark mode, taking near-black "View Summary" text with them.
  const summaryPressed = blendTokens("surface-container-highest", "on-surface", 0.08, scheme);

  return (
    <View
      className="rounded-xl border border-surface-container-highest bg-surface-container p-md"
      style={{ opacity: 0.85 }}
    >
      <View className="mb-md flex-row items-start justify-between gap-sm">
        <View className="flex-1 flex-row items-center gap-md">
          {/* Avatar placeholder plate. `#d6dbd9` was `surface-dim`'s light
              value, which is the trap in miniature: `surface-dim` is the PAGE
              at its dimmest, and in dark mode it is #0E1514 — the plate would
              have vanished into the card it sits on. The role is a plate raised
              off a `surface-container` card, i.e. `surface-container-highest`,
              which steps the correct way in both modes. */}
          <View
            className="bg-surface-container-highest"
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Decorative — the doctor's name is beside it. */}
            <Icon chrome="person" size={28} color={placeholderGlyph} />
          </View>
          <View className="flex-1">
            <Text
              className="text-on-surface"
              style={{ fontSize: 15, fontWeight: "600" }}
              numberOfLines={1}
            >
              {appointment.doctorName}
            </Text>
            <Text
              className="text-outline mt-xs"
              style={{
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
              numberOfLines={1}
            >
              {appointment.specialty}
            </Text>
            <View className="mt-xs flex-row items-center gap-xs">
              {/* Decorative — the facility name is right beside it. */}
              <Icon chrome="location-on" size={14} color={mutedGlyph} />
              <Text
                className="text-on-surface-variant"
                style={{ fontSize: 12 }}
                numberOfLines={1}
              >
                {appointment.facility}
              </Text>
            </View>
          </View>
        </View>

        {/* "Completed" is the NEUTRAL status tone — a finished appointment
            carries no accent — which is `Badge`'s neutral pair: a surface step
            up from the card, labelled `on-surface-variant`. Same two tokens
            the literals happened to equal in light, chosen for the role. */}
        <View
          className="bg-surface-container-highest"
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
          }}
        >
          <Text
            className="text-on-surface-variant"
            style={{ fontSize: 11, fontWeight: "700" }}
          >
            Completed
          </Text>
        </View>
      </View>

      <Text
        className="text-on-surface-variant"
        style={{ fontSize: 11, marginBottom: 12 }}
      >
        {appointment.completedLabel}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View summary for appointment with ${appointment.doctorName}`}
        onPress={() => {
          // TODO: route to consultation summary screen once ready.
        }}
        className="bg-surface-container-highest"
        style={({ pressed }) => ({
          width: "100%",
          paddingVertical: 10,
          borderRadius: 10,
          // Resting fill is the class above; only the pressed state needs a
          // resolved value, because NativeWind can't drive a style callback.
          ...(pressed ? { backgroundColor: summaryPressed } : null),
          alignItems: "center",
        })}
      >
        {/* `#171d1c` is `on-surface`'s light value, and here it genuinely IS
            on-surface — the label of a tonal surface, not a filled accent. It
            flips to #DEE4E1 on the dark plate. */}
        <Text className="text-on-surface" style={{ fontSize: 13, fontWeight: "600" }}>
          View Summary
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shadows — none. There is no `appBarShadow` constant here any more.
// ---------------------------------------------------------------------------
// `appBarShadow` (black `0 2px 8px`) and `cardShadow` (slate-grey `0 4px 16px`)
// are gone with their callers; the last thing keeping `appBarShadow` even as a
// documented ghost was the hand-rolled bar, and that is gone too. Neither
// existed as a Figma effect or a token, and docs/BRAND.md §Elevation gives bars
// and cards surface tone plus a hairline. Nothing on this screen floats — no
// sheet, menu, dialog, toast or FAB — so nothing keeps a blur. DetailAppBar
// cannot be given one: it accepts no `style` and no `className`.
//
// ---------------------------------------------------------------------------
// DONE IN THE DARK-MODE PASS (2026-08-02): the literals are gone
// ---------------------------------------------------------------------------
// Every literal colour above is now a token, chosen by the ROLE of the element
// rather than by matching its light-mode hex — the two `#3d4947`s are
// `on-surface-variant` because they are de-emphasised content, but `#008378`
// is NOT `primary-container`, because that token is a surface and was being
// used as a label. See STATUS_STYLES.
//
// The raw `MaterialIcons` import went with them. It had to: an icon's `color`
// is a prop, not a class, so tokenising the four glyphs meant touching those
// exact call sites, and docs/BRAND.md allows exactly one file to import an icon
// library. All four are decorative and sit beside their own label, so they pass
// no `label` and stay hidden from assistive tech.
//
// ---------------------------------------------------------------------------
// STILL FLAGGED, deliberately NOT done here
// ---------------------------------------------------------------------------
//  1. STRUCTURE. The two cards are still not the shared `Card`, and the two
//     status pills are still not the shared `Badge` — they only borrow those
//     components' tokens. Adopting them takes the card radius 12 -> 24 and the
//     pill to uppercase 10px, i.e. a layout change. UpcomingCard and PastCard
//     are a matched pair in one list and must move together, in one job.
//  2. TYPE. This screen sets 10, 11, 13 and 15px inline and none of it is on
//     the BRAND ramp; 10 and 11 are under the 12sp floor outright (the status
//     pills, the two uppercase eyebrows, "Completed on …", "View Summary").
//     Out of scope for a colour pass — resizing type reflows all four cards —
//     but it is a live accessibility defect, not a preference.
//  3. AVATARS. `UpcomingCard` still <Image>s a Google-CDN URI with no fallback,
//     which docs/BRAND.md §App shell forbids ("photo -> initials -> person
//     silhouette"). `AvatarWithFallback` is the fix and belongs with (1).
