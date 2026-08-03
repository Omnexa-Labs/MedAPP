// Review Appointment — the last screen before anything is booked.
//
// Figma page 144:107: 756:4213 (light), 756:4988 (dark), 756:4442 (submitting),
// 756:4586 (confirm-failed), 756:4765 (discard), 756:4813 (no-data).
//
// Entry: SelectTimeSlotScreen → "Book Now" (pushes practitioner + date/time/
// mode/type/reason). Exit: Confirm → BookingConfirmedScreen (replace), Edit →
// back to a REHYDRATED slot picker, discard → router.dismissAll().
//
// ---------------------------------------------------------------------------
// WHAT THIS PASS CHANGED, AND WHY (build spec §3, required items 1/3/5/6)
// ---------------------------------------------------------------------------
//
// `FALLBACK` IS GONE. The file used to invent a whole appointment — a named
// cardiologist, a real Rochester street address, a 45-minute duration and a
// Google-CDN map tile — whenever a param was missing. On a medical booking
// screen that is the most dangerous line in the file: a user who deep-links or
// comes back to a dropped session was shown a plausible booking that nobody had
// made, at an address they could have driven to. It is also what made the
// no-data frame (756:4813) unreachable. Missing required params now render that
// frame instead: an expired session, stated as one.
//
// The same rule applies per row, not just per screen. Duration (756:4356 carries
// a "From provider" badge — a provenance claim), the clinic name and its address
// are rendered ONLY when the params carry them. A provenance badge over a
// hardcoded string is a lie with a certificate attached.
//
// CANCEL IS DELETED. `Edit` and `Cancel` were both `router.back()` — the same
// function under two labels, one of which promised to abandon the booking and
// did not. Abandon is now the app-bar back and Android's hardware back, both
// routed through a discard dialog (756:4765) that ends in `router.dismissAll()`.
// The hardware-back handler returns `true`: without it Android pops the screen
// out from behind the dialog it just opened.
//
// THE MAP IS DELETED, AND WITH IT THE ONE SURVIVING SHADOW. The old file kept a
// 30-line defence of the map pin's `0 2px 6px` floating shadow. The frames draw
// no map — the location is a `KeyValueRow` with a real "Directions" action — so
// the pin, `FLOATING_SHADOW`, `pinShadow` and the argument for them are all
// moot. `Linking.openURL` with a platform-native maps URL and an https fallback
// replaces a "Get Directions" chip that was decoration: it was never pressable.
//
// CONFIRM IS ASYNC. It was a synchronous `router.replace` — the screen could not
// fail, so three designed frames (submitting, confirm-failed, and the reference
// on screen 3) had nothing behind them. It is a mutation now, and the failure
// copy is deliberate: a user who is told nothing after a failed booking books
// twice, and a user who is not told "nothing has been charged" phones support.
//
// THE ENDPOINT WAS WRONG, AND THE SCREEN SHOULD NEVER HAVE HELD IT. The confirm
// call posted to `/v1/appointments`, which the gateway does not route and no
// service behind it defines — so every real Confirm 404'd and the confirmation
// screen was unreachable. The call now lives in `./api.ts` against the real
// `POST /v1/bookings`, and this file imports a typed function instead of a URL.
//
// With it went the two fields that were invented alongside the endpoint:
// `booking_reference` and `join_url` exist nowhere in the backend, so nothing is
// forwarded for them and the confirmation screen's reference/join rows simply do
// not render — which is exactly what its `params.bookingReference ? ...` guard
// was already written to do. What the server DOES return, the real start and end
// instants, is forwarded, and that is what powers the calendar handoff.
//
// ---------------------------------------------------------------------------
// THE PARAMS CONTRACT WITH SCREEN 1 — read this before adding a param
// ---------------------------------------------------------------------------
// This screen renders NOTHING it was not given (see `FALLBACK IS GONE` above),
// so every optional row here is dead in production until `SelectTimeSlotScreen`
// pushes the param behind it. The full contract, and who honours it today:
//
//   REQUIRED (absent -> 756:4813, the expired frame)
//     practitionerId        forwarded    doctor_id on the wire; a UUID
//     practitionerName      forwarded
//     date                  forwarded    "YYYY-MM-DD", never a display string
//     time                  forwarded    wall clock, "10:00 AM"
//     type                  forwarded    consultation TYPE
//     mode                  forwarded    "in-person" | "video" — the other axis
//
//   OPTIONAL, and each one gates a row
//     practitionerSpecialty forwarded
//     practitionerAvatar    forwarded
//     reason                forwarded
//     rating + reviewCount  NOT YET      the rating line (756:4213)
//     tags                  NOT YET      the badge row (756:4213)
//     endTime               NOT YET      "10:00 AM – 10:45 AM" instead of a start
//     timezone              NOT YET      the zone badge beside Time
//     duration              NOT YET      Duration + its "From provider" badge
//     locationName/Address  NOT YET      the whole Location card and Directions
//
// The six NOT YETs are the live gap: their branches are exercised by
// ReviewAppointmentScreen.test.tsx, but no user reaches them, because screen 1's
// params-out is only the nine above. `renders exactly what screen 1 sends today`
// in that suite pins that honestly rather than letting a green run imply the
// rows are live. Logged in docs/PIPELINE.md §5.
//
// IDENTITY — the rating is answered ONCE, by the params, or not at all.
// Screen 1 currently seeds a private `SEED_RATING = { 4.9, 1200 }` and this
// screen showed no rating at all, so the same clinician had two ratings and one
// of them was invented; 756:4213 draws a third ("4.8 (326 reviews)"). A number
// beside a doctor's name is a claim about a real person, so this screen will not
// mint one and will not default one: it renders the rating IT WAS HANDED, and
// nothing when it was handed none. Both screens reading the same two params is
// what makes them incapable of disagreeing — once screen 1 forwards the value it
// is displaying, the two are the same value by construction. A malformed or
// out-of-range value is treated as ABSENT, never clamped into a plausible one.
//
// APPEARANCE. Screen gutter 16 (was 24 — BRAND §Spacing always said 16), section
// headings on the `headline-md` ramp OUTSIDE their cards (was an 11px uppercase
// caption inside, under BRAND's 12sp floor), no blue anywhere (the file carried
// `#0058be`, `#d5e3fc`, `rgba(33,112,228,0.12)` and `rgba(0,88,190,0.05)`, none
// of which is a token or appears in a frame), and no hex literals at all — every
// one of them froze light mode and broke 756:4988.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.
// This file uses none: `Linking`, `Modal` and `BackHandler` are react-native.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import {
  Button,
  Card,
  DockedActionBar,
  Icon,
  IconTile,
  InfoCallout,
  KeyValueRow,
  PractitionerSummaryRow,
  SectionHeader,
} from "@/components/ui";
import { bookingApi } from "@/features/booking/api";
import { useTokenColor, useTokenShadow } from "@/lib/tokens";

/** Non-empty strings only; `null`, `""` and absent all collapse to `undefined`. */
function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * `"45 Minutes"` / `"1 hr 15 min"` -> 75. The duration param is a DISPLAY string
 * from the provider; the wire wants an `ends_at`. Anything unparseable returns
 * undefined rather than a number, so `api.ts` falls through to its own
 * documented default instead of booking a window derived from a misread label.
 */
function parseDurationMinutes(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const hours = /(\d+)\s*(?:h|hr|hour)/i.exec(value);
  const minutes = /(\d+)\s*(?:m|min|minute)/i.exec(value);
  if (!hours && !minutes) return undefined;
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  return total > 0 ? total : undefined;
}

/**
 * `"4.8"` + `"326"` -> `{ value: 4.8, count: 326 }`, or undefined.
 *
 * BOTH halves are required: `PractitionerSummaryRow` draws "4.8 (326 reviews)"
 * as one line, and a value with no count renders "(NaN reviews)" beside a real
 * doctor's name. Out of range is treated as absent rather than clamped — a 7.2
 * that becomes a 5.0 is a fabricated rating with a rounding error's alibi. The
 * count must be a whole non-negative number; "326.5 reviews" is not a thing.
 */
function parseRating(
  value: string | undefined,
  count: string | undefined,
): { value: number; count: number } | undefined {
  if (!value || !count) return undefined;
  const parsedValue = Number(value.trim());
  const parsedCount = Number(count.trim());
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 5) return undefined;
  if (!Number.isInteger(parsedCount) || parsedCount < 0) return undefined;
  return { value: parsedValue, count: parsedCount };
}

/**
 * `"Cardiology,Top Rated"` -> `["Cardiology", "Top Rated"]`. Route params are
 * strings, so a list has to travel as one; comma is the separator because no tag
 * in any frame contains one. Blanks and duplicates are dropped (a duplicate is a
 * serialisation artefact, and `PractitionerSummaryRow` keys on the tag), and an
 * empty result is `undefined` so the row takes its `Show tags = false` variant
 * rather than rendering an empty badge strip.
 */
function parseTags(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const tags = [...new Set(value.split(",").map((t) => t.trim()).filter(Boolean))];
  return tags.length > 0 ? tags : undefined;
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export type ConsultationMode = "in-person" | "video";

/**
 * Consultation MODE is a separate axis from consultation TYPE — a "Follow-up
 * Visit" can be either. The two were collapsed before, which is why the screen
 * could not decide whether to show an address or a join link, and why the
 * confirmation screen's checklist told video patients to arrive ten minutes
 * early. Anything that is not one of the two designed values is treated as
 * absent rather than guessed at.
 */
function readMode(value: string | undefined): ConsultationMode | undefined {
  return value === "in-person" || value === "video" ? value : undefined;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * "2025-05-13" → "Tuesday, 13 May 2025" (756:4213).
 *
 * Formatting lives at the LEAF: screen 1 sends an ISO date, because it also has
 * to round-trip that value back into its own date strip when the user taps Edit,
 * and `"Tue, May 13"` is not a key. Anything that is not an ISO date is passed
 * through untouched rather than reformatted into something it is not — an
 * unparseable date must never become a different date.
 *
 * Built from local Y/M/D parts, not `new Date(iso)`, which parses a bare date as
 * UTC and lands on the previous day west of Greenwich.
 */
function formatLongDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return value;
  return `${WEEKDAYS[date.getDay()]}, ${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** Route params drop `undefined` rather than serialising the string "undefined". */
function defined(params: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const POLICY =
  "Free cancellation until 24 hours before the appointment. After that, a $10 processing fee may apply.";

/** 756:4586. The "nothing has been charged" clause is load-bearing, not padding. */
function failureCopy(status: number | undefined, time: string, practitioner: string) {
  if (status === 409) {
    return {
      title: "That slot was just taken",
      body: `Someone booked ${time} with ${practitioner} while you were reviewing. Nothing has been charged. Pick another time to continue.`,
    };
  }
  return {
    title: "We couldn't confirm this booking",
    body: "Nothing has been booked and nothing has been charged. Check your connection and try again, or pick another time.",
  };
}

/**
 * A dialog IS one of docs/BRAND.md's sanctioned floating roles ("a bottom sheet,
 * a menu, a dialog, a toast"), and it is the ONLY elevation in this flow. The
 * `0 2px 6px` at 8% step, tinted with the `shadow` token — never grey, never the
 * 24px-blur card signature BRAND removed.
 */
const DIALOG_SHADOW = { y: 2, blur: 6, opacity: 0.08 } as const;

/** 756:4813 / 756:4586 — the error plate diameters. */
const ERROR_PLATE_LARGE = 56;
const ERROR_PLATE_SMALL = 40;
/** Clears the `Buttons=Pair` bar (115) plus its footnote and a little air. */
const DOCKED_CLEARANCE = 168;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function ReviewAppointmentScreen() {
  const params = useLocalSearchParams<{
    practitionerId?: string;
    practitionerName?: string;
    practitionerSpecialty?: string;
    practitionerAvatar?: string;
    /** Two halves of one claim — see `parseRating`. */
    rating?: string;
    reviewCount?: string;
    /** Comma-separated, e.g. `"Cardiology,Top Rated"` — see `parseTags`. */
    tags?: string;
    date?: string;
    time?: string;
    endTime?: string;
    timezone?: string;
    mode?: string;
    type?: string;
    reason?: string;
    duration?: string;
    locationName?: string;
    locationAddress?: string;
  }>();

  const practitionerName = text(params.practitionerName);
  const practitionerSpecialty = text(params.practitionerSpecialty);
  const date = text(params.date);
  const time = text(params.time);
  const endTime = text(params.endTime);
  const timezone = text(params.timezone);
  const type = text(params.type);
  const reason = text(params.reason);
  const duration = text(params.duration);
  const locationName = text(params.locationName);
  const locationAddress = text(params.locationAddress);
  const mode = readMode(params.mode);
  const rating = parseRating(text(params.rating), text(params.reviewCount));
  const tags = parseTags(text(params.tags));

  const [discardOpen, setDiscardOpen] = useState(false);

  const confirmMutation = useMutation({
    mutationFn: bookingApi.createBooking,
    onSuccess: (booking) => {
      router.replace({
        // Route added in an earlier iteration — typedRoutes regenerates on dev
        // server start.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pathname: "/(app)/booking-confirmed" as any,
        params: defined({
          practitionerName,
          practitionerSpecialty,
          practitionerAvatar: text(params.practitionerAvatar),
          // `rating` and `tags` are deliberately NOT forwarded: 780:5363 gives
          // screen 3 the `Show rating = false` / `Show tags = false` variant and
          // 756:5180 draws neither. Forwarding them would put a rating on a
          // frame that has no place to draw it.
          date,
          time,
          endTime,
          timezone,
          type,
          // THE SERVER'S mode, not the route param this screen was handed.
          // They agree today — `confirm` posts the param — but they are not the
          // same fact: one is what the user tapped, the other is what the clinic
          // will see, and the confirmation screen says "your in-person
          // appointment is confirmed" about the row that now exists. If the
          // service ever coerces or defaults a mode, the confirmation must
          // follow the row rather than repeat the request.
          mode: booking.mode,
          // `room_id` is deliberately NOT forwarded, even though the response
          // now carries it. The confirmation screen has no join affordance —
          // 550:1826 puts that on the appointment card, which reads the room off
          // `GET /v1/bookings` itself — and a param no screen consumes is
          // exactly the sort of spare handle that later gets rendered into a
          // fabricated link. It stays where it is read.
          locationName,
          locationAddress,
          // Server-owned. `BookingOut` echoes the two instants it stored, and
          // those — not the local strings this screen displayed — are what the
          // calendar event is written from.
          //
          // `bookingReference` and `joinUrl` are NOT here. The backend has no
          // such fields (see ./api.ts), so nothing is forwarded and the
          // confirmation screen's `params.bookingReference ? ...` /
          // `params.joinUrl ? ...` guards keep those rows unrendered. Deriving
          // a "reference" from `booking_id` would put a number on a medical
          // confirmation that no clinic can look up. Logged in PIPELINE §5.
          startsAtIso: booking.startsAtIso,
          endsAtIso: booking.endsAtIso,
        }),
      });
    },
  });

  const isPending = confirmMutation.isPending;

  /**
   * Abandon. A no-op while the mutation is in flight: `dismissAll()` mid-request
   * orphans a booking the server may well be creating, and the user would have
   * no screen left on which to be told about it.
   */
  const requestDiscard = useCallback(() => {
    if (isPending) return;
    setDiscardOpen(true);
  }, [isPending]);

  // Android hardware back MIRRORS the app-bar back — the whole point of the
  // dialog is that the booking cannot be abandoned by accident, and a hardware
  // gesture that bypasses it is the accident. `return true` consumes the event;
  // without it Android pops this screen out from behind the dialog.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      requestDiscard();
      return true;
    });
    return () => subscription.remove();
  }, [requestDiscard]);

  const goEdit = useCallback(() => {
    // Straight back to a REHYDRATED SelectTimeSlotScreen — it seeds its state
    // from the params it pushed. That pairing is the point of both changes:
    // without rehydration "Edit" wipes four choices the user already made.
    router.back();
  }, []);

  const keepEditing = useCallback(() => setDiscardOpen(false), []);

  const discardBooking = useCallback(() => {
    setDiscardOpen(false);
    router.dismissAll();
  }, []);

  const confirm = useCallback(() => {
    const doctorId = text(params.practitionerId);
    if (!doctorId || !date || !time) return;
    // `mode` IS SENT NOW — `BookingCreate.mode` exists (migration
    // 20260803_0002), so the In person / Video choice the user made on screen 1
    // is persisted rather than displayed here and thrown away at the boundary.
    // `readMode` has already narrowed it to the designed union or `undefined`,
    // and `undefined` is passed through as an omission so the SERVER's default
    // applies — this screen refuses to render at all without a mode (see the
    // required-params guard below), so in practice it is always one of the two.
    //
    // `type` is still not sent: no column for it. See ./api.ts and §5.
    confirmMutation.mutate({
      doctorId,
      date,
      time,
      endTime,
      durationMinutes: parseDurationMinutes(duration),
      reason,
      mode,
    });
  }, [confirmMutation, date, time, endTime, duration, params.practitionerId, reason, mode]);

  /**
   * The maps handoff, for real. Native scheme first so the phone's own maps app
   * takes it, https as the fallback for a device that has none — and the whole
   * thing guarded, because `openURL` REJECTS when no handler claims the URL and
   * an unhandled rejection here would take down the screen the user is trying
   * to book on.
   */
  const openDirections = useCallback(async () => {
    if (!locationAddress) return;
    const query = encodeURIComponent(
      locationName ? `${locationName}, ${locationAddress}` : locationAddress,
    );
    const nativeUrl = Platform.select({
      ios: `maps://?daddr=${query}`,
      android: `geo:0,0?q=${query}`,
      default: "",
    });
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    try {
      const canOpenNative = nativeUrl ? await Linking.canOpenURL(nativeUrl) : false;
      await Linking.openURL(canOpenNative && nativeUrl ? nativeUrl : webUrl);
    } catch {
      try {
        await Linking.openURL(webUrl);
      } catch {
        // Both handoffs refused. The address is on screen as text, which is the
        // fallback that always works; a toast here would be noise.
      }
    }
  }, [locationAddress, locationName]);

  const failure = useMemo(() => {
    const status = (confirmMutation.error as { status?: number } | null)?.status;
    return failureCopy(status, time ?? "this slot", practitionerName ?? "another patient");
  }, [confirmMutation.error, time, practitionerName]);

  const errorPlate = useTokenColor("on-error-container");
  const dialogShadow = useTokenShadow("shadow", DIALOG_SHADOW);

  // -------------------------------------------------------------------------
  // 756:4813 — the session we cannot reconstruct
  // -------------------------------------------------------------------------
  // A WHOLE-SCREEN replacement, not a banner: there is no appointment to review,
  // so reviewing one is not an option the screen can offer. Hooks above run
  // first, unconditionally.
  //
  // `practitionerId` joins the guard this pass. `BookingCreate.doctor_id` is a
  // required UUID, so a session that lost the id cannot produce a booking at
  // all — offering a Confirm button that can only ever fail is the same defect
  // as the fabricated appointment this frame was introduced to replace.
  if (!text(params.practitionerId) || !practitionerName || !date || !time || !type || !mode) {
    return (
      <DetailShell title="Review Appointment">
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 32,
            flexGrow: 1,
            justifyContent: "center",
          }}
          showsVerticalScrollIndicator={false}
        >
          <Card className="items-center">
            <View
              className="items-center justify-center rounded-full bg-error-container"
              style={{ width: ERROR_PLATE_LARGE, height: ERROR_PLATE_LARGE }}
            >
              <Icon chrome="error-outline" size={28} color={errorPlate} />
            </View>
            <Text className="mt-4 text-center font-headline-md text-headline-md text-on-surface">
              This booking session has expired
            </Text>
            <Text className="mt-2 text-center font-body-md text-body-md text-on-surface-variant">
              We no longer have the practitioner, date or time you chose. Nothing was booked. Start
              again from the provider you were viewing.
            </Text>
            <View className="mt-6 w-full">
              <Button
                label="Start again"
                size="docked"
                pill={false}
                fullWidth
                onPress={() => router.dismissAll()}
              />
            </View>
          </Card>
        </ScrollView>
      </DetailShell>
    );
  }

  const showTimezoneBadge = !!timezone;
  const timeValue = endTime ? `${time} – ${endTime}` : time;

  return (
    <DetailShell
      title="Review Appointment"
      onBack={requestDiscard}
      // The app-bar action slot is EMPTY in 756:4213. It used to carry a
      // notifications bell that did nothing on a checkout screen.
      // The docked bar claims the bottom inset itself (its own SafeAreaView), so
      // the shell must not claim it too or the padding doubles.
      claimsBottomInset={false}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: DOCKED_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* -- Practitioner (756:4221) -------------------------------------
            756:4213 draws a rating and two tags ("Cardiology", "Top Rated"),
            and this screen now HAS slots for both — `rating`+`reviewCount` and
            a comma-separated `tags`, added to the contract at the top of this
            file so screen 1 and screen 2 answer the rating question from the
            same two params instead of one inventing a number and the other
            showing none.

            Still FLAGGED, and it is a data gap now rather than a component one:
            screen 1 does not yet forward them (it holds a private SEED_RATING),
            and nothing behind it produces them — /v1/practitioners does not
            exist. Until it does these two lines are absent, which is exactly
            780:5363's `Show rating = false` / `Show tags = false`. What is NOT
            done here is defaulting them: an invented "Top Rated" on a real
            clinician is the same class of harm as the deleted FALLBACK. */}
        <PractitionerSummaryRow
          surface="card"
          verified
          name={practitionerName}
          specialty={practitionerSpecialty ?? ""}
          avatarUri={text(params.practitionerAvatar)}
          rating={rating}
          tags={tags}
        />

        {/* -- Time & Schedule (756:4282) ---------------------------------- */}
        <View className="mt-6">
          <SectionHeader title="Time & Schedule" />
          <Card className="gap-4">
            <View className="flex-row items-start gap-4">
              <IconTile icon="calendar-today" />
              <KeyValueRow label="Date" value={formatLongDate(date)} />
            </View>
            <View className="flex-row items-start gap-4">
              <IconTile icon="schedule" />
              {/* The timezone badge is a CLAIM about where and when this is —
                  rendered only when the params carry one. */}
              {showTimezoneBadge ? (
                <KeyValueRow
                  label="Time"
                  value={timeValue}
                  badge={{ label: timezone, tone: "success" }}
                />
              ) : (
                <KeyValueRow label="Time" value={timeValue} />
              )}
            </View>
          </Card>
        </View>

        {/* -- Service Details (756:4356) ---------------------------------- */}
        <View className="mt-6">
          <SectionHeader title="Service Details" />
          <Card className="gap-4">
            <View className="flex-row items-start gap-4">
              <IconTile icon="stethoscope" />
              <KeyValueRow label="Consultation type" value={type} />
            </View>
            {/* "From provider" is a provenance badge: the value must actually
                come from the provider. It used to be a hardcoded "45 Minutes"
                wearing that badge. */}
            {duration ? (
              <View className="flex-row items-start gap-4">
                <IconTile icon="schedule" />
                <KeyValueRow
                  label="Duration"
                  value={duration}
                  badge={{ label: "From provider", tone: "success" }}
                />
              </View>
            ) : null}
            {reason ? (
              <View className="flex-row items-start gap-4">
                <IconTile icon="prescription" />
                <KeyValueRow label="Reason for visit" value={reason} />
              </View>
            ) : null}
          </Card>
        </View>

        {/* -- Location / Consultation — branches on MODE ------------------ */}
        {mode === "video" ? (
          // FLAGGED: screen 2 has no video frame. Derived from 757:4828, the one
          // frame that draws the video treatment. Deliberately NO join link:
          // nothing is booked yet, so no `joinUrl` exists to show.
          <View className="mt-6">
            <SectionHeader title="Consultation" />
            <Card>
              <View className="flex-row items-start gap-4">
                <IconTile icon="videocam" />
                <KeyValueRow
                  label="Video consultation"
                  value="Join link opens 10 minutes before the start"
                />
              </View>
            </Card>
          </View>
        ) : locationAddress ? (
          <View className="mt-6">
            <SectionHeader title="Location" />
            <Card>
              <View className="flex-row items-start gap-4">
                <IconTile icon="location-on" />
                <KeyValueRow
                  label={locationName ?? "Clinic address"}
                  value={locationAddress}
                  // Suppressed mid-flight (756:4442): the screen is committing,
                  // and a maps handoff backgrounds the app under the request.
                  action={
                    isPending ? undefined : { label: "Directions", onPress: openDirections }
                  }
                />
              </View>
            </Card>
          </View>
        ) : null}

        {/* -- Cancellation policy (756:4361) ------------------------------ */}
        <View className="mt-6">
          <InfoCallout>{POLICY}</InfoCallout>
        </View>

        {/* -- 756:4586 confirm-failed ------------------------------------- */}
        {confirmMutation.isError ? (
          <View className="mt-6 items-center" accessibilityLiveRegion="polite">
            <View
              className="items-center justify-center rounded-full bg-error-container"
              style={{ width: ERROR_PLATE_SMALL, height: ERROR_PLATE_SMALL }}
            >
              <Icon chrome="error-outline" size={20} color={errorPlate} />
            </View>
            <Text className="mt-4 text-center font-body-md text-body-md text-on-surface">
              {failure.title}
            </Text>
            <Text className="mt-2 text-center font-label-sm text-label-sm text-on-surface-variant">
              {failure.body}
            </Text>
            <View className="mt-4 w-full">
              <Button
                label="Choose another time"
                variant="outline"
                size="docked"
                pill={false}
                fullWidth
                onPress={() => router.back()}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* -- Docked commit bar (781:2291 Pair + 781:2287 footnote) --------- */}
      <DockedActionBar
        secondary={{ label: "Edit", onPress: goEdit, disabled: isPending }}
        primary={{
          label: isPending
            ? "Confirming…"
            : confirmMutation.isError
              ? "Try again"
              : "Confirm Booking",
          // `loading` already carries `disabled` and `accessibilityState.busy`.
          loading: isPending,
          onPress: confirm,
        }}
        footnote={{ label: "Secure encrypted checkout", icon: "lock" }}
      />

      {/* -- 756:4765 discard -------------------------------------------- */}
      <Modal
        visible={discardOpen}
        transparent
        animationType="fade"
        // Hardware back inside the dialog dismisses the DIALOG, not the screen.
        onRequestClose={keepEditing}
      >
        <View className="flex-1 items-center justify-center bg-scrim/40 px-4">
          <View
            accessibilityViewIsModal
            className="w-full rounded-card bg-card-surface p-6"
            style={[{ maxWidth: 313 }, dialogShadow]}
          >
            <Text
              accessibilityRole="header"
              className="font-headline-md text-headline-md text-on-surface"
            >
              Discard this booking?
            </Text>
            <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
              Your date, time, consultation type and reason will be lost. Nothing has been booked
              and nothing has been charged.
            </Text>
            <View className="mt-6 gap-3">
              <Button
                label="Keep editing"
                size="docked"
                pill={false}
                fullWidth
                onPress={keepEditing}
              />
              <Button
                label="Discard booking"
                variant="outline"
                size="docked"
                pill={false}
                fullWidth
                onPress={discardBooking}
              />
            </View>
          </View>
        </View>
      </Modal>
    </DetailShell>
  );
}
