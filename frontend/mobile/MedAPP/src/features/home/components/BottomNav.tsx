// BottomNav — the PATIENT half of the app shell (the practitioner half lives in
// src/components/shell/PractitionerBottomNav.tsx and must never be swapped for
// this one).
//
// Figma: component "Patient BottomTabBar (Home/Overview/Inbox/Community/
// Lifestyle)" 101:143, page Design System. Read back off the file for this pass:
//
//   bar        393 x 64, fill color/surface, padding spacing/8 all round
//   tab item   75 x 48, column, gap spacing/4, centred, NO fill
//   icon       24 x 24 frame per tab (icon/home, icon/overview, icon/message,
//              icon/community, icon/chrome-sparkle)
//   label      label-sm — Inter Medium 12 / 1.3, 16px box
//   active     color/primary on BOTH the icon and the label
//   inactive   color/on-surface-variant on both
//
// Tabs have no destination of their own: routing is the caller's, through
// `onTabPress`. Promote this to `(app)/_layout.tsx` as `<Tabs>` once the routes
// settle. The tab set, order and labels are fixed app-wide (docs/BRAND.md:
// "Never rename, reorder, or add tabs on a single screen") and are unchanged by
// this pass — only the visual treatment moved.
//
// ---------------------------------------------------------------------------
// THE PILL IS GONE — the patient bar now carries the practitioner treatment
// ---------------------------------------------------------------------------
// This file used to render the active tab as a glyph + label inside a filled
// `primary-container` pill, and coloured them `on-primary-container` to keep the
// contrast pair honest. That was disclosed as a deliberate deviation from
// 101:143, which binds the active tab to `primary`.
//
// The product owner has since ruled that Figma wins and that the patient bar
// must match the practitioner one, which draws no pill at all. 101:143 now
// agrees: the five 20x20 "Icon Backing" ellipses are deleted, the TabItem frames
// carry `fills: []`, and the active state is carried by COLOUR ALONE. So the
// pill is removed here, and the active pair is `primary` / `primary` rather than
// `on-primary-container` / `on-primary-container`. There is no accent surface
// behind the glyph any more, so `on-*` is no longer the right role — the glyph
// sits on the bar's `surface` fill exactly as the inactive ones do.
//
// That also closes the two reconciliations this file used to flag, both in
// Figma's favour, and both comment blocks are deleted rather than reworded:
//   1. "the Figma icon frames are 12x12" — they are 24x24 now.
//   2. "every TabItem has a 20x20 Icon Backing ellipse" — all five are deleted.
//
// ---------------------------------------------------------------------------
// THEME SAFETY — this file used to be the reason "dark mode isn't clean"
// ---------------------------------------------------------------------------
// It once shipped three frozen light-mode values: a `shadowColor` grey that
// existed in no token and no frame, plus the LIGHT hex of the two token names
// the labels beside them were already using as classes — so the glyphs stayed
// dark while the labels lightened. Every colour here now resolves by TOKEN NAME
// for the mode being rendered, via src/lib/tokens.ts, and the guard test asserts
// the source contains no literal at all. docs/MOBILE_UX.md §React Native
// specifics: "No literal colours — every value through a token."
//
// The shadow was DELETED rather than tokenised: 101:143 carries no effects, and
// docs/BRAND.md §Elevation is explicit that separation comes from surface tone
// and a hairline.
//
// ---------------------------------------------------------------------------
// Three places this deliberately differs from PractitionerBottomNav
// ---------------------------------------------------------------------------
// 1. `absolute` positioning is kept. It is load-bearing: 13 patient screens
//    reserve room for this bar with their own ScrollView bottom padding, and
//    PatientShell renders it as an overlay. The practitioner bar is a layout
//    child of PractitionerShell instead. Not a treatment difference.
// 2. The `border-t border-outline-variant/20` hairline is kept, and only
//    because of (1): content scrolls UNDER this bar, so it needs an edge the
//    practitioner bar does not. Tokenised, and it is the separation BRAND
//    §Elevation prescribes in place of the deleted shadow.
// 3. Safe area. This bar reads no insets — its 24px bottom pad is Figma's
//    spacing/8 plus 16px of gesture-bar allowance, and changing that would
//    change the bar's outer height and silently break every caller's scroll
//    reserve. Left exactly as it was; see BAR geometry below.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { Pressable, Text, View } from "react-native";
import { Icon, type ChromeIconName, type HealthIconName } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

/** The five patient tabs. Fixed — see the BRAND quote above. */
export type PatientTab = "home" | "overview" | "inbox" | "community" | "lifestyle";

/**
 * A tab's glyph, in the shape `<Icon />` already accepts: a Health Icons
 * `name`, or a MaterialIcons `chrome` fallback. Spread straight into `<Icon />`
 * so the two arms stay mutually exclusive at the type level and this file never
 * touches an icon library itself (docs/BRAND.md: icons/Icon.tsx is the only
 * file allowed to).
 */
type TabGlyph = { name: HealthIconName; chrome?: never } | { chrome: ChromeIconName; name?: never };

interface TabDef {
  key: PatientTab;
  label: string;
  glyph: TabGlyph;
}

/**
 * Glyphs follow 101:143, which moved four of the five onto real Health Icons
 * geometry — the same glyphs the practitioner shell uses for Home, Inbox and
 * Patients/Community, so the two bars now read as one system. The file
 * previously drew all five from the MaterialIcons chrome set.
 *
 * Lifestyle is the ONE chrome fallback, and matches the Figma frame's own name
 * `icon/chrome-sparkle`: Health Icons ships no sparkle, and its nearest
 * candidate (`magic_wand`) implies magic, which BRAND rejects outright — "the
 * glyph must match its label".
 */
const TABS: TabDef[] = [
  { key: "home", label: "Home", glyph: { name: "home" } },
  { key: "overview", label: "Overview", glyph: { name: "overview" } },
  // Figma `icon/message` — a speech bubble (Health Icons `communication`), not
  // the envelope this used to draw. Same glyph as the practitioner Inbox.
  { key: "inbox", label: "Inbox", glyph: { name: "message" } },
  { key: "community", label: "Community", glyph: { name: "community" } },
  { key: "lifestyle", label: "Lifestyle", glyph: { chrome: "auto-awesome" } },
];

const ICON = 24; // 101:143 icon frames
const TAB_HEIGHT = 48; // 101:143 tab items; 48 > the 44pt floor. Width is flex-1 (~75)
const TAB_GAP = 4; // spacing/4, icon -> label
const LABEL_LINE_HEIGHT = 16; // label-sm 12px at the frame's 1.3 leading

interface Props {
  active?: PatientTab;
  onTabPress?: (key: PatientTab) => void;
}

export function BottomNav({ active = "home", onTabPress }: Props) {
  // Active and inactive are both plain glyphs on the bar's `surface` fill now
  // that the pill is gone, so neither takes an `on-*` role.
  const primary = useTokenColor("primary");
  const onSurfaceVariant = useTokenColor("on-surface-variant");

  return (
    // Bar fill is `surface`; separation is the hairline, with no shadow.
    // Padding is Figma's spacing/8 on three sides; `pb-md` (24) is that 8 plus
    // the 16px gesture-bar allowance this bar has always carried, which keeps
    // the outer height at 8 + 48 + 24 = 80 — unchanged, so no caller's scroll
    // reserve moves.
    <View
      accessibilityRole="tablist"
      className="absolute bottom-0 left-0 right-0 z-50 flex-row items-center justify-between border-t border-outline-variant/20 bg-surface px-base pb-md pt-base"
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        const color = isActive ? primary : onSurfaceVariant;
        return (
          <Pressable
            key={t.key}
            onPress={() => onTabPress?.(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={t.label}
            // No fill in either state — 101:143's TabItem frames are `fills: []`
            // and the backing ellipses are deleted.
            className="flex-1 flex-col items-center justify-center active:opacity-70"
            style={{ height: TAB_HEIGHT, gap: TAB_GAP }}
          >
            {/* Decorative: the label directly beneath carries the name, so the
                glyph is hidden from assistive tech (no `label` prop). */}
            <Icon {...t.glyph} size={ICON} color={color} />
            <Text
              numberOfLines={1}
              className={`text-center font-label-sm text-label-sm ${
                isActive ? "text-primary" : "text-on-surface-variant"
              }`}
              style={{ lineHeight: LABEL_LINE_HEIGHT }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
