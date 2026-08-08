// Authenticated home screen — "patient_home_premium_refinement_updated_nav"
// (Figma file kRifcg1KCEAlTXy4aimotK, page "Patient Home", frame 107:184).
// Supersedes the earlier "patient_home_active_care_focus" (frame 93:102)
// build: same body sections, refined app bar + nav alignment.
//
// Translation calls:
//   - glass-card (rgba bg + backdrop-filter blur(12px)) → bg-white/80 with a
//     light border. RN can't backdrop-blur cheaply; identical at this opacity.
//   - ai-pulse keyframe → reanimated shared-value loop on the hero blob.
//   - horizontal scroll-snap → ScrollView horizontal with hidden scrollbar.
//   - hover:* / hover:bg-* / hover:text-* → dropped.
//   - The HTML uses a hard-coded "Good morning, Alex" — we greet by the
//     authenticated user's first name, falling back to "there".
//   - "Bottom Navigation Bar" → BottomNav component. This frame's bottom tab
//     bar reads Home / Overview / Inbox / Community / Lifestyle, which now
//     matches the shared BottomNav 1:1 (resolves the tab-set mismatch flagged
//     against the previous "patient_home_active_care_focus" build).
//   - AvatarWithFallback (header avatar + appointment-card provider avatar)
//     → components/ui/AvatarWithFallback.tsx, new shared primitive per the
//     design brief §2/§5 — initials-tinted circle, not a hardcoded photo.
//
// Design-approved deviations from the raw prototype (per FINAL DESIGN REVIEW):
//   - Bell touch target bumped to 44x44 via hitSlop/padding (WCAG 4.1.2);
//     the frame's bell asset is a raw 26x40 icon graphic.
//
// The approved "Why this? / Dismiss" trust row is GONE, and the reason is in
// the FABRICATION PASS note below: it was the transparency control for an
// inference this screen never made. With the invented inference deleted there
// is nothing left to explain or dismiss, so the row would have been two dead
// Pressables guarding nothing. Re-add it, unchanged, the moment the hero shows
// a real model output.
//
// Flagged deviation (not silently dropped): this frame's header/quick-services
// no longer includes a dedicated SOS affordance (the previous build promoted
// SOS into the app bar as an interim measure). Since no SOS flow ships yet
// and the newly-approved frame doesn't call for one, the app-bar SOS button
// is removed to match the approved design exactly — re-introduce it (in
// whatever slot design specifies) once a real emergency-access feature and a
// placement decision exist.
//
// ============================================================================
// SHELL MIGRATION (2026-07-30) — the inline app bar is gone
// ============================================================================
// Verified against Figma 93:102, whose FIRST child is an INSTANCE of the
// component "Patient AppBar (Avatar + Logo + Bell)" (101:163 → 101:142) and
// whose last child is an instance of "Patient BottomTabBar" (101:173 → 101:143).
// Both halves of the chrome are component instances in the frame, so the frame
// itself says the screen must not own them: this file now renders
// <PatientShell>, which composes exactly those two (docs/BRAND.md §App shell,
// "Screens own their content, not their chrome").
//
// Removed with the bar, and why each was wrong on its own terms:
//   - MaterialIcons name="notifications" color="#ffffff"   literal white glyph
//   - className="... bg-on-surface-variant"                a FILLED bell
//     container, which docs/BRAND.md forbids outright: "Never use a raw
//     white/black fill on an icon container or tab item — leave those
//     transparent so the parent surface shows through."
//   - className="border-2 border-white"                    literal white ring
//   - className="border-2 border-primary/20" on the avatar  a ring the canonical
//     AvatarWrapper (103:106) does not have
//   - StatusBar style="dark"                               frozen light-mode
//     value; the shell derives it from the resolved scheme instead
//
// FLAGGED — behaviour the shell cannot express, not silently dropped:
// the old bell carried a count-less unread DOT and the label "Notifications,
// unread". Nothing in the app models notification counts, so that dot was a
// decorative claim of unread activity with no data behind it. The badge
// treatment PatientAppBar used to hold for this is gone too — see that file and
// docs/api/README.md's gap register for the fields `notification_service` would
// have to expose before a badge can mean anything.
//
// ============================================================================
// FABRICATION PASS (2026-08-07) — this screen had NO network call and said
// clinical things anyway
// ============================================================================
// Everything on it below the greeting was a literal, and four of those literals
// were statements about the patient's body or their care:
//
//   * "Your blood pressure readings look steady this week — great progress on
//     your care plan." Attributed to MedAI, i.e. presented as something a system
//     had ANALYSED. Nothing in this app has ever read a blood pressure. This was
//     the worst string in the file and it is deleted outright, not softened: a
//     fabricated inference dressed as a model output is worse than no card.
//   * "Morning breathing improves your HRV" + a licensing-placeholder image. An
//     invented clinical claim in an invented article. The whole Health Insights
//     section goes with it — there is no content service, so the section cannot
//     be sourced, and BRAND's own rule for this pass is that an unsourceable
//     card is removed rather than re-filled.
//   * Sleep "7h 20m" and Steps "6,240 / 8,000". These CAN be sourced —
//     `wearable_sync_service` stores `sleep_minutes` and `steps`, and
//     `features/wearables/daily.ts` already owns the cumulative-latest-per-day
//     arithmetic that LifestyleHubScreen uses. So they are wired, not deleted.
//     The "/ 8,000" goal is deleted: nothing stores a step target, so the
//     denominator was the one half of that row that could not be made true.
//   * `NEXT_APPOINTMENT` — an invented clinician and the literal string
//     "Tomorrow, 10:30 AM", which was still saying "tomorrow" on the day the
//     appointment would have been yesterday. `GET /v1/bookings` is live and
//     `appointmentsApi.listAppointments()` already adapts it, so this card now
//     renders the patient's real next booking or nothing at all.
//
// The rule applied throughout: source it or remove it. No placeholder was
// invented to stand in for anything deleted, and every removal is recorded in
// docs/api/README.md's gap register.

import { useEffect } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useAuthStore } from "@/store/auth-store";
import { PatientShell } from "@/components/shell";
import { AvatarWithFallback, Card, Icon, type ChromeIconName } from "@/components/ui";
import { useTokenColor, type ColorToken } from "@/lib/tokens";
import { appointmentsApi, type Appointment } from "@/features/appointments/api";
import { wearablesApi } from "@/features/wearables/api";
import { dailyTotalFor } from "@/features/wearables/daily";

// ============================================================================
// ICON GATE (2026-08-02) — the direct `MaterialIcons` import is gone
// ============================================================================
// docs/BRAND.md allows exactly one file to import an icon library, and it is
// `components/ui/icons/Icon.tsx`. This screen was importing `MaterialIcons`
// directly and drawing eleven glyphs with it, so it owned an icon vocabulary of
// its own. Every one of those call sites now goes through `<Icon />`.
//
// They go through it as `chrome=`, not `name=`, and that is a DELIBERATE
// half-step rather than an oversight. Several of these are domain concepts
// (pharmacy, labs, vitals, records) that BRAND would eventually want drawn from
// Health Icons — but Health Icons is line art and MaterialIcons is a solid
// family, and swapping four of six tiles would leave the Quick Services strip
// drawing two icon styles in one row, which is a worse defect than the one being
// fixed. The strip should move to Health Icons as ONE job, with a designer
// choosing the glyphs. FLAGGED, not silently absorbed.
//
// `type IconName = React.ComponentProps<typeof MaterialIcons>["name"]` is gone
// with the import; `ChromeIconName` is the same union, re-exported by the gate
// precisely so screens can type a forwarded glyph without importing the library.

// ============================================================================
// The Upcoming Appointments card — a real booking or no card
// ============================================================================
// `NEXT_APPOINTMENT` used to live here: an invented clinician, an invented
// specialty and an id of "appointment-next", rendered under the literal string
// "Tomorrow, 10:30 AM". Three separate untruths in one card, and the third was
// the one that could never become right — a hardcoded "Tomorrow" is wrong on
// every day but the one it was written on.
//
// The constant existed because two halves of the card had drifted apart (the
// face said "Dr. Sarah Chen", the Join Call handler pushed "Dr. Julian
// Sterling"), and hoisting them into one object made them agree. They agreed on
// a fiction. The fix is the source, not the shape: `GET /v1/bookings` is routed,
// live, and already adapted by `features/appointments/api.ts`, which hydrates
// each booking's clinician from doctor_service. The card takes `upcoming[0]`
// from exactly that call — the same query key AppointmentManagementScreen uses,
// so the two screens share one cache and cannot disagree about "next".
//
// It renders NOTHING while the query is pending, on error, or when the patient
// has no upcoming booking. A skeleton or an empty-state illustration would both
// be additions this pass has no design for; an absent section is the honest
// resting state and matches what the appointments screen does with the same
// data.

/**
 * `Tomorrow, 10:30 AM` — but derived from the instant, so it stops saying
 * "Tomorrow" when it stops being tomorrow.
 *
 * Formatted on the device, in the device's own zone and locale, for the reason
 * AppointmentManagementScreen's `formatWhen` gives: the server stores an
 * instant and the patient reads a wall clock. This differs from that helper
 * only in preferring the relative day words the frame asks for on this card.
 */
function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  // Compared as LOCAL calendar days, not as a 24-hour delta: an appointment at
  // 09:00 tomorrow is 14 hours away at 19:00 today, and "in 14 hours" is not
  // what "Tomorrow" means to a patient reading a schedule.
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;

  const day = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

/**
 * "Dr. Kwabena Osei" -> "KO". Same rule as the appointments screen: the
 * honorific is stripped first so every clinician does not initial as "D".
 */
function initialsOf(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The clinician's name, or an honest stand-in — `hydrate` leaves `doctor` null
 * when doctor_service could not resolve the id, and a real appointment should
 * still be visible with its time intact rather than borrowing a name.
 */
function doctorName(a: Appointment): string {
  return a.doctor?.name ?? "Unknown clinician";
}

export function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";

  // Same key as AppointmentManagementScreen, deliberately: one cache entry, so
  // "your next appointment" cannot read differently on two screens.
  const { data: appointments } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => appointmentsApi.listAppointments(),
  });
  // `upcoming` is already sorted soonest-first by the api module.
  const nextAppointment = appointments?.upcoming[0] ?? null;

  // Same key and same single request as LifestyleHubScreen — `recent_samples`
  // on the summary is what wearable_sync_service offers for this, and fetching
  // per device would be an N+1 for two numbers.
  const { data: wearableSummary } = useQuery({
    queryKey: ["wearables", "summary"],
    queryFn: () => wearablesApi.getSummary(),
  });
  const samples = wearableSummary?.recentSamples ?? [];
  // `null` when there is no reading, and the row is then not rendered at all.
  // docs/api/wearable_sync_service.md: "No readings returns null, not zero.
  // Zero steps claims the patient did not move; no data does not."
  const sleep = dailyTotalFor(samples, "sleep_minutes");
  const steps = dailyTotalFor(samples, "steps");

  // ai-pulse: scale 1 → 1.1 → 1 over 3s, infinite. Matches the Stitch keyframe.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  // The hero is `bg-primary-container`, so everything drawn ON it takes that
  // container's own content pair. Both of these were `rgba(255,255,255,…)` /
  // `#ffffff` — the light value of a token, frozen: in dark mode
  // `primary-container` is #005049 and the glyph stayed pure white on it while
  // every sibling surface had flipped.
  const onHero = useTokenColor("on-primary-container");
  const onHeroWash = useTokenColor("on-primary-container", 0.1);

  return (
    // Chrome (patient app bar + patient bottom nav + status bar + safe area) is
    // the shell's. `paddingBottom: 140` below stays: BottomNav is absolutely
    // positioned and reserves no layout space, so the ScrollView still has to
    // clear it itself.
    <PatientShell
      activeTab="home"
      avatarUri={user?.avatarUrl}
      avatarInitials={firstName[0]}
      avatarLabel={user?.displayName ?? "Your profile"}
      // No `onTabPress`: PatientShell's default routes every tab through
      // PATIENT_TAB_HREFS with `replace`. This screen used to hand-roll its own switch, which
      // both re-implemented the map and used `push` — so tab switching grew the back stack
      // without bound and Android back walked tab history instead of leaving the app.
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* MedAI hero card */}
        <View className="mt-md overflow-hidden rounded-3xl bg-primary-container p-md">
          <Animated.View
            pointerEvents={Platform.OS === "web" ? undefined : "none"}
            style={[
              {
                position: "absolute",
                right: -40,
                top: -40,
                height: 160,
                width: 160,
                borderRadius: 80,
                backgroundColor: onHeroWash,
                ...(Platform.OS === "web" ? { pointerEvents: "none" } : {}),
              },
              pulseStyle,
            ]}
          />
          <View
            pointerEvents={Platform.OS === "web" ? undefined : "none"}
            style={Platform.OS === "web" ? { pointerEvents: "none" } : undefined}
            className="absolute -bottom-5 -left-5 h-24 w-24 rounded-full bg-primary/20"
          />
          <View className="z-10 gap-sm">
            <View className="h-12 w-12 items-center justify-center rounded-xl bg-on-primary-container/20">
              {/* Decorative — "Talk to MedAI" is the heading right below it. */}
              <Icon chrome="auto-awesome" size={24} color={onHero} />
            </View>
            <Text className="font-headline-md text-headline-md text-on-primary-container">
              Talk to MedAI
            </Text>
            {/* An INVITATION, not an inference. This slot used to hold a
                quoted sentence about the patient's own blood pressure,
                attributed to MedAI, on a screen that issues no vitals request
                and never has — the strongest possible framing (a system
                analysed you) around the weakest possible basis (a string
                literal). The wording here is AiAssistantScreen's own empty
                state, so the card promises exactly what the destination
                delivers and asserts nothing about this patient. */}
            <Text
              className="font-body-md text-on-primary-container/90"
              style={{ fontSize: 15, lineHeight: 21, maxWidth: "80%" }}
            >
              Ask about symptoms, a medicine or a lab report. MedAI gives general information, not a
              diagnosis.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ask MedAI"
              onPress={() => router.push("/(app)/ai-assistant" as Href)}
              // No shadow: this is a button sitting ON the hero card, not a
              // surface floating above the page. docs/BRAND.md §Elevation
              // reserves a blur for sheets/menus/dialogs/toasts/FABs. The
              // deleted style was a literal `#000` at 15% — grey haze, roughly
              // double the ceiling the floating role itself allows. Contrast
              // against the teal hero already separates it.
              // `bg-white` + `text-primary` was a WCAG failure waiting for dark
              // mode: `primary` is #6BD8CB there, so the label would have been
              // mint on pure white, ~1.4:1. `surface` is the role this pill
              // actually plays — a raised page-coloured chip lifted off the
              // teal hero — and it carries `primary` correctly in both schemes
              // because that is the pairing every other surface on this screen
              // already uses.
              className="mt-sm w-fit flex-row items-center gap-sm self-start rounded-full bg-surface px-md py-sm active:scale-95"
            >
              <Text className="font-inter-semibold text-[14px] text-primary">Ask MedAI</Text>
            </Pressable>
          </View>
        </View>

        {/* Quick Services.
            No `actionLabel`. It carried "View All" and no `onAction`, so
            `Section` rendered `onPress={undefined}` — a live-looking link with
            a press animation and `accessibilityRole="button"` that did nothing
            on every render since the strip shipped. There is no "all services"
            screen to send it to (the strip IS every service), so the affordance
            is removed rather than pointed somewhere plausible. */}
        <Section title="Quick Services">
          {/* ================================================================
              SIXTH TILE: "Find Care" — and why the strip is now 3 x 2
              ================================================================
              Find Care is the provider directory. It is designed, built, and
              one of only three screens wired to a real backend, and until this
              change NOTHING in src/features linked to it — so booking a first
              appointment with a provider you have not seen was unreachable from
              any tab, tile or button in the app. FindCareScreen's own header has
              said "Reached from HomeScreen's Quick Services → Find Care tile"
              since it was written; this is that tile finally existing.

              It is a TILE and not a sixth tab, deliberately. `Patient
              BottomTabBar` 740:1015 ships exactly five values and BottomNav
              matches it 1:1; a sixth would contradict an approved component and
              squeeze six 44pt targets across 360dp. This strip is the
              established precedent for a secondary destination — it already
              carries Appts, Pharmacy, Labs, Vitals and Records.

              WHY THE ROW WRAPS. One row of six does not fit 360dp, and BRAND's
              strip rule ("nothing is half-sliced in the resting state") makes
              that a hard stop rather than a preference:

                content column at 360dp = 360 - 2 x 16 = 328
                6 tiles + 5 x 8 gaps    = (328 - 40) / 6 = 48.0 per tile

              48 breaks the strip twice over. The 56 icon plate (24 glyph + 2 x
              16) no longer fits inside its own tile, and "Pharmacy" measures
              ~52px at 12 Inter Medium, so a settled label would start
              ellipsising — on the widest existing tile, not the new one. The
              alternatives were both worse: shrinking the plate to 48 still
              truncates the label, and re-scrolling the strip is the exact defect
              deleted when this was five tiles ("for an icon strip the honest fix
              is to fit them, not to scroll") and would put a half-sliced tile
              back at rest.

              Two rows of three is the fix that keeps every existing treatment
              intact — same 56 plate, same 12sp label, same tint, same glyph
              size — and simply gives six items a shape that fits:

                3 tiles + 2 x 8 gaps = (328 - 16) / 3 = 104.0 per tile

              104 clears the widest label with ~50px to spare and the tap target
              is 104 x 72, well over the 44pt floor. Two explicit rows of flex-1
              tiles rather than `flex-wrap`: flex-1 divides whatever width the
              device actually reports exactly, which is the same reasoning the
              five-tile row used, and wrap + percentage bases would not survive a
              budget device that doesn't report 393dp.

              FLAGGED for the designer: Figma 93:153 draws ONE row of five. This
              is a real deviation from an approved frame, taken because the
              approved frame has no sixth slot and the funnel it gates is dead
              without one. If the answer is "Find Care belongs somewhere else on
              Home", the tile moves and this reverts to one row. */}
          <View className="gap-md">
            <View className="flex-row gap-base">
              {/* `person-search` — a provider directory is "search for a
                  clinician", and this is the one glyph in the shared set that
                  says exactly that. Health Icons has `doctor` and `stethoscope`,
                  which name a clinician but not the act of finding one, and both
                  are line art that would clash with the five solid glyphs
                  already in this strip (see the ICON GATE note above). */}
              <QuickService
                icon="person-search"
                label="Find Care"
                tint="primary"
                onPress={() => router.push("/(app)/find-care" as Href)}
              />
              <QuickService
                icon="event-available"
                label="Appts"
                tint="primary"
                onPress={() => router.push("/(app)/appointments" as Href)}
              />
              {/* Pharmacy, Labs, Vitals and Records have no shipped
                  destination. `pharmacy-detail` needs a pharmacy id and is not
                  a directory; there is no labs screen, no vitals screen, and
                  `patient-record` is blocked on slug-vs-UUID and consent gating
                  (docs/api/README.md). So they render as NON-INTERACTIVE tiles.
                  They used to be `Pressable`s with `accessibilityRole="button"`
                  and `active:scale-95` and no handler — a control that
                  announced itself as a button to TalkBack and depressed under
                  the finger, four times in one strip. A tile with no
                  destination must not do either. */}
              <QuickService icon="local-pharmacy" label="Pharmacy" tint="primary" />
            </View>
            <View className="flex-row gap-base">
              {/* "Labs", not "Lab Results": at the old 62.6px tile it wrapped to
                  two lines and made that one tile 94 tall against the others'
                  79. The 104px tile would now hold "Lab Results" — the label is
                  left alone anyway, because renaming a settled tile is a content
                  change this pass has no mandate for. */}
              <QuickService icon="science" label="Labs" tint="primary" />
              <QuickService icon="monitor-heart" label="Vitals" tint="primary" />
              <QuickService icon="folder-shared" label="Records" tint="primary" />
            </View>
          </View>
        </Section>

        {/* "Your Health Insights" is DELETED — the whole section, not just its
            copy. It was one card whose article ("Morning breathing improves
            your HRV", "5 minutes of deep breathing each morning is linked to
            better recovery scores") was written into this file, under a
            category chip that was also written into this file, beside a tile
            the design brief had already flagged as a stand-in for a licensed
            image nobody had licensed. There is no content service and no
            insights endpoint anywhere in the backend, so nothing about this
            card could be sourced — and a health claim with no source is the
            one kind of placeholder this pass may not keep. It comes back when
            there is a service behind it; the layout is one `Card` and is not
            worth preserving in the meantime. Recorded in docs/api/README.md.

            It took `#ffd999` and `#ff9966` with it, which were the last two
            literal colours on this screen. */}

        {/* Daily Wellness — live from wearable_sync_service.
            Both rows were literals ("7h 20m", "6,240 / 8,000") and both are now
            the day's real cumulative reading, resolved by the shared
            `dailyTotalFor` so this screen cannot invent its own arithmetic. A
            row with no reading for today is NOT rendered: the alternative is a
            zero, and a zero here says the patient did not sleep.

            The step GOAL is gone. "6,240 / 8,000" had two numbers and only one
            of them can exist — nothing in this product stores a target, so the
            denominator was pure invention and it is dropped rather than
            defaulted to some round number.

            The whole section hides when neither figure is available, which is
            also the un-paired-device state. */}
        {sleep || steps ? (
          <Section title="Daily Wellness">
            <View className="gap-sm">
              {sleep ? (
                <WellnessRow icon="bedtime" label="Sleep" value={formatSleep(sleep.value)} />
              ) : null}
              {steps ? (
                <WellnessRow
                  icon="directions-walk"
                  label="Steps Today"
                  value={Math.round(steps.value).toLocaleString()}
                />
              ) : null}
            </View>
          </Section>
        ) : null}

        {/* Upcoming Appointments — the patient's real next booking, or nothing.
            The section header's "View All" is the one that was always wired,
            and it stays. */}
        {nextAppointment ? (
          <Section
            title="Upcoming Appointments"
            actionLabel="View All"
            onAction={() => router.push("/(app)/appointments" as Href)}
          >
            {/* Shared `Card`: 24 radius / 24 inset, full-strength hairline,
                `card-surface` fill, no drop shadow (docs/BRAND.md §Elevation). */}
            <Card className="gap-sm">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 flex-row items-center gap-sm">
                  <AvatarWithFallback
                    size={44}
                    uri={nextAppointment.doctor?.avatarUri}
                    initials={initialsOf(doctorName(nextAppointment))}
                    label={doctorName(nextAppointment)}
                  />
                  <View className="flex-1">
                    <Text
                      numberOfLines={1}
                      className="font-headline-md text-on-surface"
                      style={{ fontSize: 15 }}
                    >
                      {doctorName(nextAppointment)}
                    </Text>
                    {/* `DoctorSummary` carries a specialty; a booking whose
                        doctor lookup failed has none, and the line is dropped
                        rather than filled. */}
                    {nextAppointment.doctor?.specialty ? (
                      <Text
                        numberOfLines={1}
                        className="font-body-md text-on-surface-variant"
                        style={{ fontSize: 13 }}
                      >
                        {nextAppointment.doctor.specialty}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {/* The badge is now the booking's STORED mode, not a fixed
                    "Virtual". `BookingOut.mode` is a real column, so this can
                    say "In person" when that is what it is — the old literal
                    told every patient their visit was a video call. */}
                <View className="rounded-full bg-primary-container/20 px-sm py-xs">
                  <Text className="font-label-sm text-label-sm text-primary">
                    {nextAppointment.mode === "video" ? "Virtual" : "In person"}
                  </Text>
                </View>
              </View>
              <View className="gap-xs rounded-2xl bg-surface-container-low p-sm">
                <Text className="font-inter-semibold text-[13px] text-on-surface">
                  {formatWhen(nextAppointment.startsAtIso)}
                </Text>
                {/* Only a video visit gets the secure-link line. */}
                {nextAppointment.mode === "video" ? (
                  <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 12 }}>
                    Video call via MedApp Secure Link
                  </Text>
                ) : null}
              </View>
              {/* THREE states, which is what the data actually has — see
                  AppointmentManagementScreen's join control, whose reasoning
                  this mirrors so the two entry points cannot diverge.
                  `provision_room` never raises, so a video booking can 201 with
                  `room_id: null`; "video" and "has a room" are separate facts
                  and a button drawn from the first alone is a control with
                  nothing behind it.

                  The room handle travels as `sessionId`. It used to be the
                  APPOINTMENT id under that name, which the waiting room would
                  have resolved to no room at all. */}
              {nextAppointment.mode === "video" && nextAppointment.roomId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Join video call"
                  onPress={() =>
                    // No cast. The `as any` here was added when `waiting-room`
                    // was new and typedRoutes had not regenerated its union yet;
                    // it has, so the literal type-checks on its own and the
                    // suppression was suppressing nothing (eslint reported the
                    // disable directive itself as unused). Note it is not `as
                    // Href` either — `Href` admits the query-string forms, which
                    // an object route's `pathname` slot does not.
                    router.push({
                      pathname: "/(app)/waiting-room",
                      params: {
                        sessionId: nextAppointment.roomId,
                        appointmentId: nextAppointment.id,
                        viewerRole: "patient",
                        providerId: nextAppointment.doctorId,
                        providerName: doctorName(nextAppointment),
                        providerSpecialty: nextAppointment.doctor?.specialty ?? "",
                        startAt: nextAppointment.startsAtIso,
                      },
                    })
                  }
                  // The inline `style` callback is DELETED. It set
                  // `#00685f`/`#008378` — the light values of `primary` and
                  // `primary-container` — and an inline style beats a class, so
                  // it silently overrode this element's own `bg-primary` and
                  // pinned the button to light teal in dark mode while its
                  // `text-white` label stayed white. `active:opacity-90` is the
                  // pressed treatment instead: it needs no colour value at all,
                  // so there is nothing left to freeze.
                  className="w-full flex-row items-center justify-center gap-sm rounded-full bg-primary py-sm active:scale-95 active:opacity-90"
                >
                  {/* `text-on-primary`, not `text-white`. They are the same
                      value in light mode and opposites in dark, where
                      `on-primary` is #003731 — the dark ink this mint button
                      needs. */}
                  <Text className="font-inter-semibold text-[14px] text-on-primary">Join Call</Text>
                </Pressable>
              ) : nextAppointment.mode === "video" ? (
                /* Pending, stated in words rather than as a disabled button: a
                   greyed control tells the patient they are doing something
                   wrong, when the room simply is not ready and there is nothing
                   for them to do. */
                <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 12 }}>
                  The video room is not ready yet — check back closer to your appointment.
                </Text>
              ) : null}
            </Card>
          </Section>
        ) : null}
      </ScrollView>
    </PatientShell>
  );
}

// ---------------------------------------------------------------------------
// Local primitives. Promote to components/ui once a second screen needs them.
// ---------------------------------------------------------------------------

// `cardShadow` is deleted, not softened. It was a slate-grey `0 4px 20px`
// that existed in no token and no Figma effect, and both of its callers are
// now the shared `Card` — docs/BRAND.md §Elevation: cards cast no drop shadow,
// and separation is surface tone plus a hairline.

/**
 * `actionLabel` and `onAction` are ONE optional pair, not two independent
 * optionals, and the type is what enforces it.
 *
 * Quick Services passed `actionLabel="View All"` and no `onAction`, so this
 * component rendered `<Pressable onPress={undefined}>` — a primary-coloured
 * link with `accessibilityRole="button"`, a 6px hitSlop and `active:scale-95`
 * that had never done anything. Nothing failed, because the old signature said
 * a label without a handler was legal. It is now a compile error: supply both
 * or neither.
 */
type SectionAction =
  | { actionLabel: string; onAction: () => void }
  | { actionLabel?: never; onAction?: never };

function Section({
  title,
  children,
  ...action
}: { title: string; children: React.ReactNode } & SectionAction) {
  const { actionLabel, onAction } = action;
  return (
    <View className="mt-lg">
      <View className="mb-sm flex-row items-center justify-between px-xs">
        <Text className="font-headline-md text-on-surface-variant" style={{ fontSize: 18 }}>
          {title}
        </Text>
        {actionLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel} ${title}`}
            hitSlop={6}
            onPress={onAction}
            className="active:scale-95"
          >
            <Text className="font-label-md text-label-md text-primary">{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

type Tint = "primary" | "secondary" | "tertiary" | "neutral" | "error";

/**
 * `bg` is a class (NativeWind themes it for free); `fg` is a TOKEN NAME, not a
 * hex, because an icon's colour is a prop and NativeWind cannot drive it.
 *
 * The five `fg` values used to be literals, and every one of them was some
 * token's LIGHT value pinned in place — `#00685f` is `primary`, `#3d4947` is
 * `on-surface-variant`, `#ba1a1a` is `error`, `#3a485b` is
 * `on-secondary-fixed-variant`, `#0058be` is `tertiary`. Read as colours they
 * froze: a dark glyph stayed dark on a surface that had flipped dark underneath
 * it.
 *
 * Each is now resolved by NAME, and picked by ROLE rather than by matching the
 * old hex — which changes two of them on purpose. A glyph sitting on a
 * `*-container` surface takes that container's own content pair, so
 * `secondary-container` gets `on-secondary-container` (the literal was the
 * `*-fixed` family's content token, and `secondary-container` is the one that
 * flips, so that pairing was the freeze) and `tertiary-fixed` gets
 * `on-tertiary-fixed-variant`. `error-container` likewise gets
 * `on-error-container`, not `error`. Only `primary` is a raw accent, and
 * correctly so: `bg-primary/10` is a 10% wash over the page, not a container.
 *
 * No visual change ships from any of this today — all six tiles below are the
 * `primary` tint. The other four are corrected so the next caller inherits a
 * pair that works in both modes instead of the frozen one.
 */
const TINTS: Record<Tint, { bg: string; fg: ColorToken }> = {
  primary: { bg: "bg-primary/10", fg: "primary" },
  secondary: { bg: "bg-secondary-container", fg: "on-secondary-container" },
  tertiary: { bg: "bg-tertiary-fixed", fg: "on-tertiary-fixed-variant" },
  neutral: { bg: "bg-surface-container-high", fg: "on-surface-variant" },
  error: { bg: "bg-error-container", fg: "on-error-container" },
};

/**
 * A tile with a destination is a BUTTON. A tile without one is a picture of a
 * tile, and that difference is now structural rather than a matter of who
 * remembered to pass `onPress`.
 *
 * Four of the six tiles have no destination, and all six used to render the
 * same `<Pressable accessibilityRole="button" … active:scale-95>` regardless.
 * TalkBack announced "Pharmacy, button" and the tile depressed under the finger
 * for a tap that went nowhere — four false affordances in one 6-item strip,
 * which is worse than one because the strip as a whole then reads as broken
 * rather than as unfinished.
 *
 * The inert branch keeps the plate, the glyph, the label and the exact
 * geometry, and drops the three things that make a control a control: the
 * `Pressable`, the `button` role and the press animation. It is still
 * discoverable — the `<Text>` label is the accessible node, so a screen reader
 * reads "Pharmacy" as content, which is what it is.
 */
function QuickService({
  icon,
  label,
  tint,
  onPress,
}: {
  icon: ChromeIconName;
  label: string;
  tint: Tint;
  onPress?: () => void;
}) {
  const t = TINTS[tint];
  const glyph = useTokenColor(t.fg);
  // 56 = 24px glyph + 2 x 16 padding, both on the spacing scale. It is
  // UNCHANGED by the move to two rows: the plate was sized down from 64 when
  // five had to share one row, and the 3-up tile (104 at 360dp) has room for
  // either — keeping 56 keeps all six tiles identical to the five that shipped,
  // which is the point of wrapping instead of resizing. No `cardShadow` —
  // docs/BRAND.md, cards and plates cast no drop shadow.
  const body = (
    <>
      <View className={`h-14 w-14 items-center justify-center rounded-md ${t.bg}`}>
        {/* Decorative — the tile's own label is directly beneath it. */}
        <Icon chrome={icon} size={24} color={glyph} />
      </View>
      {/* label-sm 12, matching the frame. numberOfLines guards against a future
          longer label silently making one tile taller than its neighbours. */}
      <Text
        numberOfLines={1}
        className="text-center font-label-sm text-label-sm text-on-surface-variant"
      >
        {label}
      </Text>
    </>
  );

  // flex-1 so three tiles + two 8px gaps divide the column exactly, on whatever
  // width the device actually reports (see the strip note).
  if (!onPress) return <View className="flex-1 items-center gap-base">{body}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-1 items-center gap-base active:scale-95"
    >
      {body}
    </Pressable>
  );
}

/**
 * `sleep_minutes` -> "7h 20m", or "45m" under the hour.
 *
 * The wire unit is minutes and the row used to print a literal "7h 20m", so the
 * conversion is the one piece of arithmetic this row needs. It rounds rather
 * than truncating: a 439.6-minute night is 7h 20m, not 7h 19m.
 */
function formatSleep(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Daily Wellness row — icon + label left, metric value right. bg-white/60 +
// border-white matches the glass-card look ("Wellness Row" in the frame);
// no backdrop-blur (see translation-calls note at the top of this file).
function WellnessRow({
  icon,
  label,
  value,
}: {
  icon: ChromeIconName;
  label: string;
  value: string;
}) {
  // `#00685f` was `primary`'s light value used as a glyph colour — the same
  // freeze the TINTS table had. Resolved by name it steps with the mode.
  const accent = useTokenColor("primary");
  return (
    // `border-white bg-white/60` was a literal, so in dark mode these two rows
    // stayed light-grey pills while everything around them went dark — the one
    // unflippable surface left on this screen.
    <View className="flex-row items-center justify-between rounded-2xl border border-outline-variant/20 bg-surface-container-low p-sm">
      <View className="flex-row items-center gap-sm">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10">
          {/* Decorative — the row's label is immediately to its right. */}
          <Icon chrome={icon} size={18} color={accent} />
        </View>
        <Text className="font-inter-medium text-[14px] text-on-surface">{label}</Text>
      </View>
      <Text className="font-manrope-bold text-[14px] text-on-surface">{value}</Text>
    </View>
  );
}

// `InputTrigger` — the "Log Sleep" / "Log Activity" tiles — is DELETED.
//
// It was the purest form of the defect this pass exists to fix: the component
// took no `onPress` prop AT ALL, so the two tiles could not have been wired
// even by a caller who wanted to. They rendered
// `<Pressable accessibilityRole="button" … active:scale-95>` and were, by
// construction, incapable of doing anything.
//
// They are not wired instead of deleted because there is nothing to wire them
// to. `wearable_sync_service` ingests DEVICE samples — `POST /v1/wearables/sync`
// takes a `deviceId` and a batch of readings — and manual patient logging has no
// endpoint, no screen and no store anywhere in this product. A "Log Sleep" tile
// that opened a form would be inventing the feature, not connecting it.
//
// An earlier note here flagged this component as deliberately NOT migrated to
// the shared `SearchField` (it is a log tile, not a search entry point) and
// pointed at PatientDashboardScreen's `QuickActionTile` as a third copy of
// "glyph over caption in a tinted tile" wanting one extraction. That
// observation dies with both call sites: the dashboard is deleted (see
// docs/api/README.md) and these tiles are gone. Nothing is left to extract, and
// HomeScreen's listing as a `SearchField` adopter was only ever correct once a
// search row is genuinely added to this screen.
//
// Recorded in docs/api/README.md's gap register: manual sleep/activity logging
// needs a route on wearable_sync_service (or a new observations endpoint) before
// the affordance can return.
