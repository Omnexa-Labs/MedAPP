// Select Time & Consultation Type — step 1 of the booking journey.
//
// Figma page 144:107. Frames reconciled against, all five of them:
//   756:4384  default (light)     757:5286  loading (skeletons)
//   759:2169  dark                757:5597  no slots for the chosen date
//   758:2091  keyboard open
//
// Entry points: every "Book Appointment" CTA (PractitionerTelehealthProfile
// today; any clinic/partner detail screen later). PUSHED and task-focused, so no
// BottomNav — docs/BRAND.md §App shell.
//
// ===========================================================================
// WHAT THIS PASS CHANGED, AND WHY EACH ONE IS REQUIRED WORK
// ===========================================================================
//
// REHYDRATION (the worst defect in the flow). The screen took only the three
// practitioner params and hardcoded its four choices — `"tue-13"`, `"10:00 AM"`,
// `"Standard Consultation"`, `""`. "Edit" on the review screen is `router.back()`,
// so it landed here on a picker that had silently thrown away every choice the
// user made and pre-selected a DIFFERENT slot. Two consequences, and the second
// is the dangerous one:
//   - four choices lost on every edit, with no warning;
//   - a medical appointment time the user never chose sitting pre-selected under
//     a live "Book Now" — which is also why `canProceed` had always been dead
//     code (`selectedSlot` and `selectedType` could never be empty).
// Now every one of date/time/mode/type/reason seeds its `useState` INITIALISER,
// and slot and type start EMPTY when no param is supplied. An initialiser, not a
// `useEffect`: an effect keyed on params re-runs on any params identity change
// and would stomp an edit the user had already made.
//
// CONSULTATION MODE is a new axis. Modality (in person / video) was collapsed
// into consultation TYPE, so the screen could not emit it — which is why screen 2
// draws a map for a video call and screen 3's checklist tells a remote patient to
// arrive ten minutes early. It is now its own section and its own param.
//
// UNAVAILABLE IS NOT COLOUR. Slots and dates that cannot be booked come from the
// payload and render as ChoiceChip/DatePill `unavailable`: DASHED hairline,
// content at 38%, not pressable, announced as "…, unavailable". docs/BRAND.md
// §Colour rules — never colour alone. The disabled CTA is designed too, and it is
// now reachable.
//
// KEYBOARD. 758:2091 draws the keyboard open with the docked bar riding above it
// and the Reason field at its 2px focus border, i.e. keyboard-open is intended
// behaviour and its absence was a defect. The KeyboardAvoidingView sits BELOW the
// app bar (DetailShell's own header explains why the shell does not provide one
// and that its `flex-1` body takes a KAV as a direct child) and WRAPS the docked
// bar, so the bar lifts with the keyboard instead of hiding behind it.
//
// STATE BRANCHES. Three of the five frames had no code at all: loading (757:5286,
// skeletons — the frame draws no spinner), no-slots (757:5597, scoped to the
// Available Slots section so the rest of the form stays usable), and keyboard.
// They come off `useSlots`, which is the seam the tests drive.
//
// THE PUSH STARVED SCREEN 2 (this pass). Screen 2 reads fourteen params and was
// sent nine. The five missing ones each gate a block the frame draws, so all
// five blocks rendered `null` on every real run and only a test that supplied
// them by hand ever saw them: `endTime` (the time row's range), `timezone` (its
// badge), `duration` (the whole Duration row, "From provider" badge included)
// and `locationName`/`locationAddress` (the entire Location section, and with it
// the Directions action — required item 5). They are threaded now, from the
// availability payload, and dropped when the payload has none rather than
// defaulted. `endTime` also stops api.ts assuming a 30-minute window: the booked
// `ends_at` is the provider's.
//
// THE RATING WAS INVENTED (this pass). `SEED_RATING = { value: 4.9, count: 1200 }`
// put a score and a review count beside a NAMED clinician. The frame says 4.8
// (326 reviews); neither number came from anywhere, and both read as fact. It is
// the practitioner payload's now — and absent when the payload has no rating,
// which is `Show rating = false` in 780:5363, not a placeholder.
//
// ===========================================================================
// DELETED
// ===========================================================================
//   SEED_RATING                    see above. A hardcoded 4.9 (1,200 reviews)
//                                  under a real clinician's name.
//   MaterialIcons import           an icon library in a screen — Icon.tsx is the
//                                  only file allowed to import one.
//   every hex literal              13 of them, `#00685f` … `#f5faf8`, each one
//                                  freezing this screen in light mode against
//                                  759:2169. Now classes or `useTokenColor`.
//   SEED_DOCTOR + its CDN URI      a bare <Image> on a Google CDN is a grey box
//                                  offline. PractitionerSummaryRow's
//                                  AvatarWithFallback is the fallback BRAND
//                                  §App shell requires.
//   the app-bar "profile" avatar   756:4384's action slot is EMPTY, and what was
//                                  there was a hardcoded photograph of a
//                                  stranger labelled "Your profile".
//   the `"May"` literal            `${d.day}, May ${d.date}` asserted a month it
//                                  was never given. DatePill's third line is the
//                                  real month and the param is now an ISO date.
//   private SlotGroup + date tile  and BOTH long FLAGGED comment blocks that
//                                  explained why they could not be migrated. The
//                                  designer answered them: 11:104 gained
//                                  `Layout=Hug|Fill` and `State=Unavailable`.
//   px-gutter (24)                 the frame's gutter is 16 (x=16, width 361 in a
//                                  393 frame) and so is BRAND §Spacing. The
//                                  24px `gutter` alias is legacy by its own
//                                  comment in tailwind.config.js.
//   4 shadow constants             already gone in the 2026-07-31 elevation
//                                  sweep; the reasoning holds and nothing here
//                                  floats, so nothing came back.
//
// THE TWO CALENDAR CONTROLS ARE DELETED (this pass). "See Calendar" (756:4413's
// action slot) and the no-slots "See calendar" button (757:5597) both pointed at
// a full-month picker that has no frame and no route, and `openCalendar` was
// `() => {}`. Keeping a drawn-but-dead control was defensible for the header
// action, which is a shortcut past a control that works; it was not defensible
// for the no-slots one, because that button was the ONLY escape the empty state
// offered and pressing it did nothing at all. A user on a day with no times had
// one affordance and it was inert. The empty state now points at the date strip
// directly above it, which is a control that exists. Logged in
// docs/api/README.md's gap register; both come back when the picker is designed.
//
// AVAILABILITY IS NOT CONFIRMED, AND THE SCREEN SAYS SO (this pass). The grid is
// `SEED_SLOTS`, `/v1/slots` does not exist, and `POST /v1/bookings` is real — so
// this screen takes real bookings against times no clinician published. The
// notice above the grid is the honest form of that until the endpoint lands; it
// is driven by `isProvisional` off the payload, so it deletes itself when the
// grid becomes real rather than needing to be remembered.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// This file uses none.

import { useMemo, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { DetailShell } from "@/components/shell";
import {
  Card,
  ChoiceChip,
  ChoiceChipRow,
  DatePill,
  DockedActionBar,
  EmptyState,
  Icon,
  InfoCallout,
  Input,
  PractitionerSummaryRow,
  SectionHeader,
  KeyboardInset,
} from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import {
  parseClockMinutes,
  useDateStrip,
  useSlots,
  type DateOption,
  type Slot,
} from "./hooks/use-booking-availability";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 756:4384: every Body child sits at x=16 in a 393 frame. Also BRAND §Spacing. */
const GUTTER = 16;

/** Clears the docked bar (88 tall + inset) with the frame's 24 of breathing room. */
const SCROLL_BOTTOM_PAD = 120;

/** The frame's 3-up slot grid, and the 12 gap on both axes. */
const SLOT_COLUMNS = 3;
const SLOT_GAP = 12;

/** docs/BRAND.md §Iconography: "20px in dense rows." */
const GLYPH = 20;

/** 756:4384. Type is one-of-N and no longer carries modality — see CONSULTATION_MODES. */
const CONSULTATION_TYPES = [
  "Standard Consultation",
  "Follow-up Visit",
  "Specialist Review",
  "Diagnostic Report",
] as const;

export type ConsultationMode = "in-person" | "video";

/**
 * The new axis. Two chips, 96 and 72 wide in the frame — i.e. hug, not fill.
 * The label is what the user reads; the id is what screens 2 and 3 branch on.
 */
const CONSULTATION_MODES: { id: ConsultationMode; label: string }[] = [
  { id: "in-person", label: "In person" },
  { id: "video", label: "Video" },
];

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

type Params = {
  practitionerId?: string;
  practitionerName?: string;
  practitionerSpecialty?: string;
  practitionerAvatar?: string;
  /**
   * The practitioner's rating, as the practitioner payload states it. Two params
   * because route params are strings; both must read as numbers or NEITHER is
   * shown. See `asRating`.
   */
  practitionerRating?: string;
  practitionerReviewCount?: string;
  /**
   * The clinician's consultation fee in MINOR UNITS, as `DoctorProfileOut`
   * states it (`consultation_fee_cents`). Carried, never rendered here — screen
   * 2 is where a price belongs, immediately above the commit. Passed through as
   * the raw integer string so exactly one place divides by 100.
   */
  practitionerFeeCents?: string;
  /**
   * The booking this journey REPLACES, when the user arrived from Appointments →
   * Reschedule. Carried untouched to screen 2, which is the only screen that can
   * act on it (there is no reschedule endpoint — see its `confirm`). Absent on a
   * new booking.
   */
  rescheduleOfId?: string;
  /** The five rehydrated choices. */
  date?: string;
  time?: string;
  mode?: string;
  type?: string;
  reason?: string;
};

/** Narrow an arbitrary param string to the mode union, never to a guess. */
function asMode(value: string | undefined): ConsultationMode | undefined {
  return value === "in-person" || value === "video" ? value : undefined;
}

/**
 * The rating, or nothing.
 *
 * This replaces `SEED_RATING = { value: 4.9, count: 1200 }`, which was a
 * hardcoded score and review count rendered beside a NAMED clinician — the frame
 * says 4.8 (326 reviews), and both numbers were a statement of fact about a real
 * person that no payload had made. Same class of defect as the fabricated
 * booking reference: presented as data, sourced from nowhere.
 *
 * `PractitionerSummaryRow` needs both halves (the row reads "4.8 (326 reviews)"),
 * so a rating with no count is not half a rating — it is no rating, and the row
 * degrades to `Show rating = false` exactly as 780:5363 draws it. Out-of-range
 * values are dropped rather than clamped: a 7.4 clamped to 5 is a made-up score.
 */
function asRating(
  value: string | undefined,
  count: string | undefined,
): { value: number; count: number } | undefined {
  if (value === undefined || count === undefined) return undefined;
  const parsedValue = Number(value);
  const parsedCount = Number(count);
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 5) return undefined;
  if (!Number.isInteger(parsedCount) || parsedCount < 0) return undefined;
  return { value: parsedValue, count: parsedCount };
}

/**
 * "09:00 AM" + "09:45 AM" -> "45 minutes"; 756:4356's Duration row.
 *
 * Derived from the two instants the PAYLOAD gives, which is what makes the row's
 * "From provider" badge true — the badge used to sit over a hardcoded
 * "45 Minutes". An end that is not after the start yields nothing rather than a
 * negative or zero duration, and the row does not render.
 *
 * The wording is chosen so screen 2's `parseDurationMinutes` reads it back
 * exactly ("45 minutes" -> 45, "1 hr 15 min" -> 75) — it is a display string on
 * the way out and a fallback for `ends_at` on the way in.
 */
function durationLabel(start: string, end: string | undefined): string | undefined {
  if (!end) return undefined;
  const from = parseClockMinutes(start);
  const to = parseClockMinutes(end);
  if (from === undefined || to === undefined) return undefined;
  const total = to - from;
  if (total <= 0) return undefined;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} minutes`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

/** Route params serialise `undefined` as the string "undefined"; drop it instead. */
function defined(params: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function SelectTimeSlotScreen() {
  const params = useLocalSearchParams<Params>();
  const dates = useDateStrip();

  /**
   * The strip's first BOOKABLE day, not its first day: a dashed date can never
   * be tapped, so defaulting onto one would open the screen in the no-slots
   * state with no way back to a date that has slots.
   */
  const firstBookableIso = useMemo(
    () => (dates.find((d) => !d.unavailable) ?? dates[0])?.iso ?? "",
    [dates],
  );

  // ------------------------------------------------------------------
  // Rehydration. INITIALISERS, not a useEffect — see the header note.
  // `time` and `type` deliberately start EMPTY: pre-selecting a medical
  // appointment slot the user never chose is how a wrong booking gets
  // confirmed, and it is what made `canProceed` dead code.
  // ------------------------------------------------------------------
  const [selectedDateId, setSelectedDateId] = useState<string>(
    () => params.date ?? firstBookableIso,
  );
  const [selectedSlot, setSelectedSlot] = useState<string>(() => params.time ?? "");
  const [mode, setMode] = useState<ConsultationMode>(() => asMode(params.mode) ?? "in-person");
  const [selectedType, setSelectedType] = useState<string>(() => params.type ?? "");
  const [reason, setReason] = useState<string>(() => params.reason ?? "");

  const selectedDate = useMemo<DateOption | undefined>(
    () => dates.find((d) => d.iso === selectedDateId) ?? dates[0],
    [dates, selectedDateId],
  );

  /**
   * The availability payload — not just the grid. `timezoneLabel` and `location`
   * are the clinic facts screen 2 draws its timezone badge, its Location card
   * and its "Directions" action from; they were never threaded, so all three
   * rendered `null` in every real run while the frame drew them.
   */
  const { slots, isLoading, isProvisional, timezoneLabel, location } = useSlots(
    params.practitionerId,
    selectedDateId,
  );

  /** 756:4384 groups by period; the group set comes from the data, not a literal. */
  const groups = useMemo(() => {
    const byPeriod = new Map<string, Slot[]>();
    for (const s of slots) {
      const bucket = byPeriod.get(s.period);
      if (bucket) bucket.push(s);
      else byPeriod.set(s.period, [s]);
    }
    return [...byPeriod.entries()];
  }, [slots]);

  const isEmpty = !isLoading && slots.length === 0;

  /**
   * The chosen slot as the payload described it, not just its label. This is
   * where `endTime` comes from — `BookingCreate.ends_at` is REQUIRED, and until
   * it is threaded api.ts has to fall back to an assumed 30 minutes on every
   * booking. A slot the current payload does not contain (a rehydrated time on a
   * date whose grid has changed) resolves to nothing, and nothing derived from
   * it is sent.
   */
  const selectedSlotDetail = useMemo(
    () => slots.find((s) => s.time === selectedSlot),
    [slots, selectedSlot],
  );

  /**
   * No longer dead. Loading and no-slots each disable the CTA (both frames draw
   * it disabled), and slot/type are genuinely empty until chosen.
   */
  const canProceed =
    !isLoading && !isEmpty && Boolean(selectedDate) && selectedSlot !== "" && selectedType !== "";

  const proceedToReview = () => {
    if (!canProceed || !selectedDate) return;
    router.push({
      // Route added this iteration — typedRoutes regenerates on dev server start.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: "/(app)/review-appointment" as any,
      // ---------------------------------------------------------------
      // What screen 2 actually needs.
      //
      // It was sent nine params and reads fourteen. The five it never got are
      // not decoration: `endTime` and `timezone` are the time row's range and
      // its badge, `duration` is the whole Duration row INCLUDING the "From
      // provider" badge, and `locationName`/`locationAddress` gate the entire
      // Location section — which is where required item 5's "Directions" action
      // lives. Every one of those blocks rendered `null` on every real run
      // while the frame drew them, because this push had no slot for them.
      //
      // `defined()` strips the absent ones: expo-router serialises an undefined
      // param as the literal string "undefined", and screen 2's `text()` guard
      // would then treat "undefined" as a clinic name.
      // ---------------------------------------------------------------
      params: defined({
        practitionerId: params.practitionerId,
        practitionerName: params.practitionerName,
        practitionerSpecialty: params.practitionerSpecialty,
        practitionerAvatar: params.practitionerAvatar,
        // ISO, not "Tue, May 13". Screens 2 and 3 both render "Tuesday, 13 May
        // 2025", so formatting belongs at the leaf — and the rehydration round
        // trip above needs a key that survives reformatting.
        date: selectedDate.iso,
        time: selectedSlot,
        // The slot's own end. api.ts prefers this over `durationMinutes`, so the
        // booked window is the provider's rather than a 30-minute assumption.
        endTime: selectedSlotDetail?.endTime,
        timezone: timezoneLabel,
        duration: durationLabel(selectedSlot, selectedSlotDetail?.endTime),
        locationName: location?.name,
        locationAddress: location?.address,
        mode,
        type: selectedType,
        reason,
        // Carried, not consumed. The fee is the doctor payload's and screen 2
        // renders it beside the commit; this screen has no place for a price.
        feeCents: params.practitionerFeeCents,
        // And the booking this one replaces, when there is one.
        rescheduleOfId: params.rescheduleOfId,
      }),
    });
  };

  return (
    /* ------------------------------------------------------------------
       DetailShell owns the safe area, the StatusBar and the detail bar.

       NO `actions`: 756:4384's app bar has an EMPTY action slot. What was
       there was a hardcoded Google-CDN photograph of a stranger labelled
       "Your profile" — not in the frame, and not the user.

       `claimsBottomInset={false}`: DockedActionBar renders its OWN
       <SafeAreaView edges={["bottom"]}> so its fill runs under the gesture
       bar. If the shell claimed the inset too, the padding doubles.
    ------------------------------------------------------------------ */
    <DetailShell title="Book Appointment" claimsBottomInset={false}>
      {/* The KAV wraps the scroll body AND the docked bar, which is what makes
          the bar ride above the keyboard in 758:2091 instead of sitting behind
          it. It is a direct child of the shell's flex-1 body, i.e. BELOW the app
          bar — a KAV above the bar lifts the bar off the top of the screen. */}
      {/* KeyboardInset, NOT KeyboardAvoidingView — the KAV infers the keyboard
          from a WINDOW RESIZE that Android edge-to-edge no longer performs, so it
          silently does nothing there. Proven on device on the chat composer. */}
      <KeyboardInset className="flex-1">
        <ScrollView
          contentContainerStyle={{ paddingTop: GUTTER, paddingBottom: SCROLL_BOTTOM_PAD }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ----------------------------------------------------------
              Practitioner — 756:4384 y=16
          ---------------------------------------------------------- */}
          <View className="px-4">
            {isLoading ? (
              <PractitionerSkeleton />
            ) : (
              <PractitionerSummaryRow
                surface="card"
                verified
                name={params.practitionerName ?? ""}
                specialty={params.practitionerSpecialty ?? ""}
                avatarUri={params.practitionerAvatar}
                // From the practitioner payload or absent — never a constant.
                rating={asRating(params.practitionerRating, params.practitionerReviewCount)}
              />
            )}
          </View>

          {/* ----------------------------------------------------------
              Select Date
          ---------------------------------------------------------- */}
          <View className="mt-6">
            {/* No action slot. 756:4413 draws "See Calendar" here; the picker it
                opens has no frame and no route, so the control was a no-op. */}
            <View className="px-4">
              <SectionHeader title="Select Date" />
            </View>
            {/* Full-bleed: BRAND §Horizontal strips wants the items to scroll
                edge to edge with a TRAILING inset matching the leading gutter,
                which is why the 16 is content padding rather than parent
                padding. The old strip used 24 and had no trailing inset. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: SLOT_GAP, paddingHorizontal: GUTTER }}
            >
              {isLoading
                ? dates.map((d) => <SkeletonBlock key={d.iso} width={60} height={80} />)
                : dates.map((d) => (
                    <DatePill
                      key={d.iso}
                      day={d.day}
                      date={d.date}
                      month={d.month}
                      selected={d.iso === selectedDateId}
                      unavailable={d.unavailable}
                      onPress={() => {
                        setSelectedDateId(d.iso);
                        // The chosen time belongs to the old date. Carrying it
                        // across would leave a slot selected that this date may
                        // not offer — and `canProceed` would let it through.
                        setSelectedSlot("");
                      }}
                    />
                  ))}
            </ScrollView>
          </View>

          {/* ----------------------------------------------------------
              Available Slots — default / loading / empty
          ---------------------------------------------------------- */}
          <View className="mt-6 px-4">
            <SectionHeader title="Available Slots" />

            {/* THE GRID IS NOT THE CLINICIAN'S DIARY, and the patient is told so
                before they pick from it. `/v1/slots` does not exist (see the hook
                header) while `POST /v1/bookings` does, so every time below is a
                bookable request against a calendar nobody has read. Stating that
                is the only honest option available: hiding the grid removes the
                only way to book at all, and dressing it up as availability is the
                defect. Rendered above the chips, not below, because a caveat
                after the choice is a caveat after the decision. */}
            {isProvisional && !isLoading ? (
              <View className="mb-4">
                <InfoCallout tone="info">
                  These times aren&apos;t confirmed with the clinician yet. We&apos;ll send your
                  request and the clinic will confirm or offer another time.
                </InfoCallout>
              </View>
            ) : null}

            {isLoading ? (
              <SlotGridSkeleton />
            ) : isEmpty ? (
              <NoSlots
                dateLabel={
                  selectedDate ? `${selectedDate.day} ${selectedDate.date} ${selectedDate.month}` : ""
                }
              />
            ) : (
              groups.map(([period, periodSlots]) => (
                <SlotGroup
                  key={period}
                  label={period}
                  slots={periodSlots}
                  selected={selectedSlot}
                  onSelect={setSelectedSlot}
                />
              ))
            )}
          </View>

          {/* ----------------------------------------------------------
              Consultation Mode — NEW. The axis screens 2 and 3 branch on.
          ---------------------------------------------------------- */}
          <View className="mt-6 px-4">
            <SectionHeader title="Consultation Mode" />
            <ChoiceChipRow>
              {CONSULTATION_MODES.map((m) => (
                <ChoiceChip
                  key={m.id}
                  label={m.label}
                  role="radio"
                  layout="hug"
                  selected={m.id === mode}
                  onPress={() => setMode(m.id)}
                />
              ))}
            </ChoiceChipRow>
          </View>

          {/* ----------------------------------------------------------
              Consultation Type
          ---------------------------------------------------------- */}
          <View className="mt-6">
            <View className="px-4">
              <SectionHeader title="Consultation Type" />
            </View>
            {/* `scrollable` applies the 16 gutter as its OWN content inset, so
                the row must sit outside the screen's padding — full-bleed. */}
            <ChoiceChipRow scrollable>
              {CONSULTATION_TYPES.map((t) => (
                <ChoiceChip
                  key={t}
                  label={t}
                  role="radio"
                  selected={t === selectedType}
                  onPress={() => setSelectedType(t)}
                />
              ))}
            </ChoiceChipRow>
          </View>

          {/* ----------------------------------------------------------
              Reason for Visit — 757:4814, 361x96 multiline
          ---------------------------------------------------------- */}
          <View className="mt-6 px-4">
            <View className="mb-2 flex-row items-center gap-2">
              <Text className="font-label-md text-label-md text-on-surface">Reason for Visit</Text>
              {/* The frame labels it optional, and saying so is what stops a
                  user treating an empty field as an error. */}
              <Text className="font-label-sm text-label-sm text-on-surface-variant">Optional</Text>
            </View>
            <Input
              multiline
              numberOfLines={3}
              value={reason}
              onChangeText={setReason}
              placeholder="Describe your symptoms or reason for the appointment…"
              // RN does not link a sibling <Text> to a TextInput the way an HTML
              // <label for> does, so the visible heading gives the field no name.
              accessibilityLabel="Reason for visit"
            />
          </View>
        </ScrollView>

        {/* --------------------------------------------------------------
            Docked CTA — 781:2281 Single, radius/12 at 56.
            Inside the KAV, so 758:2091's "bar above the keyboard" is
            structural rather than something the layout happens to do.
        -------------------------------------------------------------- */}
        <DockedActionBar
          primary={{
            label: "Book Now",
            trailingIcon: "chevron-right",
            onPress: proceedToReview,
            disabled: !canProceed,
          }}
        />
      </KeyboardInset>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Slot group — one period's 3-up grid.
//
// The private chip is gone. 11:104 gained `Layout=Hug|Fill` (756:4205 /
// 756:4207), which is exactly the axis the old FLAGGED comment asked for: a
// `layout="fill"` chip inflates to its grid cell, so the shared primitive can be
// the grid cell's content and the ragged-gutter argument no longer applies.
// ---------------------------------------------------------------------------

function SlotGroup({
  label,
  slots,
  selected,
  onSelect,
}: {
  label: string;
  slots: Slot[];
  selected: string;
  onSelect: (slot: string) => void;
}) {
  const glyphColor = useTokenColor("on-surface-variant");

  const rows: Slot[][] = [];
  for (let i = 0; i < slots.length; i += SLOT_COLUMNS) {
    rows.push(slots.slice(i, i + SLOT_COLUMNS));
  }

  return (
    <View className="mb-6">
      <View className="mb-2 flex-row items-center gap-2">
        {/* Decorative — the word beside it says "Morning". */}
        <Icon chrome="schedule" size={GLYPH} color={glyphColor} />
        <Text
          className="font-label-md text-label-md text-on-surface-variant"
          style={{ textTransform: "uppercase", letterSpacing: 1 }}
        >
          {label}
        </Text>
      </View>

      <View style={{ gap: SLOT_GAP }}>
        {rows.map((row, rowIndex) => (
          <View key={row[0].time} className="flex-row" style={{ gap: SLOT_GAP }}>
            {row.map((slot) => (
              <View key={slot.time} className="flex-1">
                <ChoiceChip
                  label={slot.time}
                  role="radio"
                  layout="fill"
                  selected={slot.time === selected}
                  unavailable={!slot.available}
                  onPress={() => onSelect(slot.time)}
                />
              </View>
            ))}
            {/* 756:5157: a short last row keeps its columns. Without the
                spacers the two survivors would each take half the width and the
                grid's rhythm would break on the final row. */}
            {Array.from({ length: SLOT_COLUMNS - row.length }, (_, i) => (
              <View key={`spacer-${rowIndex}-${i}`} className="flex-1" />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// No slots — 757:5597.
//
// Scoped to the Available Slots SECTION, not the screen: the frame keeps the
// practitioner, the date strip, mode, type and reason all live, because the
// user's next action is to pick a different date and that control is right above
// this block. A full-screen empty state would take it away.
// ---------------------------------------------------------------------------

function NoSlots({ dateLabel }: { dateLabel: string }) {
  return (
    // Container=Inline, which is the axis this section-scoping needs: it sits
    // under a section that is still on screen, so a Card here would draw a card
    // inside the page's own rhythm and read as the whole screen having failed.
    // Its 16/12 ramp is what this block was already hand-typed to.
    <EmptyState
      container="inline"
      icon="search-off"
      title={`No slots on ${dateLabel}`}
      // The date strip is a control that exists and is directly above this
      // block. The "See calendar" button that used to sit here opened nothing —
      // and it was the ONLY affordance this state offered, so the one way out of
      // an empty day was a button that did not work. Hence no `action`.
      body="Pick another date in the strip above."
    />
  );
}

// ---------------------------------------------------------------------------
// Loading — 757:5286.
//
// The frame draws SKELETONS, not a spinner: the layout is known before the data
// is, so holding the shape stops the whole page reflowing when slots land. A
// spinner would also have to sit somewhere, and wherever it sat would be a
// position the frame does not draw.
//
// These are private on purpose. A skeleton is not one of the frames' shared
// components (no Figma component instances them), and the house rule in
// src/components/ui/README.md is that `ui/` holds what the design system
// defines — inventing a `Skeleton` primitive from a screen would be the same
// bottom-up drift the booking components were just extracted to fix. If a second
// screen needs one, that is the moment it moves.
// ---------------------------------------------------------------------------

function SkeletonBlock({
  width,
  height,
  radius = 12,
  flex,
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  flex?: boolean;
}) {
  return (
    <View
      // A token, not a grey literal: a skeleton frozen in light mode is a white
      // flash on a near-black page every time the screen opens in dark mode.
      className="bg-surface-container-high"
      // Hidden from assistive tech: a screen reader must hear the loaded content
      // or nothing, never eleven unlabelled rectangles.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, borderRadius: radius, ...(flex ? { flex: 1 } : null) }}
    />
  );
}

function PractitionerSkeleton() {
  return (
    <Card className="w-full flex-row items-center gap-3">
      <SkeletonBlock width={56} height={56} radius={999} />
      <View className="flex-1" style={{ gap: 8 }}>
        <SkeletonBlock width="70%" height={20} />
        <SkeletonBlock width="50%" height={16} />
        <SkeletonBlock width="40%" height={16} />
      </View>
    </Card>
  );
}

/** Two groups of three rows, matching the shape the seed grid resolves to. */
const SKELETON_SLOT_ROWS = 2;

function SlotGridSkeleton() {
  return (
    <View style={{ gap: 24 }}>
      {Array.from({ length: SKELETON_SLOT_ROWS }, (_, group) => (
        <View key={`group-${group}`} style={{ gap: SLOT_GAP }}>
          <SkeletonBlock width={96} height={16} />
          {Array.from({ length: 2 }, (_, row) => (
            <View key={`row-${row}`} className="flex-row" style={{ gap: SLOT_GAP }}>
              {Array.from({ length: SLOT_COLUMNS }, (_, col) => (
                <SkeletonBlock key={`cell-${col}`} height={44} flex />
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
