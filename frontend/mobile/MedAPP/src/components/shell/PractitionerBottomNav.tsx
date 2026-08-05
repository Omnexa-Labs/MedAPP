// PractitionerBottomNav — the practitioner half of the app shell.
//
// Figma: component set "Practitioner BottomNav" 381:628 (variants
// Active=Home | Appointments | Inbox | Patients | Profile (the Appointments
// variant is LABELLED "Schedule" — see TABS); the frame that
// drove this rebuild, onboarding_status 72:117, instances Active=Home).
//
// The designer's own component description, verbatim from Figma:
//
//   "Practitioner bottom navigation. Five tabs: Home, Schedule, Inbox,
//    Patients, Profile — deliberately NOT the patient tab set
//    (Home/Overview/Inbox/Community/Lifestyle); practitioners are a distinct
//    audience. Active tab is bound to color/primary, inactive to
//    color/on-surface-variant, so both Light and Dark modes resolve correctly.
//    Every tab is a 75x48 target (>=44x44)."
//
// That answers the question the previous build of onboarding_status raised and
// then resolved the wrong way: it deleted its bespoke tab bar entirely on the
// theory that a second bar would silently redefine the patient shell. There IS
// an approved practitioner shell, it is a distinct component set, and this file
// is it — so `features/home/components/BottomNav.tsx` (the patient bar) stays
// untouched and the two audiences can't drift into each other.
//
// Geometry, all from 379:492:
//   bar          h 64, bg color/surface, padding 8, tabs justify-between
//   tab item     75 x 48, column, gap 4, centred
//   icon         24, Health Icons outline (through the shared <Icon />)
//   label        label-sm (Inter Medium 12 / 1.3), centred
//   active       color/primary (icon AND label)
//   inactive     color/on-surface-variant
//
// The frame draws no pill, no top border and no shadow behind the active tab —
// unlike the patient bar. Followed the frame.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. Only expo-router is used.

import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { Icon, type HealthIconName } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

export type PractitionerTab = "home" | "appointments" | "inbox" | "patients" | "profile";

interface TabDef {
  key: PractitionerTab;
  label: string;
  /** Health Icons name — the frame uses the domain set, not chrome, for tabs. */
  icon: HealthIconName;
  /**
   * Real route in src/app/(app)/, or `null` where the practitioner destination
   * does not exist yet. `null` tabs render (the shell is fixed across the app —
   * docs/BRAND.md: "Never rename, reorder, or add tabs on a single screen") but
   * no-op on press and say so to assistive tech, rather than pushing an invented
   * path or a patient screen.
   */
  href: Href | null;
}

/**
 * FLAGGED — route coverage for the practitioner tab set. Keep this in sync with
 * `src/app/(app)/`; it is the one place anyone looks to answer "which
 * practitioner destinations exist?", so a stale entry here is worse than none.
 * Missing today: a practitioner home and a practitioner self-profile.
 *
 * STATUS 2026-08-05: both are being DESIGNED (Figma page "Practitioner Shell").
 * Until the screens are built and routed, the two `null` tabs render dimmed and
 * report `disabled` — see the INTERIM note on the Pressable below, which also
 * states the condition for removing it. Two of five tabs dead is the same defect
 * class as the patient nav's six hand-written `onTabPress` switches, three of
 * which silently dropped Inbox; the difference is that here the destinations do
 * not exist yet, so a shared tab map cannot fix it.
 *
 *   Home         (none)                      practitioner home not built
 *   Appointments /(app)/appointments         EXISTS — but AppointmentManagement
 *                                            is authored patient-side ("View My
 *                                            Appointments" from BookingConfirmed).
 *                                            Wired because it exists and is the
 *                                            right concept; needs a practitioner
 *                                            variant.
 *   Inbox        /(app)/inbox                EXISTS — audience-neutral.
 *   Patients     /(app)/active-patient-roster-2   EXISTS — ActivePatientRoster2Screen,
 *                                            which mounts <PractitionerShell
 *                                            activeTab="patients" hideBack>.
 *   Profile      (none)                      practitioner-social-profile is the
 *                                            PATIENT-facing view of a specialist
 *                                            (entry points: Explore, Community),
 *                                            not the practitioner's own profile,
 *                                            so it is deliberately NOT wired here.
 */
const TABS: TabDef[] = [
  { key: "home", label: "Home", icon: "home", href: null },
  {
    // "Schedule", not "Appointments". At label-sm 12 in a ~75px tab,
    // "Appointments" (12 chars) truncated to "Appointmen..." on device. The floor
    // options were both off the table — BRAND forbids type under 12sp and targets
    // under 44pt — so the word changed instead.
    //
    // "Schedule" is also the better word here: this is the PRACTITIONER shell, and
    // clinician-facing software calls a clinician's own day their schedule. The
    // patient shell keeps "Appointments", which is correct — two audiences, two
    // shells. `key` stays "appointments" because it is the API this component's
    // callers pass as `activeTab`, and it matches the Figma variant property
    // `Active=Appointments`; only the visible label changed.
    key: "appointments",
    label: "Schedule",
    icon: "appointment",
    href: "/(app)/appointments" as Href,
  },
  { key: "inbox", label: "Inbox", icon: "message", href: "/(app)/inbox" as Href },
  // The "-2" is vestigial, not meaningful: there is no roster 1. `features/roster/`
  // is an empty directory and no `/(app)/active-patient-roster` route exists, so
  // there is nothing to compare against or hold as regression coverage. A shared
  // nav is now coupled to a name that implies a sibling which was never built —
  // worth renaming to `active-patient-roster` when the screen next moves, together
  // with `features/roster2/` and `ActivePatientRoster2Screen`.
  { key: "patients", label: "Patients", icon: "community", href: "/(app)/active-patient-roster-2" as Href },
  { key: "profile", label: "Profile", icon: "doctor", href: null },
];

const BAR_HEIGHT = 64;
const TAB_HEIGHT = 48; // 48 > the 44pt minimum; width comes from flex-1 (~75)
const ICON = 24;
const LABEL_LINE_HEIGHT = 16; // label-sm 12px at the frame's 1.3 leading

interface Props {
  active?: PractitionerTab;
  /**
   * Escape hatch for a screen that must intercept a tab (e.g. warn about
   * unsaved work). Return `true` to signal "handled, don't navigate".
   */
  onTabPress?: (key: PractitionerTab) => boolean | void;
}

export function PractitionerBottomNav({ active = "home", onTabPress }: Props) {
  const insets = useSafeAreaInsets();
  const primary = useTokenColor("primary");
  const onSurfaceVariant = useTokenColor("on-surface-variant");

  return (
    <View
      accessibilityRole="tablist"
      className="w-full flex-row items-center justify-between bg-surface p-2"
      // The frame is a fixed 393x1283 canvas with no OS gesture bar, so the
      // inset has to be added here rather than designed in — otherwise the
      // labels sit under the home indicator on a notched device.
      style={{ height: BAR_HEIGHT + insets.bottom, paddingBottom: 8 + insets.bottom }}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const color = isActive ? primary : onSurfaceVariant;
        const unrouted = tab.href === null;

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            // `disabled` as well as `selected`. An unrouted tab announced only via
            // `accessibilityHint` was half-honest: TalkBack read "Not available
            // yet", but the STATE was still "tab, not selected", so the control
            // reported itself as actionable. This makes the two agree.
            accessibilityState={{ selected: isActive, disabled: unrouted }}
            accessibilityLabel={tab.label}
            accessibilityHint={
              isActive
                ? undefined
                : unrouted
                  ? "Not available yet"
                  : `Go to ${tab.label.toLowerCase()}`
            }
            onPress={() => {
              if (onTabPress?.(tab.key) === true) return;
              if (isActive || !tab.href) return; // active tab and stubs no-op
              router.push(tab.href);
            }}
            className="flex-1 flex-col items-center justify-center active:opacity-70"
            // INTERIM (2026-08-05) — the dimming goes when the two screens land.
            //
            // Home and Profile have no destination, and until now that was told to
            // assistive tech and to NOBODY ELSE: a sighted practitioner saw two
            // tabs identical to the three that work, tapped one, and got silence.
            // "Never encode meaning in colour alone" is usually a warning about
            // colour-ONLY signals; this was the inverse failure, a signal with no
            // visual channel at all.
            //
            // 0.6 is the opacity Button.tsx already uses for disabled, so this
            // borrows an existing treatment rather than inventing a fourth one.
            // It is NOT a token: opacity is a state layer here, not a colour.
            //
            // REMOVE THIS, and the `unrouted` branch above, once
            // `practitioner-home` and `practitioner-profile` exist and TABS
            // carries their hrefs. It is a stopgap that keeps the bar honest in
            // the meantime, not a design decision to keep.
            style={{ height: TAB_HEIGHT, gap: 4, opacity: unrouted ? 0.6 : 1 }}
          >
            {/* Decorative: the label directly beneath carries the name, so the
                glyph is hidden from assistive tech (no `label` prop). */}
            <Icon name={tab.icon} size={ICON} color={color} />
            <Text
              numberOfLines={1}
              className={`text-center font-label-sm text-label-sm ${
                isActive ? "text-primary" : "text-on-surface-variant"
              }`}
              style={{ lineHeight: LABEL_LINE_HEIGHT }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
