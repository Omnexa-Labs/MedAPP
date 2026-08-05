// Patient Profile Overview — "Patient Profile Overview"
// (Figma file kRifcg1KCEAlTXy4aimotK, page "Patient Home", frame 261:387).
// The old header here cited frame 126:232, which is superseded — 261:387 is the
// approved frame and the one this file is now verified against.
//
// Reached from the BottomNav "Profile"-ish slot — the shared BottomNav's
// 5 tabs are Home/Overview/Inbox/Community/Lifestyle and don't include a
// dedicated "Profile" tab yet (see FLAGGED note below), so this screen is
// reachable today via direct push (e.g. from the header avatar) rather than
// a bottom-tab destination, same pattern as PatientDashboardScreen.
//
// ============================================================================
// SHELL MIGRATION (2026-07-30) — this screen GAINED an app bar
// ============================================================================
// Unlike the other screens in this migration wave, there was no hand-rolled bar
// here to delete: the note below said "no mobile app-bar/logo per the design
// brief … omitted entirely". That is now stale. The approved frame is
// **261:387 "Patient Profile Overview"** and its FIRST child is an instance of
// the component "Patient AppBar (Avatar + Logo + Bell)" (261:388 → 101:142),
// with the screen's own content in a sibling "Body" frame (261:403) offset by
// exactly the bar's 64px. So the bar is real, native, and required — the
// desktop-only `hidden md:block` header the old note referred to belonged to
// the superseded prototype, not to this frame. Adopting <PatientShell> adds it.
//
// ============================================================================
// THE DEAD END IS FIXED (2026-08-01) — this screen now shows BACK
// ============================================================================
// The note that used to sit here read: "the patient app bar has no back
// affordance (BRAND forbids displacing the left-hand logo, and no
// `Patient AppBar (Back + …)` variant exists yet)". That variant now exists —
// `Patient AppBar` is a component SET, 741:887, with `Back=Hidden | Shown`, and
// `Back=Shown` shifts the logo right rather than centring it, so BRAND's "Do not
// centre the logo" is intact. The RN side is `hideBack={false}` below.
//
// This screen was the reason the variant was commissioned: frame 261:387 is not
// one of the five tabs, so it correctly has no bottom nav, and with no back
// affordance a patient who landed here could only leave by the OS gesture.
//
// ============================================================================
// RULED, AND THE FRAME WAS RIGHT (2026-08-05) — DetailShell, no bottom nav
// ============================================================================
// The FLAG that stood here asked for a one-line ruling: "is Patient Profile
// Overview a detail screen (drop the nav, keep back) or a nav-bearing
// destination (add a bottom-nav instance to 261:387)?" It is a DETAIL SCREEN.
//
// The ruling is the one made for `appointment_management` (PO 2026-08-01) and
// since applied to `find-care` and `patient-dashboard` — docs/PIPELINE.md §5. The
// reasoning that decided it is not new: this screen was rendering
// `activeTab="home"` while not being Home, and `Patient BottomTabBar` 740:1015
// ships exactly five values with no way to name a sixth. The bar could only
// render a lie.
//
// So frame 261:387 was right all along about the nav — its Body runs the full
// 2214px with no tab bar — and this file's own flag correctly refused to act on
// that unilaterally. Recording that, because the flag did its job: it named the
// decision, named the owner, and kept the exit working in the meantime rather
// than being right at the user's expense.
//
// The one thing that changes with it: the nav's "home" tab was a live exit, so it
// is not removed on the same commit that adds an exit — `DetailShell` carries the
// back button (this screen already had `hideBack={false}` for it), and both are
// present in this diff.
//
// The AVATAR goes too, and it is the one loss worth naming: `Detail AppBar
// 193:120` has no avatar slot ("No logo — the logo belongs only on tab-root
// screens" applies to the whole tab-root lockup). It is no loss in function here
// — the avatar was already deliberately non-pressable on this screen, because
// this IS the profile — and the 128px patient avatar in the body is the real one.
//
// Translation calls:
//   - Card containers → shared `Card` (components/ui/Card.tsx), `flat`
//     variant isn't used since every card here wants the ambient shadow.
//   - Share Records / Edit Profile / Book Appointment → shared `Button`.
//     Figma's "Button/Secondary" here is actually a *tonal* teal chip
//     (bg `primary-container` #008378, on-surface text) which doesn't match
//     any existing Button variant 1:1 (existing `secondary` is the light-blue
//     secondary-container token). Flagged deviation: reused the existing
//     `secondary` variant rather than inventing a one-off "tonal-primary"
//     variant for a single screen — closest feasible equivalent per the
//     "closest feasible equivalent, flag it" instruction. Revisit if a second
//     screen needs this exact tonal-teal treatment (extract then).
//   - "Verified" badge → shared `Badge` (tone="success" maps to the
//     success-container/success tokens the frame uses; existing Badge tones
//     are primary/success/info/error/neutral — success already matches the
//     frame's #d7f0dd/#0b8043 pair almost exactly, no new tone needed).
//   - Avatar (128px patient, 48px doctor) → `AvatarWithFallback`, initials
//     fallback (no photo asset per design brief §4).
//   - Camera-edit FAB → 44x44dp Pressable (frame's asset was 44px already,
//     meets the touch-target note carried over from the design brief).
//   - New primitives `StatTile` and `IconInfoRow` per the design brief's
//     component-mapping table — kept local to this screen for now (house
//     rule: promote to components/ui once a second screen repeats them).
//   - Emergency-contact tinted panel composed inline from View + tokens,
//     not a new primitive, per the design brief.
//
// States: this pass ships the happy path only (populated profile, PCP
// assigned, emergency contact present, verified email). Loading/skeleton,
// empty-PCP, empty-emergency-contact, error/offline, unverified-email, and
// avatar-upload-in-progress/error states are called out in the design brief
// §5 but not built here — flagged as follow-up, not silently dropped.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here. None beyond expo-router; expo-status-bar moved into the
// shell along with the safe-area handling.

import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { AvatarWithFallback, Badge, Button, Card } from "@/components/ui";
import { DetailShell } from "@/components/shell";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTokenColor } from "@/lib/tokens";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// ---------------------------------------------------------------------------
// Static design data. Mirrors the Figma frame verbatim so design review
// matches 1:1. Swap to real patient-record data once this screen is wired
// to the patient/EHR service.
// ---------------------------------------------------------------------------

interface Stat {
  label: string;
  value: string;
}

const STATS: Stat[] = [
  { label: "Age", value: "34 yrs" },
  { label: "Blood", value: "O+" },
  { label: "Weight", value: "72 kg" },
];

const PATIENT = {
  name: "Jordan Davis",
  patientId: "MED-208471",
  initials: "JD",
  dob: "March 14, 1991",
  sex: "Male",
  email: "jordan.davis@email.com",
  emailVerified: true,
  phone: "+1 (555) 219-3847",
  address: "482 Maple Grove Lane, Austin, TX 73301",
};

const PRIMARY_CARE_PROVIDER = {
  name: "Dr. Sarah Chen",
  specialty: "Family Medicine",
  initials: "SC",
};

const EMERGENCY_CONTACT = {
  name: "Maria Davis",
  relationship: "Spouse",
  phone: "+1 (555) 738-2910",
};

const TREND_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Normalised 0-1 series so the sparkline reads the same shape regardless of the
// real unit scale (steps vs. bpm). Swap for vitals-service data once wired.
const STEPS_SERIES = [0.4, 0.55, 0.5, 0.7, 0.65, 0.85, 0.8];
const HEART_RATE_SERIES = [0.5, 0.45, 0.6, 0.5, 0.55, 0.4, 0.45];

export function PatientProfileOverviewScreen() {
  const user = useCurrentUser();
  const displayName = user?.displayName ?? PATIENT.name;
  // react-native-svg needs real colour strings, and RN has no `currentColor`,
  // so these resolve from the token table for the active mode rather than the
  // hardcoded hexes the merged-in screen used.
  const onSurface = useTokenColor("on-surface");
  const primary = useTokenColor("primary");
  // The camera FAB's glyph sits ON the `primary` fill, so it takes `primary`'s
  // pair, not a literal white: in dark mode `primary` is #6BD8CB and a white
  // glyph on it measures ~1.5:1. `on-primary` is #003731 there.
  const onPrimary = useTokenColor("on-primary");
  const errorColor = useTokenColor("error");
  const outlineVariant = useTokenColor("outline-variant");

  return (
    /* DetailShell owns the safe area, the StatusBar and the bar (Figma 193:120).
       See the RULED note at the top of the file — this is the detail-screen
       chrome frame 261:387 has drawn all along.

       No `onBack`. The one inbound path is the account menu, which reaches this
       screen with `router.navigate` — that pushes when the route is not already in
       history, so `router.back()` returns the user to the tab root they opened the
       menu from. On a cold link with no history DetailAppBar's default no-ops
       rather than throwing, and a fallback href is deliberately not invented here:
       every tab root can reach this screen, so there is no single "up".

       `claimsBottomInset` at its default — nothing is pinned to the bottom edge,
       and the nav that used to occupy the inset is gone. */
    <DetailShell title="Profile">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          // 32, not the 140 that cleared the bottom nav. With the nav gone and
          // the shell claiming the inset, 140 is ~170px of dead space.
          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="gap-xs">
          <Text className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            Patient Profile
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            Manage your personal and health information
          </Text>
        </View>
        <View className="mt-sm flex-row gap-sm">
          <Button
            label="Share Records"
            variant="secondary"
            pill
            className="flex-1"
            onPress={() => {
              // Share flow isn't spec'd yet (design brief §7 flags Edit
              // Profile as out of scope; Share Records has no destination
              // either) — no-op stub until a real flow exists.
            }}
          />
          <Button
            label="Edit Profile"
            variant="primary"
            pill
            className="flex-1"
            onPress={() => {
              // FLAGGED (design brief §7): no spec yet for Edit Profile
              // (modal vs. new screen) — left as a no-op stub.
            }}
          />
        </View>

        {/* Profile Card */}
        <Card className="mt-md items-center gap-md">
          <View style={{ width: 128, height: 128, position: "relative" }}>
            <AvatarWithFallback
              size={128}
              initials={PATIENT.initials}
              label={displayName}
              uri={user?.avatarUrl}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              hitSlop={4}
              className="absolute items-center justify-center rounded-full border-2 border-surface bg-primary active:scale-95"
              style={{ width: 44, height: 44, right: -6, bottom: -6 }}
            >
              <MaterialIcons name="photo-camera" size={18} color={onPrimary} />
            </Pressable>
          </View>

          <View className="items-center gap-1">
            <Text className="font-headline-md text-on-surface" style={{ fontSize: 20 }}>
              {displayName}
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Patient ID: {PATIENT.patientId}
            </Text>
          </View>

          {/* Stat strip */}
          <View className="w-full flex-row gap-sm">
            {STATS.map((s) => (
              <StatTile key={s.label} stat={s} />
            ))}
          </View>

          <View className="h-px w-full bg-outline-variant/50" />

          <View className="w-full gap-sm">
            <IconInfoRow icon="calendar-today" label="Date of Birth" value={PATIENT.dob} />
            <IconInfoRow icon="male" label="Sex" value={PATIENT.sex} />
          </View>
        </Card>

        {/* Personal Information Card */}
        <Card className="mt-md gap-md">
          <View className="flex-row items-center gap-sm">
            <MaterialIcons name="person" size={20} color={onSurface} />
            <Text className="flex-1 font-headline-md text-on-surface" style={{ fontSize: 20 }}>
              Personal Information
            </Text>
          </View>

          <View className="gap-md">
            <View className="gap-1">
              <Text className="font-label-sm text-label-sm text-on-surface-variant">Email</Text>
              <View className="flex-row items-center gap-sm">
                <Text className="font-body-md text-body-md text-on-surface">{PATIENT.email}</Text>
                {PATIENT.emailVerified ? <Badge label="Verified" tone="success" /> : null}
              </View>
            </View>
            <View className="gap-1">
              <Text className="font-label-sm text-label-sm text-on-surface-variant">Phone</Text>
              <Text className="font-body-md text-body-md text-on-surface">{PATIENT.phone}</Text>
            </View>
            <View className="gap-1">
              <Text className="font-label-sm text-label-sm text-on-surface-variant">Address</Text>
              <Text className="font-body-md text-body-md text-on-surface">{PATIENT.address}</Text>
            </View>
          </View>
        </Card>

        {/* Health Trends Card — folded in from the former
              `patient_profile_with_trends` screen, which was a near-duplicate of
              this one. Product owner merged the two (2026-07-29); the standalone
              screen and its route are gone and Figma frame 261:387 now carries
              this section between Health Records and Primary Care. */}
        <Card className="mt-md gap-md">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-sm">
              <MaterialIcons name="show-chart" size={20} color={onSurface} />
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 20 }}>
                Health Trends
              </Text>
            </View>
            <View className="flex-row items-center gap-md">
              <LegendDot color={primary} label="Steps" />
              <LegendDot color={errorColor} label="Heart Rate" />
            </View>
          </View>

          <HealthTrendChart
            days={TREND_DAYS}
            steps={STEPS_SERIES}
            heartRate={HEART_RATE_SERIES}
            stepsColor={primary}
            heartRateColor={errorColor}
            axisColor={outlineVariant}
          />

          {/* Sits on a primary tint, so the text uses the primary ramp rather
                than a literal — this is the pairing that broke in dark mode. */}
          <View className="flex-row items-start gap-sm rounded-xl bg-primary/10 p-sm">
            <MaterialIcons name="bolt" size={18} color={primary} />
            <Text className="flex-1 font-body-md text-body-md text-on-surface">
              You&apos;ve been{" "}
              <Text className="font-inter-semibold text-primary">15% more active</Text> this week
              compared to last week.
            </Text>
          </View>
        </Card>

        {/* Primary Care Card */}
        <Card className="mt-md gap-md">
          <View className="flex-row items-center gap-sm">
            <MaterialIcons name="medical-services" size={20} color={onSurface} />
            <Text className="flex-1 font-headline-md text-on-surface" style={{ fontSize: 20 }}>
              Primary Care
            </Text>
          </View>

          <View className="w-full flex-row items-center gap-md rounded-2xl bg-background p-md">
            <AvatarWithFallback
              size={48}
              initials={PRIMARY_CARE_PROVIDER.initials}
              label={PRIMARY_CARE_PROVIDER.name}
            />
            <View className="flex-1 gap-1">
              <Text className="font-body-md text-body-md text-on-surface">
                {PRIMARY_CARE_PROVIDER.name}
              </Text>
              <Text className="font-label-sm text-label-sm text-on-surface-variant">
                {PRIMARY_CARE_PROVIDER.specialty}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Book appointment"
            hitSlop={6}
            // Was `push("/(app)/select-time-slot")` with NO params. SelectTimeSlot
            // resolves its grid from `params.practitionerId` (see useSlots there),
            // and PRIMARY_CARE_PROVIDER above is seed data with no id — so this
            // CTA reliably landed on the empty/no-slots state, which is the
            // "route exists but does not work" defect this round is about.
            // Routed to the directory instead: pick a provider, THEN a slot, which
            // is the order select-time-slot's own params require.
            onPress={() => router.push("/(app)/find-care" as Href)}
            className="flex-row items-center gap-xs active:opacity-70"
          >
            <MaterialIcons name="calendar-today" size={18} color={primary} />
            <Text className="font-label-md text-label-md text-primary">Book Appointment</Text>
          </Pressable>
        </Card>

        {/* Emergency Contact Card */}
        <Card className="mt-md gap-md">
          <View className="flex-row items-center gap-sm">
            <MaterialIcons name="warning" size={20} color={errorColor} />
            <Text className="flex-1 font-headline-md text-on-surface" style={{ fontSize: 20 }}>
              Emergency Contact
            </Text>
          </View>

          <View className="w-full gap-xs rounded-2xl border border-error-container/50 bg-error-container/20 p-md">
            <Text className="font-body-md text-body-md text-on-surface">
              {EMERGENCY_CONTACT.name}
            </Text>
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              {EMERGENCY_CONTACT.relationship}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${EMERGENCY_CONTACT.name}`}
              hitSlop={6}
              onPress={() =>
                Linking.openURL(`tel:${EMERGENCY_CONTACT.phone.replace(/[^\d+]/g, "")}`)
              }
              className="mt-xs flex-row items-center gap-xs active:opacity-70"
            >
              <MaterialIcons name="phone" size={16} color={errorColor} />
              <Text className="font-body-md text-body-md text-error">
                {EMERGENCY_CONTACT.phone}
              </Text>
            </Pressable>
          </View>
        </Card>
      </ScrollView>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Pieces — new per the design brief's component-mapping table (§2).
// Promote to components/ui once a second screen needs them.
// ---------------------------------------------------------------------------

function StatTile({ stat }: { stat: Stat }) {
  return (
    <View className="flex-1 items-center gap-1 rounded-xl bg-background px-sm py-md">
      <Text className="font-label-md text-label-md text-on-surface">{stat.value}</Text>
      <Text className="font-label-sm text-label-sm text-on-surface-variant">{stat.label}</Text>
    </View>
  );
}

function IconInfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  // Secondary glyph on the neutral `background` plate — `on-surface-variant`,
  // the same token the row's label text already uses. The literal it replaces
  // (`#3d4947`) IS that token's light value, so light mode is unchanged and dark
  // mode gets #BCC9C6 instead of near-black on a near-black plate.
  const glyph = useTokenColor("on-surface-variant");
  return (
    <View className="w-full flex-row items-center gap-md">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-background">
        <MaterialIcons name={icon} size={18} color={glyph} />
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-label-sm text-label-sm text-on-surface-variant">{label}</Text>
        <Text className="font-body-md text-body-md text-on-surface">{value}</Text>
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text className="font-label-sm text-label-sm text-on-surface-variant">{label}</Text>
    </View>
  );
}

// HealthTrendChart — dual-line sparkline (Steps / Heart Rate) + day labels.
//
// Carried over from the merged `patient_profile_with_trends` screen. The Stitch
// prototype embedded a raw web <svg> path lifted from a browser chart library;
// RN can't render that path syntax with the same fidelity across platforms, so
// this re-derives the same visual (two polylines over a fixed-height plot area,
// no axes or gridlines) with react-native-svg primitives.
//
// Colours are passed in as resolved token values — the original hardcoded
// #00685f / #ba1a1a / #bcc9c6, which silently broke dark mode.
function HealthTrendChart({
  days,
  steps,
  heartRate,
  stepsColor,
  heartRateColor,
  axisColor,
}: {
  days: string[];
  steps: number[];
  heartRate: number[];
  stepsColor: string;
  heartRateColor: string;
  axisColor: string;
}) {
  const width = 311; // card inner content width at p-md on a 393px frame
  const height = 160;
  const paddingX = 8;
  const paddingY = 12;

  const toPoints = (series: number[]) =>
    series.map((v, i) => ({
      x: paddingX + (i / (series.length - 1)) * (width - paddingX * 2),
      y: paddingY + (1 - v) * (height - paddingY * 2),
    }));

  const toPath = (points: { x: number; y: number }[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const stepsPoints = toPoints(steps);
  const heartPoints = toPoints(heartRate);

  return (
    <View className="w-full" style={{ height }}>
      {/* Decorative: the series are labelled by the legend and the day axis. */}
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Line
          x1={paddingX}
          y1={height - paddingY}
          x2={width - paddingX}
          y2={height - paddingY}
          stroke={axisColor}
          strokeWidth={1}
        />
        <Path d={toPath(stepsPoints)} stroke={stepsColor} strokeWidth={2.5} fill="none" />
        <Path d={toPath(heartPoints)} stroke={heartRateColor} strokeWidth={2.5} fill="none" />
        {stepsPoints.map((p, i) => (
          <Circle key={`s-${i}`} cx={p.x} cy={p.y} r={3} fill={stepsColor} />
        ))}
        {heartPoints.map((p, i) => (
          <Circle key={`h-${i}`} cx={p.x} cy={p.y} r={3} fill={heartRateColor} />
        ))}
      </Svg>
      <View className="mt-1 flex-row justify-between px-2">
        {days.map((d) => (
          <Text key={d} className="font-label-sm text-label-sm text-on-surface-variant">
            {d}
          </Text>
        ))}
      </View>
    </View>
  );
}
