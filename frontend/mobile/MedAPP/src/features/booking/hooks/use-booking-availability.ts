// Availability for the booking flow — the date strip and one date's slots.
//
// Extracted from SelectTimeSlotScreen because the screen now has to render three
// branches over the SAME data (Figma 757:5286 loading, 757:5597 no-slots,
// 756:4384 default) and a screen that owns its own seed arrays can only ever
// render one of them. The branch has to come from somewhere the test can drive.
//
// ---------------------------------------------------------------------------
// FLAGGED — THIS IS NOT A NETWORK CALL YET, AND IT DOES NOT PRETEND TO BE
// ---------------------------------------------------------------------------
// /v1/slots does not exist. The gateway's ROUTES map has no availability key and
// booking_service exposes only POST/GET /v1/bookings, GET /v1/bookings/{id} and
// POST /v1/bookings/{id}/cancel — that is the whole surface, and it is what
// src/features/booking/api.ts binds to. So there is nothing to call. The BUILD
// SPEC names `useQuery(["slots", practitionerId, date])` as the source of
// `isLoading`; the query key and the return shape below are therefore exactly
// that hook's, and the swap when the endpoint ships is the body of `useSlots`:
//
//   const q = useQuery({
//     queryKey: SLOTS_QUERY_KEY(practitionerId, dateIso),
//     queryFn: () => bookingApi.listSlots(practitionerId, dateIso),
//   });
//   return { slots: q.data?.slots ?? [], isLoading: q.isLoading,
//            isProvisional: false,
//            timezoneLabel: q.data?.timezoneLabel, location: q.data?.location };
//
// `isProvisional` is the flag that carries the honesty across that swap: true
// while the grid is the seed below, false the moment a clinician's own calendar
// is answering. The screen renders its "not confirmed with the clinician" notice
// off it, so the notice is deleted by the endpoint landing rather than by
// somebody remembering.
//
// What is deliberately NOT done here: a `setTimeout` that flips `isLoading` for
// 800ms so the skeleton "can be seen" in the emulator. That would make the screen
// demo well and would be a fabricated network state on a medical booking screen.
// `isLoading` is honestly false until there is a request to be loading. The
// skeleton branch is reached by the tests, which mock this module.
//
// ---------------------------------------------------------------------------
// WHAT THIS PASS CHANGED
// ---------------------------------------------------------------------------
//
// THE ANCHOR WAS A FROZEN DATE, AND THAT MADE THE PICKER UNBOOKABLE. The strip
// started at `STRIP_ANCHOR_ISO = "2025-05-12"` — the date drawn in 756:4384,
// typed out as data. Fifteen months in the past by the time anyone runs it, so
// every date the user could tap was a date `booking_service` rejects outright
// (`starts_at` must be in the future). The strip now starts at TODAY. The frame's
// dates were never data; they were a drawing of a strip that starts today.
//
// AND THE SAME BUG, ONE UNIT DOWN: today's EARLIER slots are also in the past.
// A 09:00 slot tapped at 15:00 is a guaranteed 400 from the service. Slots whose
// start has already passed are marked `available: false` — dashed, announced,
// not pressable. This is derivation, not a guess: the service's own rule is that
// `starts_at` must be in the future, so a past start is unbookable by contract.
//
// SLOTS CARRY THEIR END. `BookingCreate.ends_at` is required, and until now
// nothing in the flow knew it — api.ts fell through to a documented 30-minute
// default on every single booking. A slot has a start AND an end; the payload
// carries both, so the booked window comes from the provider's grid instead of
// from an assumption made on the device.
//
// TIMEZONE AND LOCATION ARE IN THE SHAPE, AND EMPTY IN THE SEED. Screen 2 gates
// its Location card (and the Directions action) and its timezone badge on values
// that had nowhere to come from — screen 1 never sent them because nothing gave
// them to screen 1. They are part of an availability response (which clinic the
// slot is at, which zone its wall-clock is in) so they belong here, and the
// screen now threads them. They are `undefined` in the seed ON PURPOSE: a street
// address or an "EDT · Boston" typed into this file would be a claim about a
// real clinician's practice, and inventing one is exactly the class of error
// that put `/v1/appointments` in the review screen. Absent, the blocks stay
// unrendered — which is what screen 2's guards were written to do.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// This file uses none.

import { useMemo } from "react";

/** One bookable time, as /v1/slots will return it. */
export type Slot = {
  /** Display string, and the value carried through the flow: "10:00 AM". */
  time: string;
  /**
   * The slot's END, same display format. Optional because a payload may omit it;
   * when present it is what becomes `ends_at` on the wire instead of api.ts's
   * assumed 30 minutes, and what screen 2 draws as its "10:00 AM – 10:30 AM".
   */
  endTime?: string;
  /** Grouping in 756:4384 — one `SlotGroup` per period. */
  period: string;
  /**
   * False => `State=Unavailable` (756:4209 / 756:4211): dashed hairline, content
   * at 38%, not pressable, announced. Server-owned; the screen never guesses it.
   * The one thing computed locally is "this start is already in the past", which
   * is the service's own rejection rule rather than a guess.
   */
  available: boolean;
};

/** Where an in-person slot happens. Server-owned; never typed out in this file. */
export type AppointmentLocation = {
  /** "Boston Medical Center" */
  name?: string;
  /** The street address screen 2 renders and hands to the maps app. */
  address?: string;
};

/** One tile in the horizontal date strip (Figma 756:4424 — Day / Date / Month). */
export type DateOption = {
  /** Stable key AND the value pushed to screen 2: "2025-05-13". */
  iso: string;
  /** "Tue" */
  day: string;
  /** "13" */
  date: string;
  /** "May" — real data. This is what removes the hardcoded `"May"` literal. */
  month: string;
  /** No slots that day (Thu 15 in 756:4384). Dashed, not pressable, announced. */
  unavailable: boolean;
};

export type SlotsResult = {
  slots: Slot[];
  isLoading: boolean;
  /**
   * True while the grid is the SEED and not a clinician's calendar.
   *
   * `POST /v1/bookings` is real, so a patient who taps one of these times books
   * a slot nobody offered. The screen renders a notice off this flag rather than
   * presenting the seed as availability; when `/v1/slots` lands, the real
   * `useSlots` returns it false (or drops it) and the notice disappears with the
   * fabrication. Optional so a payload that never had a seed does not have to
   * say so.
   */
  isProvisional?: boolean;
  /**
   * The HUMAN label screen 2 puts in its badge — "EDT · Boston". Not an IANA id
   * and not usable as one: see the `composeLocal` note in ../api.ts for why the
   * wire offset is never parsed out of this string.
   */
  timezoneLabel?: string;
  location?: AppointmentLocation;
};

/** The query key the real `useQuery` will use — named so the swap is mechanical. */
export const SLOTS_QUERY_KEY = (practitionerId: string | undefined, dateIso: string) =>
  ["slots", practitionerId ?? null, dateIso] as const;

/**
 * Calendar name tables, indexed by `Date`'s own accessors.
 *
 * NOT the hardcoded month the frame's code carried: that one asserted "May" for
 * every appointment in the app regardless of the date. These are the names of
 * the twelve months, looked up by `getUTCMonth()`.
 *
 * Written out rather than taken from `Intl`/`toLocaleDateString`: Hermes ships a
 * cut-down ICU and the available locale data differs per platform and per build,
 * so the same date can render "Tue" on iOS and "Tuesday" on an Android Go device.
 * A booking strip whose column widths depend on the JS engine is not a strip.
 * When the app gains real localisation this table is the one place to replace.
 */
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** 756:4384 draws Mon 12 … Sat 17 — six tiles. The COUNT is the frame's; the dates are not. */
const STRIP_LENGTH = 6;

// `SEED_CLOSED_STRIP_INDEX = 3` IS DELETED, and it is not coming back as data.
// It closed the fourth day of every strip, for every clinician, forever —
// 756:4384 draws Thu 15 dashed, and the frame's drawing of one clinic's diary was
// typed out as if it were every clinic's. That is an invented day off: a patient
// was told a doctor does not work on a day nobody asked the doctor about. The
// no-slots frame (757:5597) is still reachable without it, from the one closure
// this app can DERIVE rather than assert — a today whose every slot has already
// started (see `seedSlotsFor`).

/** 756:4384's grid. `available: false` is the frame's 09:30 AM and 02:00 PM. */
const SEED_SLOTS: Slot[] = [
  { time: "09:00 AM", endTime: "09:30 AM", period: "Morning", available: true },
  { time: "09:30 AM", endTime: "10:00 AM", period: "Morning", available: false },
  { time: "10:00 AM", endTime: "10:30 AM", period: "Morning", available: true },
  { time: "10:45 AM", endTime: "11:15 AM", period: "Morning", available: true },
  { time: "11:30 AM", endTime: "12:00 PM", period: "Morning", available: true },
  { time: "01:30 PM", endTime: "02:00 PM", period: "Afternoon", available: true },
  { time: "02:00 PM", endTime: "02:30 PM", period: "Afternoon", available: false },
  { time: "02:30 PM", endTime: "03:00 PM", period: "Afternoon", available: true },
  { time: "03:15 PM", endTime: "03:45 PM", period: "Afternoon", available: true },
  { time: "04:00 PM", endTime: "04:30 PM", period: "Afternoon", available: true },
  { time: "05:00 PM", endTime: "05:30 PM", period: "Afternoon", available: true },
];

/**
 * "10:00 AM" / "9:05 pm" / "14:30" -> minutes since local midnight.
 *
 * Exported because the screen needs the same reading to turn a slot's start and
 * end into the duration screen 2 draws, and two parsers for one format is how
 * they drift. Returns undefined rather than a number for anything it cannot
 * read — a misread clock must never become a different time.
 */
export function parseClockMinutes(value: string): number | undefined {
  const match = /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$/.exec(value);
  if (!match) return undefined;
  const [, rawHour, rawMinute, meridiem] = match;
  let hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (minute > 59) return undefined;
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    const pm = meridiem.toLowerCase() === "pm";
    hour = (hour % 12) + (pm ? 12 : 0);
  } else if (hour > 23) {
    return undefined;
  }
  return hour * 60 + minute;
}

/** UTC throughout, so a device west of Greenwich cannot shift the strip a day. */
function toIso(d: Date): string {
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

/**
 * Today, as the DEVICE's calendar reads it, projected onto a UTC midnight so the
 * six-day walk below is plain arithmetic.
 *
 * Local parts, not `new Date().toISOString()`: at 21:00 in New York the ISO
 * string is already tomorrow, and the strip would open on a day the user does
 * not think it is.
 */
function todayUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function stripIsos(now: Date): string[] {
  const start = todayUtcMidnight(now);
  return Array.from({ length: STRIP_LENGTH }, (_, i) => {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    return toIso(d);
  });
}

/**
 * The seed grid for one date.
 *
 * Two things make a slot unbookable and both come from the service's rules, not
 * from taste: the seed marks 09:30/02:00 taken (756:4384), and any start that
 * has already passed on TODAY is unbookable because `starts_at` must be in the
 * future. Returns `[]` only for a day whose every slot has gone by — the
 * 757:5597 branch, rather than a grid of eleven dashed chips. NO day is closed
 * by assertion any more; see the deleted `SEED_CLOSED_STRIP_INDEX` above.
 */
function seedSlotsFor(dateIso: string, now: Date): Slot[] {
  const isos = stripIsos(now);
  // A date outside the strip still answers: the screen can be rehydrated onto
  // one, and refusing to answer would render the no-slots frame for a day the
  // provider may well be open.
  const isToday = dateIso === isos[0];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const slots = SEED_SLOTS.map((slot) => {
    if (!isToday || !slot.available) return slot;
    const start = parseClockMinutes(slot.time);
    return start !== undefined && start <= nowMinutes ? { ...slot, available: false } : slot;
  });
  return slots.some((s) => s.available) ? slots : [];
}

/**
 * The horizontal date strip, starting TODAY.
 *
 * Same FLAGGED note as `useSlots`: this becomes the availability half of the
 * /v1/slots response. The shape is what the screen consumes, so only the body
 * changes.
 */
export function useDateStrip(): DateOption[] {
  return useMemo(() => {
    const now = new Date();
    return stripIsos(now).map((iso) => {
      const d = new Date(`${iso}T00:00:00.000Z`);
      return {
        iso,
        day: WEEKDAY_SHORT[d.getUTCDay()],
        date: `${d.getUTCDate()}`,
        month: MONTH_SHORT[d.getUTCMonth()],
        // Dashed when the day has nothing to book — including a today whose
        // last slot has already started.
        unavailable: seedSlotsFor(iso, now).length === 0,
      };
    });
    // Anchored at mount. A strip that re-derived on every render would renumber
    // itself under the user's finger at midnight; a booking picker that changes
    // what "the first tile" means between tap and confirm is worse than one that
    // is a few hours stale.
  }, []);
}

/**
 * One date's slots, plus the two payload facts screen 2 renders around them.
 *
 * A date the strip marks unavailable returns `[]` rather than the seed grid, so
 * the no-slots frame (757:5597) is reachable from the product and not only from
 * a test — selecting a dashed date is impossible, but arriving on one through a
 * rehydrated `date` param is not.
 *
 * `timezoneLabel` and `location` are undefined here and that is the honest
 * answer: nothing in this app knows which clinic this practitioner sits in. See
 * the header. They are returned, not omitted from the type, because the screen's
 * threading of them is the part that has to be right before the endpoint lands.
 */
export function useSlots(practitionerId: string | undefined, dateIso: string): SlotsResult {
  return useMemo(
    () => ({
      slots: seedSlotsFor(dateIso, new Date()),
      // Honestly false: there is no request. See the FLAGGED block at the top.
      isLoading: false,
      // And honestly TRUE: this grid is the seed, not the clinician's calendar.
      // The screen says so on the grid itself, because the POST behind it is
      // real and a patient can book one of these times for good.
      isProvisional: true,
      timezoneLabel: undefined,
      location: undefined,
    }),
    // `practitionerId` is in the dependency list, not the body, because it is
    // half of SLOTS_QUERY_KEY — when the query lands, changing practitioner must
    // refetch. Keeping it here now means the call site is already correct.
    [practitionerId, dateIso],
  );
}
