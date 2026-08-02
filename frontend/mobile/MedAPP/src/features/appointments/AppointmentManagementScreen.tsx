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
//   - status pills (Confirmed / In Review / Completed) → inline-coloured pills.
//   - Past tab uses muted/grayscale cards with "View Summary" CTA.
//   - location_on → location-on. calendar_today → calendar-today.
//   - Seed data with two upcoming + two past appointments. Replace with
//     useQuery(["appointments"]) once GET /v1/appointments ships.

import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Button, Icon } from "@/components/ui";
import { blendTokens, useTokenColor } from "@/lib/tokens";
import { useResolvedScheme } from "@/lib/theme";

type AppointmentStatus = "confirmed" | "in_review" | "completed";

interface UpcomingAppointment {
  id: string;
  doctorName: string;
  specialty: string;
  facility: string;
  avatarUri: string;
  status: Exclude<AppointmentStatus, "completed">;
  dateLabel: string; // "Tuesday, Oct 24 • 10:30 AM"
  consultationType: string;
}

interface PastAppointment {
  id: string;
  doctorName: string;
  specialty: string;
  facility: string;
  completedLabel: string; // "Completed on Monday, Sep 12 • 09:00 AM"
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const UPCOMING_APPOINTMENTS: UpcomingAppointment[] = [
  {
    id: "u1",
    doctorName: "Dr. Julian Sterling",
    specialty: "Senior Cardiologist",
    facility: "Mayo Clinic",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAiCdPvTk5RydHAjrMHk72Eu7sJRi3EI57s2zitwSnJw6fR-Ha-75XWdA2MjoxR9CgW1wk4Y8yWmBM9J3gwdHmLwACfEvc95ECOnqZEK6DpOt3Oo7QykCYlrP8rJJWJufV5bAB3vX_s7TNJHzOGgSULtrFO6uXN_V3vctBselslwyizvCrqX9Nt3f-WdJe5uLMji_TUyIxJIg3P9U5o7jTAfkBlf9jQB3IC9HNo2nT-65KTN6CRo5NF1wubrcTf-0jyGZE5avuAlAfI",
    status: "confirmed",
    dateLabel: "Tuesday, Oct 24 • 10:30 AM",
    consultationType: "Standard Consultation",
  },
  {
    id: "u2",
    doctorName: "Dr. Sarah Chen",
    specialty: "Neurologist",
    facility: "City General Hospital",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDl7Ao6Zlxrvg6hZCBJTCl40sfWi4jza2v_8V2IvenJxJRKcNiS5oSwi_3sak71g9LTAwWORqC63YbXcdPYebOLPq7sqLDZ3gK1ge88lmh8urol79cqtLcvqFW2FQgsaVKt3XZVUdomuZCytDil2ZqoQVZ1cY5BIkgZlao0j2WEiUZ42sDIx2QIJ6DWDYMaJG6IN22BOtX0PgVgM2tMFIe3uJHq2nh9Maeqz2xK3p5gtus1s64KG66RTL6zJ_k4rxovmczrWcxNaiqo",
    status: "in_review",
    dateLabel: "Thursday, Oct 26 • 02:15 PM",
    consultationType: "Follow-up Visit",
  },
];

const PAST_APPOINTMENTS: PastAppointment[] = [
  {
    id: "p1",
    doctorName: "Dr. Aris Thorne",
    specialty: "Physiotherapist",
    facility: "Wellness Hub",
    completedLabel: "Completed on Monday, Sep 12 • 09:00 AM",
  },
  {
    id: "p2",
    doctorName: "Dr. Emily Watts",
    specialty: "General Practitioner",
    facility: "Mayo Clinic",
    completedLabel: "Completed on Friday, Aug 28 • 11:30 AM",
  },
];

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
    bg: "bg-primary/10",
    text: "text-primary",
    label: "Confirmed",
  },
  in_review: {
    bg: "bg-tertiary/10",
    text: "text-tertiary",
    label: "In Review",
  },
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AppointmentManagementScreen() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

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

        {/* List */}
        <View className="gap-md">
          {tab === "upcoming"
            ? UPCOMING_APPOINTMENTS.map((a) => (
                <UpcomingCard key={a.id} appointment={a} />
              ))
            : PAST_APPOINTMENTS.map((a) => (
                <PastCard key={a.id} appointment={a} />
              ))}
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
    <View className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
      {/* Header row */}
      <View className="mb-md flex-row items-start justify-between gap-sm">
        <View className="flex-1 flex-row items-center gap-md">
          <Image
            source={{ uri: appointment.avatarUri }}
            style={{ width: 56, height: 56, borderRadius: 12 }}
            accessibilityLabel={appointment.doctorName}
          />
          <View className="flex-1">
            <Text
              className="text-on-surface"
              style={{ fontSize: 15, fontWeight: "600" }}
              numberOfLines={1}
            >
              {appointment.doctorName}
            </Text>
            <Text
              className="text-primary mt-xs"
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

        {/* Status pill — tone table above; both halves are classes now, so the
            tint and its label flip together instead of one of them freezing. */}
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
              fontSize: 11,
              fontWeight: "700",
            }}
          >
            {statusStyle.label}
          </Text>
        </View>
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
              fontSize: 10,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {appointment.consultationType}
          </Text>
        </View>
      </View>

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
          <Text style={{ color: accent, fontSize: 14, fontWeight: "600" }}>
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
