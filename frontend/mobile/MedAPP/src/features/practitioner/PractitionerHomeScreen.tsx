// Practitioner Home — the clinician's tab root.
//
// Figma page "Practitioner Shell" 1018:640:
//   1019:673   practitioner_home — today                  (the populated state)
//   1022:853   practitioner_home — no consultations today  (the empty state)
//   1022:16729 practitioner_home — DARK proof
//   1022:16777 practitioner_home @ 360dp (width proof)
//   1018:667   Consultation Card / Practitioner (local component)
//
// ============================================================================
// WHY THIS SCREEN EXISTS
// ============================================================================
// `PractitionerBottomNav` shipped five tabs with `home: null` and `profile:
// null`. They rendered dimmed, announced "Not available yet" and no-opped,
// because the destinations had never been built — two of five tabs dead on
// every practitioner screen in the app. This is one of the two destinations.
// The interim dimming in that file is deleted in the same change; its own
// comment named this screen as the condition for removing it.
//
// It is also the FIRST consumer of `GET /v1/bookings/schedule`, which shipped
// doctor-scoped and had no client at all.
//
// ============================================================================
// WHAT THE FRAME DRAWS THAT THE API CANNOT SUPPLY — read this before "fixing" it
// ============================================================================
// Three things on 1019:673 are NOT rendered here, and each omission is a
// decision, not an oversight:
//
//  1. **The patient's name.** The card draws "Ama Mensah". `BookingScheduleOut`
//     carries `patient_id` — an opaque UUID — and booking_service has no name
//     for anyone; its own docstring says resolving one "would turn a schedule
//     into a patient list". Nor is there a client-side route to one: the only
//     person-directory the gateway exposes is `/v1/doctors`, and a patient is
//     not a doctor. So the row renders `patientReference()` — a stable short
//     id — and never a name. Hardcoding "Ama Mensah" (the seeded patient) would
//     be correct for exactly one row and a lie for every other.
//
//  2. **"Persistent cough · follow-up".** That is `reason`, and
//     `BookingScheduleOut` WITHHOLDS it deliberately — Act 843 minimisation and
//     the HIPAA minimum-necessary standard, cited in the model's own docstring.
//     Hydrating it back with a fan-out of `GET /v1/bookings/{id}` would defeat
//     the minimisation on purpose. The line is absent.
//
//  3. **The "Edit" links** on the Availability section header (and the row
//     chevrons). There is no availability-editing screen in `src/app/(app)/`,
//     and `PUT /v1/doctors/{id}/availability` is a full replace with no UI to
//     compose one. An "Edit" that no-ops is the exact defect the dimmed tabs
//     were — a control that looks live and is not. Omitted; see the FLAG list
//     at the foot of this file.
//
// The Find Care listing row is the ONE thing on this screen with a real
// mutation behind it (`PATCH /v1/doctors/{doctor_id}`), and it deliberately does
// NOT toggle here — it is a read-only status line that routes to the profile,
// where the frame actually draws a switch (1020:16104). One toggle, one home.
//
// ============================================================================
// SHELL AND TOKENS
// ============================================================================
// `<PractitionerShell activeTab="home" hideBack>` — a tab root, so no back
// button (docs/BRAND.md §App shell). Every colour is a token class or comes
// through `useTokenColor`; no raw hex. Every glyph is the shared `<Icon />`.
// Shared components are instanced, not re-drawn: `SectionHeader`, `Card`,
// `KeyValueRow`, `Badge`, `Button`, `AvatarWithFallback`, `IconTile`.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. Only expo-router is used.

import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { PractitionerShell } from "@/components/shell";
import {
  AvatarWithFallback,
  Badge,
  Button,
  Card,
  Icon,
  IconTile,
  KeyValueRow,
  SectionHeader,
} from "@/components/ui";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTokenColor } from "@/lib/tokens";
import { practitionerApi, type ScheduleEntry } from "./api";
import {
  entriesToday,
  greetingFor,
  longDate,
  patientInitials,
  patientReference,
  surnameFor,
  timeRange,
  weeklyHours,
} from "./format";

/** Frame 1019:675: the scroll content sits in a 16dp gutter, 16 from the top. */
const GUTTER = 16;
/** Card 1019:721 insets its rows by 16 and separates them with a 1px divider. */
const ROW_GAP = 16;
const AVATAR = 40;
const CHEVRON = 22;

export function PractitionerHomeScreen() {
  const user = useCurrentUser();
  const onSurfaceVariant = useTokenColor("on-surface-variant");

  // ONE clock read for the whole render, captured here rather than inside the
  // three helpers that need it. Two `new Date()` calls a millisecond apart can
  // straddle midnight, and "Good evening ... Thursday 6 August" above a list
  // filtered to Wednesday is a bug nobody would reproduce on demand.
  const now = useMemo(() => new Date(), []);

  // `GET /v1/bookings/schedule`. No identifier — authorization is the caller's
  // own token, which is what removes the IDOR an authorising `?doctor_id=`
  // would have created.
  const scheduleQuery = useQuery({
    queryKey: ["practitioner", "schedule"],
    queryFn: () => practitionerApi.listSchedule(),
  });

  // The clinician's own doctor profile, for the specialty in the context line
  // and for the availability card. `enabled` on the user id because
  // `findMyProfile` scans the directory for it and cannot run without one —
  // see the header of api.ts for why there is no `GET /v1/doctors/me`.
  const profileQuery = useQuery({
    queryKey: ["practitioner", "profile", user?.id],
    queryFn: () => practitionerApi.findMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });

  const availabilityQuery = useQuery({
    queryKey: ["practitioner", "availability", profileQuery.data?.doctorId],
    queryFn: () => practitionerApi.listAvailability(profileQuery.data!.doctorId),
    enabled: Boolean(profileQuery.data?.doctorId),
  });

  const profile = profileQuery.data ?? null;
  const hours = weeklyHours(availabilityQuery.data ?? []);

  // "Today" is the client's calendar day — the day the clinician is standing in,
  // which is the question the heading asks. Cancelled entries are KEPT: per
  // `BookingScheduleOut`, a cancelled row must render rather than vanish "or the
  // clinician cannot tell 'cancelled' from 'never booked'".
  const today = entriesToday(scheduleQuery.data ?? [], now);
  const next = today.find((e) => e.status === "booked") ?? today[0] ?? null;

  const surname = surnameFor(user?.displayName);
  const greeting = surname
    ? `${greetingFor(now)}, Dr. ${surname}`
    : // No name, no fabricated one. The greeting still works as a greeting.
      greetingFor(now);

  // "General Practice · Wednesday 5 August". The specialty half is dropped
  // rather than replaced when the profile has none — a middot with nothing
  // before it reads as a rendering fault.
  const context = [profile?.specialty, longDate(now)].filter(Boolean).join(" · ");

  return (
    <PractitionerShell activeTab="home" hideBack testID="practitioner-home">
      <ScrollView
        contentContainerStyle={{ padding: GUTTER, gap: ROW_GAP }}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting + context (1019:676 / 1019:677). `header` so a screen
            reader's heading rotor lands on the screen's own name — the app bar
            carries only the logo, so without this the screen is anonymous. */}
        <View>
          <Text
            accessibilityRole="header"
            className="font-headline-xl text-headline-xl text-on-surface"
          >
            {greeting}
          </Text>
          <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">{context}</Text>
        </View>

        {/* ================================================================
            Next consultation / Today (1019:678 vs 1022:858)
            ================================================================
            The two frames use DIFFERENT headings for the same slot, and that is
            deliberate rather than a design inconsistency: "Next consultation"
            names a thing that exists, "Today" names a period that is empty. A
            heading reading "Next consultation" above "No consultations today"
            would be self-contradicting. */}
        <SectionHeader title={next ? "Next consultation" : "Today"} />

        {scheduleQuery.isPending ? (
          <Card>
            <View className="items-center py-6">
              <ActivityIndicator accessibilityLabel="Loading your schedule" />
            </View>
          </Card>
        ) : scheduleQuery.isError ? (
          // A failed read is stated, not rendered as emptiness. "No
          // consultations today" when the request actually failed would tell a
          // clinician their day is clear when it may not be — the highest-cost
          // wrong answer this screen can give.
          <Card>
            <Text className="font-headline-md text-headline-md text-on-surface">
              Schedule unavailable
            </Text>
            <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
              Your schedule could not be loaded. This does not mean your day is clear — check
              your connection and try again.
            </Text>
            <Button
              label="Try again"
              variant="outline"
              size="md"
              className="mt-4"
              onPress={() => void scheduleQuery.refetch()}
            />
          </Card>
        ) : next ? (
          <ConsultationCard entry={next} />
        ) : (
          <EmptyToday hoursLabel={hours.label} />
        )}

        {/* ================================================================
            Availability (1019:711 / 1019:721)
            ================================================================
            NO "Edit" action on this header, though the frame draws one. There is
            no availability-editing screen and `PUT /v1/doctors/{id}/availability`
            is a whole-collection replace with no UI to compose a payload. See
            the FLAG list at the foot of this file. */}
        <SectionHeader title="Availability" />
        <Card>
          <KeyValueRow
            label="Weekly hours"
            value={hours.label ?? "No consulting hours set"}
            {...(hours.timezone ? { badge: { label: hours.timezone, tone: "success" } } : {})}
          />
          <View className="my-4 h-px bg-outline-variant" />
          <KeyValueRow
            label="Find Care listing"
            value={profile?.isListable ? "Visible to patients" : "Hidden from patients"}
            badge={{
              label: profile?.isListable ? "On" : "Off",
              // `neutral`, not `error`: being unlisted is a choice a clinician
              // made, not a fault. An error tint would scold them for it.
              tone: profile?.isListable ? "success" : "neutral",
            }}
          />
        </Card>

        {/* ================================================================
            Patients (1019:745) — the one navigational row on this screen.
            ================================================================
            It routes to a route that EXISTS. The "-2" in the path is vestigial
            (there is no roster 1); PractitionerBottomNav carries the note about
            renaming it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Active patient roster"
          accessibilityHint="Triage and review your patients"
          onPress={() => router.push("/(app)/active-patient-roster-2")}
          className="active:opacity-70"
        >
          <Card>
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1">
                <Text className="font-label-md text-label-md text-on-surface">
                  Active patient roster
                </Text>
                <Text className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
                  Triage and review your patients
                </Text>
              </View>
              {/* Decorative: the Pressable above carries the name and the hint. */}
              <Icon chrome="chevron-right" size={CHEVRON} color={onSurfaceVariant} />
            </View>
          </Card>
        </Pressable>
      </ScrollView>
    </PractitionerShell>
  );
}

// ---------------------------------------------------------------------------
// Consultation Card / Practitioner — Figma local component 1018:667
// ---------------------------------------------------------------------------
// Kept private to this screen rather than promoted to `src/components/ui/`:
// it is a LOCAL component on the Figma page (1018:641 "Local Components —
// Practitioner Shell"), instanced by exactly one frame, and BRAND's rule is to
// share what is shared — not to pre-emptively export a one-caller component and
// invite a second, differently-shaped caller to bend it.
// ---------------------------------------------------------------------------

function ConsultationCard({ entry }: { entry: ScheduleEntry }) {
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const cancelled = entry.status === "cancelled";

  return (
    <Card testID="next-consultation-card">
      {/* Modality + status (1018:667's top row). Both are FACTS on the wire —
          `mode` and `status` — unlike the patient-side card, which had to drop
          an "In Review" pill that no backend state produces. */}
      <View className="flex-row items-center gap-2">
        <Badge
          label={entry.mode === "video" ? "Video call" : "In person"}
          icon={entry.mode === "video" ? "videocam" : "place"}
          tone="neutral"
        />
        <Badge label={cancelled ? "Cancelled" : "Confirmed"} tone={cancelled ? "error" : "success"} />
      </View>

      <Text
        className="mt-3 font-headline-lg text-headline-lg text-on-surface"
        // Struck through when cancelled, per `BookingScheduleOut`: the row must
        // stay visible and legible as cancelled. The status badge beside it is
        // the non-visual channel, so the strike is never the only signal.
        style={cancelled ? { textDecorationLine: "line-through" } : undefined}
      >
        {timeRange(entry.startsAtIso, entry.endsAtIso)}
      </Text>

      {/* The patient row. NO NAME and NO REASON — see the header. The avatar
          initials come from the id because there is nothing else to derive them
          from; they are decorative and the text beside them is what is read. */}
      <View className="mt-3 flex-row items-center gap-3">
        <AvatarWithFallback
          size={AVATAR}
          initials={patientInitials(entry.patientId)}
          tone="secondary"
          label={patientReference(entry.patientId)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View className="min-w-0 flex-1">
          <Text className="font-label-md text-label-md text-on-surface" numberOfLines={1}>
            {patientReference(entry.patientId)}
          </Text>
          {/* Where the frame prints "Persistent cough · follow-up". `reason` is
              withheld by the minimised projection, so this states WHY the line
              is short rather than leaving a mystery gap — and it is true: the
              detail read is where that text lives. */}
          <Text className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
            Consultation notes are not shown in the schedule
          </Text>
        </View>
      </View>

      {/* ==================================================================
          Join control — THREE states, matching the patient side exactly.
          ==================================================================
            in-person            nothing at all
            video + room_id      the join button
            video + room_id null a pending note, NOT a disabled button

          The third is not hypothetical: `provision_room` never raises, so a
          booking whose room could not be created still 201s with
          `room_id: null`, and there is a seeded row in that state. A button over
          it would be dead or would have to invent a room id.

          The waiting room, not the call — it is where the camera and microphone
          are checked before anyone is on screen. `viewerRole: "practitioner"` is
          passed explicitly; `parseViewerRole` defaults to "patient", and
          AppointmentManagementScreen's own comment anticipated exactly this
          entry point inheriting the wrong role by omission. */}
      {cancelled ? null : entry.mode === "video" ? (
        entry.roomId ? (
          <Button
            label="Join video room"
            variant="primary"
            size="cta"
            leadingIcon="videocam"
            fullWidth
            // Nothing on this screen floats, so the CTA's elevation is opted out
            // of, as AppointmentManagementScreen does for the same reason.
            shadow={false}
            className="mt-4"
            accessibilityLabel={`Join video room with ${patientReference(entry.patientId)}`}
            onPress={() =>
              router.push({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                pathname: "/(app)/waiting-room" as any,
                params: {
                  sessionId: entry.roomId,
                  appointmentId: entry.id,
                  patientId: entry.patientId,
                  startAt: entry.startsAtIso,
                  viewerRole: "practitioner",
                },
              })
            }
          />
        ) : (
          <View className="mt-4 flex-row items-center gap-2">
            <Icon chrome="schedule" size={18} color={onSurfaceVariant} />
            <Text className="flex-1 font-label-sm text-label-sm text-on-surface-variant">
              Video room pending — it is not ready yet.
            </Text>
          </View>
        )
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// EmptyState / No consultations today — Figma 1022:905
// ---------------------------------------------------------------------------

function EmptyToday({ hoursLabel }: { hoursLabel: string | null }) {
  return (
    <Card testID="no-consultations-today">
      <View className="items-center py-2">
        {/* IconTile, not a hand-rolled tinted circle — four hardcoded fills is
            what that component exists to have deleted. 1022:905 draws the plate
            at 56; `IconTileSize` is `40 | 32` and adding a third step is a
            token decision this screen does not own, so it takes the 40 and the
            difference is flagged below rather than hardcoded around. */}
        <IconTile icon="appointment" tone="primary" />
        <Text className="mt-4 text-center font-headline-md text-headline-md text-on-surface">
          No consultations today
        </Text>
        <Text className="mt-2 text-center font-body-md text-body-md text-on-surface-variant">
          {hoursLabel
            ? `Your ${hoursLabel} hours are open. Bookings appear here as patients make them.`
            : // The frame's copy names the hours. With no availability rules
              // there are none to name, and inventing "Mon – Fri 09:00–17:00"
              // would tell a clinician they are bookable when no patient can
              // book them at all.
              "You have no consulting hours set, so patients cannot book you yet."}
        </Text>
      </View>
    </Card>
  );
}

// ===========================================================================
// FLAGGED — what this screen cannot do, and what it would take
// ===========================================================================
//  * PATIENT NAMES. `BookingScheduleOut.patient_id` is opaque and nothing
//    resolves it. Needs either a name on the projection (which the model argues
//    against) or a patient-directory read the clinician is entitled to make.
//  * CONSULTATION REASON. Withheld by design. Reachable only per-patient via
//    `GET /v1/bookings/{booking_id}`, which needs a consultation-detail screen
//    that does not exist.
//  * "EDIT" ON AVAILABILITY. No editor screen, and `PUT .../availability` is a
//    whole-collection replace. Omitted rather than shipped dead.
//  * `GET /v1/doctors/me`. The specialty and availability here are found by
//    scanning `/v1/doctors?only_listable=false` for the caller's `user_id` —
//    see the header of api.ts. Works, but downloads the roster to read one row.
//  * NOTIFICATIONS. `PractitionerShell` takes `unreadCount`/`onNotificationsPress`
//    and this screen passes neither, so the bell is inert — the same gap
//    PractitionerAppBar already flags. There is no notifications model.
// ===========================================================================
