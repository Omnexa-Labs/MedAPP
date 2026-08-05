// Patient Dashboard — "Patient Dashboard" frame (Figma file kRifcg1KCEAlTXy4aimotK,
// page "Patient Home", node 110:244). FINAL DESIGN REVIEW passed for this node
// (see PR description / task brief) confirming no collisions, real AppBar/
// BottomNav instances, a genuine image logo, and correct error-tone treatment
// on the out-of-range vital.
//
// ============================================================================
// FLAGGED — IA conflict, not resolved unilaterally (per design brief §"Open
// question" and §7 Ambiguities):
//
// This frame's content (greeting, single appointment card, vitals snapshot,
// quick actions, health tip, shared documents) duplicates the shipped
// HomeScreen.tsx (Home tab) in *purpose*, and the shipped BottomNav's
// "Overview" tab already routes to a *different*, already-built screen
// (OverviewScreen.tsx — a "Health Overview Hub" with trend charts, clinical
// milestones, device sync and active scripts). Wiring this new frame into the
// existing "overview" tab slot would silently replace/orphan that shipped
// screen, which the brief explicitly says not to decide unilaterally.
//
// Decision made for this pass: build the frame faithfully as a standalone
// screen + route (NOT registered on any BottomNav tab) so it's reviewable
// without clobbering either existing screen. Final IA placement (replace
// Home? replace Overview? new tab? discard?) needs a PM/lead call — see the
// route file's header comment for the same flag.
// ============================================================================
//
// Translation notes (same conventions as HomeScreen/OverviewScreen):
//   - Figma's raw <img> avatar/bell/icon PNGs → AvatarWithFallback + real
//     MaterialIcons glyphs (brief §4: real assets only, no placeholder icons
//     redrawn as flat shapes).
//   - Logo (PNG) node → shared <Logo variant="wordmark" /> primitive.
//   - "Above target range" Blood Pressure card → error/error-container tone
//     tokens (brief §5 abnormal-vital state), not a new hex value.
//   - FAB "+" glyph → MaterialIcons "add" inside a primary-filled circle
//     (no bespoke FAB asset shipped; brief doesn't specify FAB action, see
//     flag below).
//   - "Join Call" is always-rendered here (no join-window data modeled yet);
//     brief §6 asks for hide/disable outside the join window — flagged
//     rather than faked with arbitrary time logic.
//
// Other flags (brief §7, unresolved — do not silently guess):
//   - FAB action/label is undefined in the brief. Rendered as a disabled-look
//     visual affordance (no onPress) rather than inventing a destination.
//   - No pull-to-refresh spec confirmed with eng — omitted.
//   - No local empty-state illustration assets exist; only the default/
//     populated and abnormal-vital states are implemented per available
//     assets. Loading/empty/error/multi-appointment states are flagged as
//     follow-up work, not fabricated.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* APIs
// here. None needed beyond expo-router; expo-status-bar moved into the shell.
//
// ============================================================================
// SHELL MIGRATION (2026-07-30) — the inline app bar is gone
// ============================================================================
// Verified against Figma 110:244, which contains an instance of the component
// "Patient AppBar (Avatar + Logo + Bell)" (110:245 → 101:142) and one of
// "Patient BottomTabBar" (110:258 → 101:143). Both are component instances in
// the frame, so the chrome is not this screen's to draw: it now renders
// <PatientShell> (docs/BRAND.md §App shell).
//
// Removed with the bar: the `<Logo variant="wordmark" height={28} />` +
// AvatarWithFallback + bell lockup, its literal `color="#ffffff"` glyph, its
// `bg-on-surface-variant` filled bell container (forbidden by docs/BRAND.md —
// "Never use a raw white/black fill on an icon container"), its
// `border-2 border-primary/20` avatar ring, and `StatusBar style="dark"` (a
// frozen light-mode value; the shell resolves it from the active scheme).
//
// RESOLVED (was FLAGGED): the bottom nav here used to have no `onTabPress`, so
// all five tabs were inert on this screen. That is fixed — not by inventing
// routes for this screen, which would still pre-empt the unresolved IA question
// above, but by PatientShell owning ONE tab map for every patient screen. The
// tabs now go exactly where they go from Home, Overview, Community and
// Lifestyle. This screen adds only `isTabRoot={false}`, which is a statement
// about this screen ("I am not the Home tab"), not a routing decision.
// `activeTab="home"` is not a new claim either: `<BottomNav />` already
// defaulted `active` to "home", so Home was already the highlighted tab
// despite the old comment here saying otherwise. Rendering is byte-identical;
// the comment was the thing that was wrong.
//
// ============================================================================
// RE-MIGRATION (2026-08-05) — tab-root chrome OUT, DetailShell IN
// ============================================================================
// Third screen to take the ruling made for `appointment_management` and applied
// to `find-care` (docs/PIPELINE.md §5, PO 2026-08-01). A screen that is not one
// of the five patient tabs cannot wear the tab bar, because the bar can only
// render a lie — and this screen is the clearest case of all three: the IA flag
// at the top of this file says outright that it is "NOT registered on any
// BottomNav tab". It was highlighting Home while being, by its own header, a
// parallel cut of Home.
//
// `Detail AppBar 193:120`: "No logo — the logo belongs only on tab-root screens."
// That takes the `<Logo>` out of the bar and the avatar with it.
//
// The paragraph above is superseded on the tabs specifically. It still records
// something true and worth keeping: five inert tabs were a real defect and the
// shared tab map was the right fix for the ten screens that legitimately show
// the bar. This screen simply is not one of them.
//
// **FLAGGED — this screen has NO INBOUND LINK, so `router.back()` alone would be
// a dead control.** A route audit finds exactly one reference to
// `/(app)/patient-dashboard` in `src/`: the gitignored preview harness
// `app/(public)/zpdb.tsx`. Nothing in the product pushes it, by design — the IA
// question above was never answered. DetailAppBar's default back no-ops when
// there is no history, which on the app's only real path here (a cold deep link)
// means a visible chevron that does nothing. So this screen supplies its own
// `onBack` with a Home fallback. That is a mitigation, not a resolution: the
// screen still needs the IA call — replace Home, replace Overview, become a tab,
// or be deleted. Until then it is a reviewable orphan with honest chrome.

import { Pressable, ScrollView, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuthStore } from "@/store/auth-store";
import { DetailShell } from "@/components/shell";
import { useTokenShadow } from "@/lib/tokens";
import {
  Badge,
  Button,
  Card,
  VitalStatCard,
  type HealthIconName,
  type VitalStatTone,
  type VitalStatTrend,
} from "@/components/ui";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

/**
 * Re-typed onto the SHARED VitalStatCard's vocabulary (Figma 211:241). Three
 * things changed shape, and each removes a per-screen invention:
 *
 *   icon       was a MaterialIcons name ("favorite" for a heart rate,
 *              "bloodtype" for blood pressure, "air" for SpO2 — the generic
 *              platform set standing in for clinical concepts). Now a
 *              `HealthIconName`, i.e. Health Icons, which docs/BRAND.md makes
 *              the project's set for "anything clinical or domain-specific" and
 *              which has real `heart-rate` / `blood-pressure` /
 *              `oxygen-saturation` glyphs. "A heart under Community is a bug,
 *              not a style choice" — and "air" under SpO2 was the same bug.
 *   trend      was a free string PLUS a hand-picked arrow glyph, so nothing
 *              stopped the words and the arrow disagreeing. Now a
 *              `VitalStatTrend` direction (the component owns the glyph table)
 *              plus the words.
 *   abnormal   was a boolean that the local card turned into a `#ba1a1a` tint.
 *              Now `tone`, which selects a token PAIR inside the component, so
 *              no colour can enter through this screen at all.
 */
interface Vital {
  label: string;
  icon: HealthIconName;
  value: string;
  unit: string;
  trend?: VitalStatTrend;
  trendLabel?: string;
  tone?: VitalStatTone;
  abnormalLabel?: string;
}

const VITALS: Vital[] = [
  {
    label: "Heart Rate",
    icon: "heart-rate",
    value: "72",
    unit: "bpm",
    trend: "down",
    trendLabel: "2% vs last week",
  },
  {
    label: "Blood Pressure",
    icon: "blood-pressure",
    value: "138/90",
    unit: "mmHg",
    tone: "abnormal",
    // The out-of-range wording moves from `trend` to `abnormalLabel`, where the
    // shared component guarantees it is rendered with a glyph and can never be
    // emptied — BRAND's "never use colour as the only signal for clinical
    // meaning" is then structural rather than this screen's good intentions.
    // The old row said the same thing once, in red, as its trend line; it is
    // not duplicated as a trend here.
    abnormalLabel: "Above your target range",
  },
  {
    label: "SpO2",
    icon: "oxygen-saturation",
    value: "98",
    unit: "%",
    trend: "flat",
    trendLabel: "Stable",
  },
];

interface ActivityEntry {
  label: string;
  timestamp: string;
}

const ACTIVITY: ActivityEntry[] = [
  { label: "Logged blood pressure reading", timestamp: "9:02 AM" },
  { label: "Completed medication reminder", timestamp: "Yesterday" },
  { label: "Uploaded lab results PDF", timestamp: "Mon" },
];

interface QuickAction {
  label: string;
  icon: IconName;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Book Visit", icon: "event" },
  { label: "Message Doctor", icon: "chat-bubble" },
  { label: "Refill Rx", icon: "medication" },
  { label: "View Records", icon: "description" },
];

interface SharedDocument {
  name: string;
  meta: string;
}

const DOCUMENTS: SharedDocument[] = [
  { name: "Lab_Results_July.pdf", meta: "Shared by Dr. Chen · 1.2 MB" },
  { name: "Vaccination_Record.pdf", meta: "Shared by You · 340 KB" },
];

export function PatientDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";

  // The ONE surface on this screen that genuinely floats: an absolutely
  // positioned FAB sitting over scrolling content, which docs/BRAND.md
  // §Elevation names as a role distinct from a card and allows a tight pair at
  // ≤8%, tinted with the `shadow` token. RN renders a single shadow, so this is
  // the outer `0 2px 6px` of the sanctioned pair. It replaces a literal
  // `#00685f` at 30% — a frozen light-mode teal that was both off-token and far
  // over the opacity ceiling.
  const fabShadow = useTokenShadow("shadow", { y: 2, blur: 6, opacity: 0.08 });

  return (
    /* DetailShell owns the safe area, the StatusBar and the bar (Figma 193:120).
       See the RE-MIGRATION note at the top of the file: the tab bar and the logo
       are both out, because this screen is on no tab.

       `onBack` is supplied rather than left to DetailAppBar's default, and the
       FLAG above is the reason: nothing in the product pushes this route, so on
       the only path that reaches it there is no history to pop and the default
       would render a chevron that silently does nothing. `replace`, not `push` —
       a screen with no inbound link should not deepen the stack on the way out.

       `claimsBottomInset` stays at its default: nothing is pinned to the bottom
       edge. The FAB is `absolute` INSIDE the scroll content, not docked to the
       screen, so it does not claim the inset. */
    <DetailShell
      title="Dashboard"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(app)"))}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          // 32, not 140. The 140 cleared the bottom nav; the nav is gone and the
          // shell claims the bottom inset now, so 140 would leave ~170px of dead
          // space under the last card.
          paddingBottom: 32,
          gap: 48,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View className="gap-xs">
          <Text className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            Good morning, {firstName}
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            You have 1 appointment today and vitals are stable.
          </Text>
        </View>

        {/* Upcoming Appointment card — no shadow, and there is no longer a
              `cardShadow` in this file to pass one in with. docs/BRAND.md
              §Elevation: cards cast no drop shadow. */}
        <Card className="w-full gap-md rounded-3xl p-lg">
          <View className="flex-row items-center gap-sm">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <MaterialIcons name="event-available" size={24} color="#00685f" />
            </View>
            <View className="flex-1 gap-xs">
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 15 }}>
                Dr. Sarah Chen
              </Text>
              <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 13 }}>
                Cardiologist
              </Text>
            </View>
            <Badge label="Upcoming" tone="success" />
          </View>
          <View className="self-start rounded-full bg-background px-sm py-xs">
            <Text className="font-inter-medium text-[13px] text-on-surface">
              Tomorrow, 10:30 AM
            </Text>
          </View>
          {/* Brief §6: hide/disable outside the join window rather than
                always-on. No join-window data is modeled yet, so this stays
                enabled — flagged above rather than faking a time check. */}
          <Button label="Join Call" onPress={() => {}} />
        </Card>

        {/* Health Snapshot */}
        <View className="w-full gap-md">
          <Text className="font-inter-semibold text-[12px] uppercase tracking-[0.05em] text-on-surface-variant">
            Health Snapshot
          </Text>
          {/* The SHARED VitalStatCard (Figma 211:241) — the local one of the same
              name is deleted. See the FLAG below on the lost button role. */}
          {VITALS.map((v) => (
            <VitalStatCard
              key={v.label}
              label={v.label}
              value={v.value}
              unit={v.unit}
              icon={v.icon}
              tone={v.tone}
              trend={v.trend}
              trendLabel={v.trendLabel}
              abnormalLabel={v.abnormalLabel}
            />
          ))}
        </View>

        {/* Recent Activity */}
        <View className="w-full gap-md">
          <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
            Recent Activity
          </Text>
          <Card className="w-full rounded-3xl">
            {ACTIVITY.map((a, i) => (
              <TimelineItem key={a.label} entry={a} isLast={i === ACTIVITY.length - 1} />
            ))}
          </Card>
        </View>

        {/* Quick Actions */}
        <View className="w-full gap-md rounded-3xl bg-surface-container-low p-lg">
          <Text className="font-inter-semibold text-[12px] uppercase tracking-[0.05em] text-on-surface-variant">
            Quick Actions
          </Text>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
            {QUICK_ACTIONS.map((a) => (
              <View key={a.label} style={{ width: "50%", paddingHorizontal: 6, marginBottom: 12 }}>
                <QuickActionTile action={a} />
              </View>
            ))}
          </View>
        </View>

        {/* Daily Health Tip */}
        <View className="w-full gap-sm rounded-3xl bg-primary p-lg">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <MaterialIcons name="lightbulb" size={24} color="#ffffff" />
          </View>
          <Text className="font-headline-md text-white" style={{ fontSize: 17 }}>
            Daily Health Tip
          </Text>
          <Text className="font-body-md text-white/90" style={{ fontSize: 14 }}>
            Aim for at least 7 hours of sleep tonight — consistent rest helps keep your blood
            pressure in a healthy range.
          </Text>
          {/* Button primitive's variants don't cover "white-on-primary
                translucent pill" (its inline style always wins over
                className for background), so this stays a local Pressable —
                same pattern HomeScreen uses for its non-standard CTAs. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read More"
            onPress={() => {}}
            className="w-full items-center justify-center rounded-full bg-white/15 py-sm active:bg-white/25"
          >
            <Text className="font-inter-semibold text-[14px] text-white">Read More</Text>
          </Pressable>
        </View>

        {/* Shared Documents */}
        <View className="w-full gap-md">
          <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
            Shared Documents
          </Text>
          <Card className="w-full gap-md rounded-3xl">
            {DOCUMENTS.map((d) => (
              <DocumentListRow key={d.name} doc={d} />
            ))}
          </Card>
        </View>
      </ScrollView>

      {/* FAB — action/label undefined in the brief (§7); rendered as a
          visual-only affordance, no onPress, until product specifies the
          destination. Figma 204:240 marks it "PROPOSED action — needs product
          confirmation", so it stays visual-only.

          It now sits inside the shell's content slot rather than beside the
          bottom nav. That slot's bottom edge IS the safe-area bottom edge, so
          `bottom-24` (96px) still lands 96px up from the same line as before,
          clear of the 64px bar — no visual change. */}
      <View
        className="absolute bottom-24 right-gutter h-14 w-14 items-center justify-center rounded-full bg-primary"
        style={fabShadow}
      >
        <MaterialIcons name="add" size={28} color="#ffffff" />
      </View>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// The local `VitalStatCard` is gone — it is the shared one from
// "@/components/ui" now (Figma 211:241). What it took with it:
//
//   * `#171c1c` as the value colour. A one-character typo of `#171D1C`
//     (`color/on-surface`), so it matched no token and no frame, and it shipped
//     on the highest-stakes surface in the product.
//   * `#ba1a1a` and `#00685f` — the LIGHT values of `error` and `primary`,
//     frozen in JS, plus `#ffffff` on the icon chip. In dark mode the chip stayed
//     dark teal behind a white glyph while everything around it inverted.
//   * A `cardShadow` on a card, which docs/BRAND.md §Elevation forbids and the
//     shared `Card` structurally strips.
//   * `fontSize: 28` at weight 800 for the value (211:247 is `headline-lg` 24),
//     and `text-[13px]` twice — 13 is not on BRAND's 28/24/20/16/14/12 ramp.
//   * `active:scale-[0.99]`, which nudges the 1px hairline off the pixel grid.
//
// FLAGGED — one thing genuinely changed, and it is not a silent drop. The old
// card was a `<Pressable accessibilityRole="button">` whose accessibility label
// ended "Tap for trend detail." — and it had NO `onPress`. It announced itself as
// a button, and did nothing. The shared component renders a non-interactive View
// unless given `onPress`, so the card is now honestly non-interactive: a screen
// reader no longer promises a tap that never worked. Pass `onPress` here the
// moment a trend-detail route exists; until then the affordance should not be
// advertised. (The shared component also builds a richer spoken summary than the
// old label — it includes the tone and the trend, which the old one omitted — so
// no `accessibilityLabel` override is passed.)

function TimelineItem({ entry, isLast }: { entry: ActivityEntry; isLast: boolean }) {
  return (
    <View className="w-full flex-row items-start gap-sm" style={{ paddingBottom: isLast ? 0 : 20 }}>
      <View className="items-center">
        <View className="h-2.5 w-2.5 rounded-full bg-primary" />
        {!isLast ? (
          <View style={{ flex: 1, width: 2, marginTop: 4, backgroundColor: "#f5faf8" }} />
        ) : null}
      </View>
      <Text className="flex-1 font-body-md text-[14px] text-on-surface">{entry.label}</Text>
      <Text className="font-body-md text-[12px] text-on-surface-variant">{entry.timestamp}</Text>
    </View>
  );
}

function QuickActionTile({ action }: { action: QuickAction }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      // Tile, i.e. a card role: no shadow. Separation is the surface-tone step
      // (`surface-container-lowest` inside a `surface-container-low` panel)
      // plus the `outline-variant` hairline that replaces the deleted blur —
      // docs/BRAND.md §Elevation.
      className="items-center gap-sm rounded-2xl border border-outline-variant bg-surface-container-lowest py-md active:scale-95"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <MaterialIcons name={action.icon} size={24} color="#00685f" />
      </View>
      <Text className="font-inter-medium text-[13px] text-on-surface">{action.label}</Text>
    </Pressable>
  );
}

function DocumentListRow({ doc }: { doc: SharedDocument }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${doc.name}`}
      className="w-full flex-row items-center gap-sm active:opacity-70"
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <MaterialIcons name="description" size={24} color="#00685f" />
      </View>
      <View className="flex-1 gap-xs">
        <Text className="font-inter-medium text-[14px] text-on-surface">{doc.name}</Text>
        <Text className="font-body-md text-[12px] text-on-surface-variant">{doc.meta}</Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Shadows — deleted.
// ---------------------------------------------------------------------------
// `cardShadow` (a grey `0 2px 8px`) is gone with its last caller, the quick
// action tile: docs/BRAND.md §Elevation gives cards, panels and tiles surface
// tone plus a hairline, never a blur. `fabShadow` is gone as a module constant
// too — the FAB genuinely floats, so it keeps a shadow, but it is now derived
// in-component from the `shadow` token via `useTokenShadow` so it follows the
// theme instead of freezing a light-mode teal.
