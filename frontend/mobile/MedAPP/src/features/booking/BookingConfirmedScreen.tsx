// Booking Confirmed — the terminal screen of the booking flow.
//
// Figma: 756:4742 (light) · 757:5181 (dark) · 757:4828 (video).
// Binding: docs/BRAND.md. Build spec §4.
//
// Entry point: ReviewAppointment → "Confirm Booking" (a `router.replace`, so
// Review is not on the stack behind this screen).
//
// ---------------------------------------------------------------------------
// WHAT CHANGED IN THIS RECONCILIATION, AND WHY
// ---------------------------------------------------------------------------
//
// `FALLBACK` IS GONE. The screen used to invent a whole appointment — a named
// practitioner, a date, a time and `type: "Video Call"` — whenever a param was
// missing. On a medical CONFIRMATION that is the worst possible default: it
// states as fact that something was booked, with details nobody chose. Every
// block below renders only when its data arrives, and renders nothing when it
// does not. Nothing on this screen is fabricated.
//
// THE BOOKING REFERENCE AND THE JOIN LINK ARE GONE, NOT HIDDEN (spec §4.2,
// required item 4). The frame draws `MED-8R4K-2210` and 757:4828 draws a join
// row, and the previous pass shipped both behind `params.bookingReference ? …`
// guards. Nothing has ever set those params, because **the backend has neither
// field**: `BookingOut` is `{ booking_id, user_id, status, doctor_id,
// starts_at, ends_at, reason?, notes?, cancelled_at?, cancellation_reason? }`
// and that is all (see ./api.ts, read out of
// backend/services/booking_service/app/schemas/booking.py).
//
// A guard on a param no producer can supply is not "absent-not-fabricated", it
// is dead code that reads as a working feature — the same shape of mistake as
// the invented `POST /v1/appointments`, and the next person to see the empty
// row will "fix" it by deriving a reference from `booking_id`. So the param,
// the row and the copy affordance are DELETED. A reference the backend has
// never heard of is worse than no reference, because the user reads it out to a
// call centre. Both are logged as backend requests in docs/PIPELINE.md §5; when
// the service returns them, this is where they come back.
//
// WHAT THE CONFIRM RESPONSE DOES SUPPLY IS THE TWO INSTANTS. `starts_at` and
// `ends_at` are real, server-echoed and now forwarded by Review, which is what
// finally makes "Add to Calendar" — the whole expo-calendar install — reachable
// for the first time. `canAddToCalendar` keys off those two and nothing else,
// and it PARSES them rather than merely checking they are non-empty: a
// malformed param would otherwise schedule an `Invalid Date` event.
//
// MODE IS AN AXIS, NOT A STRING (required item 1). The old file could not tell
// an in-person appointment from a video one — it hardcoded "Video Call" and a
// "Remote" pill — so 757:4828 had no code behind it. `mode` now branches the
// supporting copy, the consultation-type badge, the calendar event's
// location/notes and the whole preparation checklist. (It does NOT branch a
// join row any more; see above.)
//
// AND `mode` IS NOW A SERVER FIELD. It used to be session state only — the
// booking service could not tell a video appointment from an in-person one, so
// this screen asserted "your in-person appointment is confirmed" about something
// nobody had stored. `BookingCreate`/`BookingOut` carry `mode` as of migration
// 20260803_0002, and Review forwards `booking.mode` — the value the service
// echoed back off the row it wrote — rather than the param it was handed. The
// sentence is now a report, not a repetition of the request.
//
// There is still NO JOIN LINK, and that is not an omission: `telemedicine_service`
// has no URL concept. `room_id` is a handle, and the affordance built from it
// lives on the appointment card (`AppointmentManagementScreen`), which is where
// 550:1826 draws it. The designer's "The join link opens 10 minutes before the
// start" copy is wrong twice over — there is no link, and nothing in
// `telemedicine_service` gates joining on a time window — so the video copy here
// says what is true instead of quoting the frame (PIPELINE §5).
//
// HARDWARE BACK MIRRORS CLOSE (required item 3). Close has always been a
// `router.replace("/(app)")` so Review cannot be re-confirmed; Android's back
// gesture bypassed it entirely and popped straight back onto a live "Confirm
// Booking" button. That is a double booking on a terminal screen, so the
// handler is registered here and returns `true`.
//
// ADD TO CALENDAR ACTUALLY ADDS TO A CALENDAR (required item 9). It used to be
// `addToCalendar = () => goToAppointments()` — a button that lied about what it
// did and navigated away to hide it. It is now the real expo-calendar flow:
// permission → resolve a writable calendar → create the event, with the denied
// and failed states drawn IN PRODUCT rather than as a native `Alert`.
//
// ELEVATION. Still none, and the reasoning that used to live at the top of this
// file now lives in `SuccessMedallion.tsx`, where it protects every caller
// instead of this one screen. `Button` defaults `primary` to the `elevation/cta`
// shadow, so the two in-flow actions pass `shadow={false}`: an in-flow CTA on a
// page is not a sheet, menu, dialog or toast.
//
// DELETED with the restyle: the `MaterialIcons` import (docs/BRAND.md — only
// `Icon.tsx` may touch an icon library), `FALLBACK` and its CDN avatar URI, the
// decorative corner accent, the "Remote" pill, the trailing "!" on the headline,
// the private `ChecklistItem`, `mt-xl` (80px, off BRAND's scale), and every one
// of the hex literals — `#008378`, `#ffffff`, `#d5e3fc`, `#515f74`, `#d8e2ff`,
// `#0058be`, `#89f5e7`, `#005049`, `#00685f`, `#004d46`, `#f5faf8` — each of
// which froze this screen in light mode and made 757:5181 unbuildable.
//
// DELETED with the rewire: `expo-clipboard`. Its only two callers were the
// reference row and the join row — both of which copied a value the backend
// never sends. The dependency stays in package.json for other screens; it is
// simply not imported here any more.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding expo-* APIs.
// Used here: expo-calendar (v55 sdk/calendar), expo-router.

import { useCallback, useEffect, useState } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import * as Calendar from "expo-calendar";
import { DetailShell } from "@/components/shell";
import {
  Button,
  Card,
  Icon,
  IconTile,
  InfoCallout,
  KeyValueRow,
  PractitionerSummaryRow,
  SectionHeader,
  SuccessMedallion,
  type AnyIconName,
} from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

type ConsultationMode = "in-person" | "video";

/**
 * Long-form weekday and month names, looked up by `Date`'s own accessors.
 *
 * Written out rather than taken from `Intl`/`toLocaleDateString` for the reason
 * `use-booking-availability.ts` already records: Hermes ships a cut-down ICU and
 * the available locale data differs per platform and per build, so the same date
 * renders "Tue" on iOS and "Tuesday" on an Android Go device. A confirmation
 * whose date reads differently depending on the JS engine is not a confirmation.
 */
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTH_LONG = [
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
 * "2025-05-13" → "Tuesday, 13 May 2025", the string 756:4742 draws.
 *
 * Screen 1 sends an ISO date rather than the `"Tue, May 13"` it used to
 * string-concat (with a hardcoded "May"), so formatting happens at the leaf —
 * here — and the same key round-trips through Review unchanged. Anything that
 * does not parse is passed through verbatim rather than rendered as "Invalid
 * Date": an unrecognised format is a param bug, not a reason to show the user a
 * broken date on a booking they just made.
 */
function formatLongDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return `${WEEKDAY_LONG[parsed.getUTCDay()]}, ${parsed.getUTCDate()} ${
    MONTH_LONG[parsed.getUTCMonth()]
  } ${parsed.getUTCFullYear()}`;
}

/**
 * A server instant (`BookingOut.starts_at`, RFC 3339 with an offset) → `Date`,
 * or `null` for anything that is absent or does not parse.
 *
 * Unlike `formatLongDate`, an unparseable value here cannot be passed through
 * verbatim: it feeds a native calendar write, and `new Date("soon")` is an
 * `Invalid Date` the OS rejects with an opaque error. `null` instead, so the
 * button is simply not offered.
 */
function toInstant(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The preparation checklist, per mode (756:5246 / 757:4828, spec §4.2).
 *
 * This is the clearest thing the missing `mode` axis broke: the shipped screen
 * told an in-person patient to "test your microphone and camera", because the
 * only checklist it had was the video one.
 */
const CHECKLIST: Record<ConsultationMode, { icon: AnyIconName; text: string }[]> = {
  "in-person": [
    { icon: "credential", text: "Bring photo ID and any recent test results" },
    { icon: "schedule", text: "Arrive 10 minutes early to complete check-in" },
    { icon: "medication", text: "List any medication you are currently taking" },
  ],
  video: [
    { icon: "videocam", text: "Test your microphone and camera" },
    // Was "Join the link 10 minutes before the start", which is the frame's copy
    // and wrong twice over: there is no link (a room is joined in-app, via
    // `room_id`), and nothing in `telemedicine_service` gates joining on a time
    // window, so "10 minutes before" is a rule no code enforces. This says where
    // the join control actually is.
    { icon: "schedule", text: "Join from My Appointments when it is time" },
    { icon: "wifi", text: "Find a quiet spot with a stable connection" },
  ],
};

/**
 * Both sentences now describe a row that exists — `mode` arrives from
 * `BookingOut.mode`, echoed by the service off the record it wrote, not from the
 * choice this flow was carrying. Before the column existed, "your in-person
 * appointment is confirmed" was an assertion about a fact the server had never
 * been told.
 */
const SUPPORTING_COPY: Record<ConsultationMode, string> = {
  "in-person":
    "Your in-person appointment is confirmed. We've saved it to My Appointments.",
  video:
    "Your video consultation is confirmed. You'll join it from My Appointments.",
};

/**
 * What the "Add to Calendar" button is currently reporting.
 *
 * `denied` and `failed` are separate because they need different words and only
 * one of them can be fixed from Settings — collapsing them is how a permission
 * problem gets reported as a bug and vice versa.
 */
type CalendarState = "idle" | "working" | "added" | "denied" | "failed";

const CALENDAR_MESSAGE: Record<"denied" | "failed", string> = {
  denied:
    "MedApp can't add this to your calendar without calendar access. You can turn it on in Settings.",
  failed:
    "We couldn't add this to your calendar. Your appointment is still confirmed — you can find it in My Appointments.",
};

/**
 * The calendar the event goes in.
 *
 * iOS has a real notion of a default calendar (`getDefaultCalendarAsync`, iOS
 * only per the v55 docs). Android does not, so the first WRITABLE calendar is
 * used, preferring the account's primary one — writing to a read-only subscribed
 * calendar (holidays, a shared roster) throws, and picking `[0]` blind is how
 * that happens.
 */
async function resolveWritableCalendarId(): Promise<string | null> {
  if (Platform.OS === "ios") {
    const preferred = await Calendar.getDefaultCalendarAsync();
    if (preferred?.id) return preferred.id;
  }
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((calendar) => calendar.allowsModifications);
  return writable.find((calendar) => calendar.isPrimary)?.id ?? writable[0]?.id ?? null;
}

export function BookingConfirmedScreen() {
  const params = useLocalSearchParams<{
    practitionerName?: string;
    practitionerSpecialty?: string;
    practitionerAvatar?: string;
    date?: string;
    time?: string;
    endTime?: string;
    timezone?: string;
    type?: string;
    mode?: ConsultationMode;
    /**
     * The only two params on this screen the SERVER owns: `BookingOut`'s
     * `starts_at` / `ends_at`, forwarded verbatim by Review. Everything else
     * here is session state the flow carried in. The calendar event is written
     * from these, not from the `date`/`time`/`timezone` display strings — those
     * are a local wall-clock the device composed, while these are the instants
     * the booking service actually stored.
     *
     * There is no `bookingReference` and no `joinUrl`. See the header: the
     * backend has neither, so neither is a param.
     */
    startsAtIso?: string;
    endsAtIso?: string;
    locationName?: string;
    locationAddress?: string;
  }>();

  // The one derived value, and it is a branch rather than a fabrication. The
  // param is now the SERVER's `BookingOut.mode` (Review forwards `booking.mode`),
  // so this is a report of the stored row. An absent `mode` — a deep link, or a
  // response from a deployment predating the column — renders the conservative
  // treatment: no "Video" badge, no "test your camera". In person is the safe
  // fallback because it promises no session that might not exist.
  const mode: ConsultationMode = params.mode === "video" ? "video" : "in-person";
  const checklist = CHECKLIST[mode];

  const [calendarState, setCalendarState] = useState<CalendarState>("idle");

  // The bar's share glyph, by token name rather than the `#00685f` the
  // hand-rolled bar froze in light mode.
  const primary = useTokenColor("primary");

  /**
   * Terminal: REPLACE, never pop. Review is not on the stack, and if it ever
   * were, popping onto it would put a live "Confirm Booking" in front of a user
   * whose appointment is already booked.
   */
  const close = useCallback(() => {
    router.replace("/(app)" as Href);
  }, []);

  const goToAppointments = useCallback(() => {
    router.replace("/(app)/appointments" as Href);
  }, []);

  /**
   * Android's back gesture must do what Close does (required item 3).
   *
   * `return true` is the whole point: without it the system ALSO pops the
   * screen, so back walked out of a terminal confirmation and onto Review's
   * still-live confirm button.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close]);

  /**
   * The event window, from the SERVER'S instants.
   *
   * `BookingOut.starts_at` / `ends_at` are RFC 3339 with an offset, so
   * `new Date(...)` parses them to the right absolute moment on every device —
   * this is the one date on the screen that is not string-formatted display
   * state, and the reason "Add to Calendar" can now do what it says.
   *
   * Parsed here rather than inside the handler so the BUTTON depends on the
   * parse: `!!params.startsAtIso` was true for `"soon"` too, which would have
   * created an event on `Invalid Date` and thrown inside the native module,
   * surfacing a permissions-shaped failure for a params bug.
   */
  const startsAt = toInstant(params.startsAtIso);
  const endsAt = toInstant(params.endsAtIso);
  // No usable window, no calendar event. The button is absent rather than
  // disabled: a dead control with no explanation is the pattern this screen is
  // losing.
  const canAddToCalendar = !!startsAt && !!endsAt;
  const startsAtTime = startsAt?.getTime();
  const endsAtTime = endsAt?.getTime();

  const addToCalendar = useCallback(async () => {
    if (startsAtTime === undefined || endsAtTime === undefined) return;
    setCalendarState("working");
    try {
      const permission = await Calendar.requestCalendarPermissionsAsync();
      if (!permission.granted) {
        setCalendarState("denied");
        AccessibilityInfo.announceForAccessibility(CALENDAR_MESSAGE.denied);
        return;
      }

      const calendarId = await resolveWritableCalendarId();
      if (!calendarId) {
        setCalendarState("failed");
        AccessibilityInfo.announceForAccessibility(CALENDAR_MESSAGE.failed);
        return;
      }

      await Calendar.createEventAsync(calendarId, {
        title: params.practitionerName
          ? `Appointment with ${params.practitionerName}`
          : "MedApp appointment",
        startDate: new Date(startsAtTime),
        endDate: new Date(endsAtTime),
        // A video consultation has no address, so it gets no `location` — and
        // it gets no `notes` either, because the only thing worth putting there
        // is a join link and the backend issues none. An event that says "join
        // link to follow" is a promise this app cannot keep.
        //
        // NO `timeZone`. It looks like it belongs and it does not: the only
        // zone the flow carries is the `timezone` PARAM, which is the human
        // label the frames print ("EDT · Boston") — not the IANA id
        // expo-calendar expects, and wrong for the same clinic in January. It
        // is also unnecessary: `startDate`/`endDate` are absolute instants, so
        // the OS already places the event correctly and renders it in the
        // user's own zone. Passing the label would be the api.ts mistake in
        // miniature — a plausible string handed over as a fact.
        ...(mode === "video"
          ? null
          : {
              location:
                [params.locationName, params.locationAddress].filter(Boolean).join(", ") ||
                undefined,
            }),
      });

      setCalendarState("added");
      AccessibilityInfo.announceForAccessibility("Added to calendar");
    } catch {
      // Never navigate away on failure — that is exactly what the old
      // `addToCalendar = () => goToAppointments()` did, and it is why nobody
      // noticed the button had never added anything.
      setCalendarState("failed");
      AccessibilityInfo.announceForAccessibility(CALENDAR_MESSAGE.failed);
    }
  }, [
    startsAtTime,
    endsAtTime,
    mode,
    params.locationAddress,
    params.locationName,
    params.practitionerName,
  ]);

  const openSettings = useCallback(() => {
    // What turns the denied callout from a dead end into an action. Guarded:
    // `openSettings` rejects on a platform that has no app settings page, and an
    // unhandled rejection here would be a red screen on top of a confirmation.
    void Linking.openSettings().catch(() => {});
  }, []);

  /**
   * The app bar's share affordance, which 756:4742 draws and the shipped screen
   * rendered as a Pressable with no `onPress` — a control that looks live and
   * does nothing. `Share` is React Native's own sheet, so no new dependency and
   * no second icon set.
   */
  const shareAppointment = useCallback(() => {
    const summary = [
      params.practitionerName ? `Appointment with ${params.practitionerName}` : "MedApp appointment",
      params.date ? formatLongDate(params.date) : null,
      [params.time, params.endTime].filter(Boolean).join(" – ") || null,
      // No "Reference …" line: there is no reference. A share sheet is the
      // likeliest place a fabricated one would end up in a message to someone
      // who then quotes it at a clinic.
    ]
      .filter(Boolean)
      .join("\n");
    void Share.share({ message: summary }).catch(() => {
      // A dismissed or unavailable share sheet is not an error worth a state.
    });
  }, [params.date, params.endTime, params.practitionerName, params.time]);

  const secondaryTimeLine =
    [[params.time, params.endTime].filter(Boolean).join(" – "), params.timezone]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    /* DetailShell owns the safe area, the StatusBar and the detail bar (Figma
       193:120). This screen is TERMINAL and still has a left button:
       `backIcon="close"` plus an explicit `onBack` that replaces to Home. That is
       exactly why DetailAppBar takes `onBack` rather than always calling
       `router.back()`. `claimsBottomInset` is left alone — unlike screens 1 and 2
       this screen has NO docked bar (its two actions are in-flow on a terminal
       page), so nothing is pinned to the bottom edge. */
    <DetailShell
      title="Booking Confirmed"
      backIcon="close"
      onBack={close}
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share appointment"
          onPress={shareAppointment}
          className="h-full w-full items-center justify-center rounded-full active:opacity-70"
        >
          <Icon chrome="ios-share" size={22} color={primary} />
        </Pressable>
      }
    >
      <ScrollView
        // 16, per G1: every `Body` child in 756:4742 sits at x=16, width 361 in a
        // 393 frame. `px-gutter` (24) was the code's own invention.
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------------------------------------
            Hero (756:4753 + headline + supporting copy)
        ------------------------------------------------------------ */}
        <SuccessMedallion />
        {/* No "!". 756:4742 sets "Appointment Confirmed" flat — this is a medical
            booking, not a prize. */}
        <Text className="mt-8 text-center font-headline-lg text-headline-lg text-on-surface">
          Appointment Confirmed
        </Text>
        <Text
          className="mt-2 self-center text-center font-body-md text-body-md text-on-surface-variant"
          style={{ maxWidth: 280 }}
        >
          {SUPPORTING_COPY[mode]}
        </Text>

        {/* ------------------------------------------------------------
            756:4742 draws a booking-reference block ("MED-8R4K-2210") here.
            IT IS NOT BUILT, AND THAT IS THE CORRECT OUTCOME, NOT AN OMISSION:
            `BookingOut` has no reference field, so there is nothing to render
            and the only way to fill this space is to invent an id no clinic can
            look up. GAP — flagged to the designer and logged as backend request
            §5.1. The margin below absorbs the space rather than leaving a hole.
        ------------------------------------------------------------ */}

        {/* ------------------------------------------------------------
            Appointment card (756:4760)
        ------------------------------------------------------------ */}
        <Card className="mt-8 w-full">
          {params.practitionerName ? (
            <>
              <PractitionerSummaryRow
                surface="bare"
                verified
                name={params.practitionerName}
                specialty={params.practitionerSpecialty ?? ""}
                avatarUri={params.practitionerAvatar}
              />
              <View className="my-4 h-px w-full bg-outline-variant" />
            </>
          ) : null}

          {params.date ? (
            <View className="flex-row items-start gap-4">
              <IconTile icon="calendar-today" />
              <KeyValueRow
                label="Date & Time"
                value={formatLongDate(params.date)}
                secondaryValue={secondaryTimeLine}
              />
            </View>
          ) : null}

          {params.type ? (
            <View className="mt-4 flex-row items-start gap-4">
              <IconTile icon="stethoscope" />
              <KeyValueRow
                label="Consultation Type"
                value={params.type}
                // The mode, as a word — replacing a hardcoded "Remote" pill that
                // said the same thing whatever had been booked.
                badge={{ label: mode === "video" ? "Video" : "In person", tone: "success" }}
              />
            </View>
          ) : null}

          {/* 757:4828 draws a "Join link" row. NOT BUILT, same reason as the
              reference: there is no `join_url` in the backend — the booking
              service cannot even tell that this booking is a video one, since
              `BookingCreate` has no `mode`. A row that copies a link the app
              made up sends the patient to a meeting that does not exist. GAP —
              flagged, and it is backend request §5.2. */}
        </Card>

        {/* ------------------------------------------------------------
            Preparation checklist (756:5246 / 757:4828)
        ------------------------------------------------------------ */}
        <View className="mt-6 w-full">
          <SectionHeader title="Before your appointment" icon="lightbulb" />
          <View className="mt-8 gap-3">
            {checklist.map((item) => (
              <View key={item.text} className="flex-row items-start gap-3">
                {/* The ONE place IconTile takes a label: three otherwise
                    identical plates, so the glyph is the only differentiator. */}
                <IconTile size={32} icon={item.icon} label={item.text} />
                <Text className="flex-1 font-body-md text-body-md text-on-surface-variant">
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ------------------------------------------------------------
            Actions — in-flow, not docked. This is a terminal page: there is
            nothing to commit, so there is no commit bar. (`mt-xl`, 80px and off
            BRAND's scale, is gone with it.)
        ------------------------------------------------------------ */}
        <View className="mt-2 w-full">
          {canAddToCalendar ? (
            <Button
              label={calendarState === "added" ? "Added to Calendar" : "Add to Calendar"}
              size="docked"
              pill={false}
              fullWidth
              // An in-flow CTA is not a sheet/menu/dialog/toast — docs/BRAND.md
              // §Elevation. `Button` defaults `primary` to the CTA shadow.
              shadow={false}
              leadingIcon={calendarState === "added" ? "check" : undefined}
              loading={calendarState === "working"}
              disabled={calendarState === "added"}
              onPress={() => void addToCalendar()}
            />
          ) : null}

          {/* GAP — no frame draws this state; FLAGGED for the designer. Built as
              the InfoCallout error tone rather than a native Alert, which is
              off-system and cannot carry "Open Settings" in the app's idiom. */}
          {calendarState === "denied" || calendarState === "failed" ? (
            <View className="mt-4 w-full">
              <InfoCallout tone="error" icon="error-outline">
                <Text className="font-body-md text-body-md text-on-error-container">
                  {CALENDAR_MESSAGE[calendarState]}
                </Text>
                {calendarState === "denied" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open Settings"
                    onPress={openSettings}
                    hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                    className="mt-2 self-start active:opacity-80"
                  >
                    <Text className="font-label-md text-label-md text-on-error-container underline">
                      Open Settings
                    </Text>
                  </Pressable>
                ) : null}
              </InfoCallout>
            </View>
          ) : null}

          <View className="mt-4">
            <Button
              label="View My Appointments"
              variant="outline"
              size="docked"
              pill={false}
              fullWidth
              onPress={goToAppointments}
            />
          </View>
        </View>
      </ScrollView>
    </DetailShell>
  );
}
