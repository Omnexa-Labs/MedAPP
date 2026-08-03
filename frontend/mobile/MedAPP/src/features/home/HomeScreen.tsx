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
//   - AI hero card gets a "Why this? / Dismiss" trust row for medical-AI
//     consent/transparency expectations.
//   - Notification bell uses a small dot-style unread badge (no numeral —
//     unread counts aren't modeled yet; a dot communicates "has activity").
//   - Bell touch target bumped to 44x44 via hitSlop/padding (WCAG 4.1.2);
//     the frame's bell asset is a raw 26x40 icon graphic.
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
// decorative claim of unread activity with no data behind it. PatientAppBar
// renders a badge only for a real positive `unreadCount` (see its own FLAGGED
// note), so this screen now passes none and the label is plainly
// "Notifications". Re-wire `unreadCount` the moment a notifications store
// exists — the badge treatment is already built and tested.

import { useEffect } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
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
// The Upcoming Appointments card's provider — ONE object, not three literals
// ============================================================================
// This card used to disagree with itself. The face and the name line said
// "Dr. Sarah Chen"; the Join Call handler pushed `providerName: "Dr. Julian
// Sterling"` and `providerId: "julian-sterling"` into the waiting room. So the
// patient tapped a call with Sarah Chen and landed in a waiting room for Julian
// Sterling — two invented clinicians, one card, and a visible identity swap
// mid-journey.
//
// Neither name exists. scripts/seed_dev_data.py creates the doctors a tester
// actually sees in Find Care, and this is the "Virtual · Cardiologist" slot, so
// it is Dr. Adjoa Boateng — the seeded cardiologist whose bio is hypertension
// management and heart-failure follow-up, i.e. the one who runs a remote review
// clinic. `providerId` is her seed slug so the waiting room can resolve her once
// that screen reads real providers.
//
// Hoisted to a constant because the bug was structural: the card had no single
// source for the provider, so the two halves could drift without anything
// failing. They now cannot differ.
const NEXT_APPOINTMENT = {
  id: "appointment-next",
  providerId: "adjoa-boateng",
  providerName: "Dr. Adjoa Boateng",
  providerSpecialty: "Cardiologist",
  /** Derived by hand rather than sliced, so the honorific never becomes a letter. */
  initials: "AB",
} as const;

export function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";

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
                backgroundColor: "rgba(255,255,255,0.10)",
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
            <View className="h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              {/* Decorative — "Talk to MedAI" is the heading right below it.
                  Stays literal white to match its `text-white` text siblings on
                  this teal hero, which is the same value in both modes. */}
              <Icon chrome="auto-awesome" size={24} color="#ffffff" />
            </View>
            <Text className="font-headline-md text-headline-md text-white">Talk to MedAI</Text>
            <Text
              className="font-body-md text-white/90"
              style={{ fontSize: 15, lineHeight: 21, maxWidth: "80%" }}
            >
              “Your blood pressure readings look steady this week — great progress on your care
              plan.”
            </Text>
            {/* Trust row: "why this?" / dismiss affordance for medical-AI
                  transparency (approved deviation — not in the raw prototype). */}
            <View className="flex-row items-center gap-md">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Why this suggestion?"
                hitSlop={6}
              >
                <Text className="font-inter-medium text-[12px] text-white/85 underline">
                  Why this?
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss suggestion"
                hitSlop={6}
              >
                <Text className="font-inter-medium text-[12px] text-white/85">Dismiss</Text>
              </Pressable>
            </View>
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
              className="mt-sm w-fit flex-row items-center gap-sm self-start rounded-full bg-white px-md py-sm active:scale-95"
            >
              <Text className="font-inter-semibold text-[14px] text-primary">Ask MedAI</Text>
            </Pressable>
          </View>
        </View>

        {/* Quick Services */}
        <Section title="Quick Services" actionLabel="View All">
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
              {/* Pharmacy, Labs, Vitals and Records don't have shipped routes
                  yet — rendered as visual stubs (no onPress), matching the
                  existing "Smart Sync"/"Inbox" stub pattern above until those
                  features ship. */}
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

        {/* Health Insights */}
        <Section title="Your Health Insights">
          {/* Shared `Card`, not a hand-rolled bordered View. Geometry is
              unchanged — `rounded-card` and `p-md` are the same 24/24 this had
              — but the hairline goes full-strength `outline-variant` and the
              fill becomes `card-surface` instead of a literal `bg-white`.
              With the drop shadow deleted (docs/BRAND.md §Elevation) those two
              ARE the separation, and Card strips elevation keys structurally,
              so a blur cannot return through `style`. */}
          <Card className="flex-row gap-sm">
            {/* Insight image: flagged in the design brief as a content-type
                  asset (licensing owner undecided) — placeholder rendered as a
                  tinted icon tile rather than hardcoding a stock photo URL. */}
            <View
              className="h-20 w-20 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "#ffd999" }}
            >
              {/* Decorative — the insight's own title is beside it. The
                  `#ffd999` plate and `#ff9966` glyph stay literal: this whole
                  tile is the flagged stand-in for a licensed content image, and
                  neither value is a token or maps to one. It goes when the real
                  asset does. */}
              <Icon chrome="wb-sunny" size={32} color="#ff9966" />
            </View>
            <View className="flex-1 justify-center gap-xs">
              <View className="w-fit flex-row items-center gap-xs self-start rounded-full bg-primary-container/20 px-sm py-xs">
                <Text className="font-label-sm text-label-sm uppercase tracking-wider text-primary">
                  Mindfulness
                </Text>
              </View>
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 15 }}>
                Morning breathing improves your HRV
              </Text>
              <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 13 }}>
                5 minutes of deep breathing each morning is linked to better recovery scores.
              </Text>
            </View>
          </Card>
        </Section>

        {/* Daily Wellness */}
        <Section title="Daily Wellness">
          <View className="gap-sm">
            <WellnessRow icon="bedtime" label="Sleep" value="7h 20m" />
            <WellnessRow icon="directions-walk" label="Steps Today" value="6,240 / 8,000" />
            <View className="mt-xs flex-row gap-sm">
              <InputTrigger icon="bedtime" label="Log Sleep" />
              <InputTrigger icon="fitness-center" label="Log Activity" />
            </View>
          </View>
        </Section>

        {/* Upcoming Appointments */}
        <Section
          title="Upcoming Appointments"
          actionLabel="View All"
          onAction={() => router.push("/(app)/appointments" as Href)}
        >
          {/* Shared `Card` — same swap and same reasoning as the insight card
              above: identical 24 radius / 24 inset, full-strength hairline,
              `card-surface` fill, no drop shadow. */}
          <Card className="gap-sm">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-sm">
                <AvatarWithFallback
                  size={44}
                  initials={NEXT_APPOINTMENT.initials}
                  label={NEXT_APPOINTMENT.providerName}
                />
                <View>
                  <Text className="font-headline-md text-on-surface" style={{ fontSize: 15 }}>
                    {NEXT_APPOINTMENT.providerName}
                  </Text>
                  <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 13 }}>
                    {NEXT_APPOINTMENT.providerSpecialty}
                  </Text>
                </View>
              </View>
              <View className="rounded-full bg-primary-container/20 px-sm py-xs">
                <Text className="font-label-sm text-label-sm text-primary">Virtual</Text>
              </View>
            </View>
            <View className="gap-xs rounded-2xl bg-surface-container-low p-sm">
              <Text className="font-inter-semibold text-[13px] text-on-surface">
                Tomorrow, 10:30 AM
              </Text>
              <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 12 }}>
                Video call via MedApp Secure Link
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Join video call"
              onPress={() =>
                // Route was added in this iteration. Expo Router's typedRoutes
                // regenerates the union on next dev server start — cast bypasses
                // the strict pathname check until then.
                router.push({
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  pathname: "/(app)/waiting-room" as any,
                  params: {
                    sessionId: NEXT_APPOINTMENT.id,
                    viewerRole: "patient",
                    providerId: NEXT_APPOINTMENT.providerId,
                    providerName: NEXT_APPOINTMENT.providerName,
                    providerSpecialty: NEXT_APPOINTMENT.providerSpecialty,
                    appointmentId: NEXT_APPOINTMENT.id,
                  },
                })
              }
              className="w-full flex-row items-center justify-center gap-sm rounded-full bg-primary py-sm active:scale-95"
              // Shadow deleted: an in-card CTA is not a floating surface. The
              // removed style was a literal `#00685f` at 25% over a 12px blur —
              // a coloured glow, off-token and three times the ≤8% ceiling
              // docs/BRAND.md allows even for things that DO float. The pressed
              // background literals below are pre-existing and out of scope for
              // this pass (listed in the report).
              style={({ pressed }) => ({
                backgroundColor: pressed ? "#008378" : "#00685f",
              })}
            >
              <Text className="font-inter-semibold text-[14px] text-white">Join Call</Text>
            </Pressable>
          </Card>
        </Section>
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

function Section({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      // flex-1 so three tiles + two 8px gaps divide the column exactly, on
      // whatever width the device actually reports (see the strip note).
      className="flex-1 items-center gap-base active:scale-95"
    >
      {/* 56 = 24px glyph + 2 x 16 padding, both on the spacing scale. It is
          UNCHANGED by the move to two rows: the plate was sized down from 64
          when five had to share one row, and the 3-up tile (104 at 360dp) has
          room for either — keeping 56 keeps all six tiles identical to the five
          that shipped, which is the point of wrapping instead of resizing. No
          `cardShadow` — docs/BRAND.md, cards and plates cast no drop shadow. */}
      <View className={`h-14 w-14 items-center justify-center rounded-md ${t.bg}`}>
        {/* Decorative — the tile's own label is directly beneath it, and the
            Pressable already carries that label for assistive tech. */}
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
    </Pressable>
  );
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
    <View className="flex-row items-center justify-between rounded-2xl border border-white bg-white/60 p-sm">
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

// FLAGGED — deliberately NOT migrated to the shared `SearchField`, against the
// extraction plan, which listed HomeScreen as a SearchField adopter and named
// this component as the thing it "absorbs".
//
// Despite the name, `InputTrigger` is not a field or a search entry point: it is
// a quick-log ACTION TILE ("Log Sleep", "Log Activity") — a 28px glyph stacked
// over a `label-md` caption in a `rounded-2xl` `bg-surface-container-low` box,
// two-up in a row. SearchField is a 52pt horizontal row with a leading search
// glyph and a clear button; the two share no geometry, no slot order and no
// purpose. Migrating it would make the dashboard render two search bars where
// the design has two log buttons.
//
// HomeScreen has NO search row today, so its listing as an adopter is only
// correct once a search entry point is actually added to the dashboard. When it
// is, `SearchField` with `editable={false}` + `onPress` is the right shape for it
// (that trigger mode is already built and tested) — but it is an ADDITION to this
// screen, not a replacement for this tile.
//
// What this tile actually wants is its own primitive: it is the third copy of
// "glyph over caption in a tinted tile" in the app (see also
// PatientDashboardScreen's `QuickActionTile`, Figma 211:252). That is a separate
// extraction, not this one.
//
// Its `#00685f` glyph IS fixed here, against that earlier "leave it as legacy"
// note, because the icon-gate pass had to rewrite this exact call site anyway —
// an icon's colour is a prop, so routing the glyph through `<Icon />` means
// touching the literal either way, and re-typing a frozen light-mode hex into
// the new call would have been a choice rather than an omission.
function InputTrigger({ icon, label }: { icon: ChromeIconName; label: string }) {
  const accent = useTokenColor("primary");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center justify-center gap-sm rounded-2xl border border-outline-variant/20 bg-surface-container-low py-md active:scale-95"
    >
      {/* Decorative — the caption below it is the tile's name. */}
      <Icon chrome={icon} size={28} color={accent} />
      <Text className="font-label-md text-label-md text-on-surface-variant">{label}</Text>
    </Pressable>
  );
}
