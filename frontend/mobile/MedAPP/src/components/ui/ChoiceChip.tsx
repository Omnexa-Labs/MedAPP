// ChoiceChip — the ONE selectable pill. Filter rows, facet rows, gender/goal
// pickers, time-slot filters, inbox tabs.
//
// Figma: component set `ChoiceChip` 11:104 (variants State=Default 11:100 /
// State=Selected 11:102). Read straight off the frame:
//
//   box        h 44, px 16, py 12, radius/12, items-center justify-center
//   default    NO fill + 1px `color/outline-variant` hairline
//              label `color/on-surface`
//   selected   fill `color/primary`, no hairline
//              label `color/on-primary`
//   label      Inter SemiBold 14 / 1.3  =  the `label-md` ramp step
//
// WHY THIS FILE EXISTS. Ten private chip implementations were spread over eight
// screens, and the drift had already gone past cosmetic into semantic:
//
//   selected      bg-primary/on-primary        (CommunityHub, Explore)
//                 bg-primary-container         (LifestyleManage)  <- different EMPHASIS
//   unselected    transparent + hairline       (frame, SignUpStep2-ish)
//                 bg-surface-container         (FindCare MainChip)
//                 bg-surface-container-lowest  (FindCare FacetChip)
//   label         text-on-surface / text-on-surface-variant on the SAME fill
//   radius        rounded-full / rounded-lg / rounded-md, all three
//   height        four different values, EVERY ONE of them under 44pt
//
// FindCareScreen is the clearest case: `MainChip` and `FacetChip` sit in
// adjacent rows of one screen, share no code, differ by 8pt in height, and each
// implement the selected-state affordance separately so the two can diverge
// again independently. Both also carried frozen light-mode literals
// (`#ffffff`, `#3d4947`, `#00685f`, `#6d7a77`) passed straight into an icon
// colour — the exact bug class that made the patient BottomNav render
// identically in dark mode.
//
// So the contract here is deliberately narrow: a caller picks `selected`, and
// gets the frame's geometry, the frame's token pair, and a >=44pt target. There
// is no `variant`, no `size`, no `tone` and no `className` escape hatch on the
// fill — a screen must not be able to express a private chip by accident, which
// is the whole point of the componentisation (see the house rule in
// src/components/ui/README.md).
//
// TWO AXES ADDED, and both were answers to questions this file asked. 11:104
// gained `Layout=Hug|Fill` and `State=Default|Selected|Unavailable` (variants
// 756:4205 / 756:4207 / 756:4209 / 756:4211):
//
//   layout="fill"  swaps `self-start` for `w-full`, so a chip inflates to its
//                  grid cell. SelectTimeSlotScreen's slot grid and date strip
//                  each carried a long FLAGGED comment saying they could not be
//                  migrated to this primitive BECAUSE the frame had no such axis,
//                  and each shipped a private chip instead. The designer added the
//                  axis; the private copies go.
//   unavailable    a slot that exists but cannot be booked (09:30 AM and 02:00 PM
//                  in 756:4384). NOT the same as `disabled`, which is "this
//                  control is off" — `unavailable` is a statement about the DATA,
//                  and it is announced as such.
//
// THE DASH IS THE SIGNAL, NOT THE TINT. `unavailable` draws a DASHED
// `outline-variant` hairline and drops its CONTENT to 0.38 (Material 3's
// disabled-content opacity), leaving the border at full strength. docs/BRAND.md
// §Colour rules: "Never use colour as the only signal." A paler chip in a grid of
// twelve chips, read in sunlight on a low-density screen, is not a signal — and
// this is a medical booking grid, where "I tapped the greyer one" is a real
// outcome. Do not simplify the dash away. It is announced too, so the state
// reaches a screen reader and not only an eye. DatePill carries the identical
// treatment on purpose: one affordance, learned once.
//
// FLAGGED for the designer — three gaps in 11:104 (none of them a BRAND
// conflict; the frame is simply silent, and where it is silent BRAND decides):
//
//  1. NO ICON SLOT. The frame is label-only, but four live call sites draw a
//     leading glyph (FindCare's MAIN_CHIPS carry `icon`). Implemented per
//     BRAND's iconography rules — through the shared <Icon />, at the sanctioned
//     20px dense-row size, tinted with the label's OWN token so the glyph and
//     the label can never drift apart per mode (the Badge.tsx precedent).
//     11:104 should gain a boolean `Icon` property.
//  2. NO CHECK GLYPH ON `State=Selected`. Selection would then be carried by
//     fill colour alone. docs/MOBILE_UX.md §Accessibility: "Never encode meaning
//     in colour alone", and FindCare's MainChip already shipped the check for
//     exactly that reason. Kept, and defaulted ON, since dropping it would be a
//     regression in shipped accessibility behaviour. 11:104 should gain the
//     check to `State=Selected`.
//  3. NO `State=Disabled`. Handled with the 0.6 opacity Button.tsx already uses,
//     rather than inventing a fourth chip surface token.
//
// One deliberate departure from the frame, and it is a bug fix, not a
// preference: the SELECTED state keeps a 1px border (`border-primary`, i.e. the
// same colour as its own fill, so it is invisible). Figma strokes are inset and
// cost no layout, but in React Native a border participates in layout — so
// dropping it on selection would shrink the content box by 2pt in each axis and
// make every chip in a row twitch as the user taps through them. SignUpStep2's
// GenderChip had already arrived at the same `border-primary bg-primary` pairing.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. None is used — RN core plus the project's own token layer only.

import { Pressable, ScrollView, Text, View } from "react-native";
import { cn } from "@/lib/cn";
import { useResolvedScheme } from "@/lib/theme";
import { blendTokens, tokenColor, type ColorToken } from "@/lib/tokens";
// `isHealthIcon` is the icon GATE's decision about which vocabulary a name
// belongs to (Health Icons wins a collision, per BRAND: "Prefer `name` when a
// clinical glyph exists"). It used to be a private copy in this file; four
// components now need it, so it lives in Icon.tsx and there is one of it.
import { Icon, isHealthIcon, type ChromeIconName, type HealthIconName } from "./icons/Icon";

/**
 * `44` is the floor in docs/MOBILE_UX.md §Accessibility AND the frame's own
 * height, so the two agree for once — every hand-rolled chip this replaces was
 * below it, by four different amounts.
 *
 * `minHeight`/`minWidth` rather than `height`/`width`: the chip must be allowed
 * to GROW at a large OS font scale (MOBILE_UX: "Test at 393pt wide *and* at a
 * large font scale") but never to shrink under the floor. `minWidth` matters for
 * a one- or two-character label ("All", "24h"), which would otherwise measure
 * ~40pt wide and miss the floor on the cross axis while passing on the main one.
 */
const TARGET_MIN = 44;

/** Frame: label-only chips are 16/12 inset. `px-4` / `py-3` on the BRAND scale. */
const INSET = "px-4 py-3";

/**
 * BRAND iconography: "24px default, 20px in dense rows". A chip is a dense row.
 * The glyphs this replaces were drawn at 18 and 16 — both off the ramp.
 */
const GLYPH = 20;

/** Material 3's pressed state-layer opacity, same constant Button.tsx uses. */
const PRESSED_STATE_LAYER = 0.12;

/** Button.tsx's disabled treatment, reused so the two primitives agree. */
const DISABLED_OPACITY = 0.6;

/**
 * Material 3's disabled-CONTENT opacity, for the `unavailable` state.
 *
 * Deliberately different from DISABLED_OPACITY and deliberately applied to a
 * different node: `disabled` dims the WHOLE control (it is off), `unavailable`
 * dims only the content and leaves the dashed hairline at full strength (the
 * control is fine; the slot is taken). Fading the border too would erase the
 * non-colour signal and leave a blank rectangle.
 */
const UNAVAILABLE_CONTENT_OPACITY = 0.38;

/**
 * BRAND §"Spacing, radius, layout": the screen gutter is 16px, and
 * §"Horizontal strips and carousels" requires "a trailing inset matching the
 * leading gutter". One symmetric `paddingHorizontal` satisfies both, which is
 * the derivation ChoiceChipRow exists to stop each screen repeating.
 */
const GUTTER = 16;

/** BRAND spacing scale. 8 is the gap every chip row had converged on anyway. */
const ROW_GAP = 8;

/**
 * The two state pairings, as the frame defines them.
 *
 * `container`/`label` are Tailwind classes, because NativeWind resolves those
 * through global.css and they therefore flip with the theme for free. `content`
 * is a TOKEN NAME, resolved to a string at render only because <Icon /> takes a
 * colour string — never a literal, which is what froze four of these screens in
 * light mode.
 *
 * `content` always names the same token as `label`. That is the invariant: the
 * glyph and the text are one piece of content, and a badge once shipped with a
 * dark-teal icon beside a bright label because they were allowed to differ.
 */
const STATE: Record<
  "default" | "selected" | "unavailable",
  { container: string; label: string; content: ColorToken; fill: ColorToken | null }
> = {
  // No fill. BRAND: "Never use a raw white/black fill on an icon container or
  // tab item. Leave those transparent so the parent surface shows through" —
  // which is also why an unselected chip reads correctly on a card AND on the
  // page, the thing the three competing `surface-container-*` fills broke.
  default: {
    container: "border-outline-variant",
    label: "text-on-surface",
    content: "on-surface",
    fill: null,
  },
  selected: {
    // `border-primary` is the invisible-border layout fix documented at the top.
    container: "border-primary bg-primary",
    label: "text-on-primary",
    content: "on-primary",
    fill: "primary",
  },
  // 756:4209 / 756:4211. No fill (the parent surface shows through) and a DASHED
  // hairline — see the note at the top of the file on why the dash, not a tint.
  unavailable: {
    container: "border-dashed border-outline-variant",
    label: "text-on-surface-variant",
    content: "on-surface-variant",
    fill: null,
  },
};

export type ChoiceChipProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Resolved through the Icon gate; tint comes from the selected state, never a literal. */
  icon?: ChromeIconName | HealthIconName;
  /**
   * Render the check glyph when selected, so selection is not colour-only.
   * Defaults to true — see FLAGGED (2). Pass `false` only where the row already
   * carries a non-colour signal of its own (e.g. a facet chip whose trailing
   * chevron means "opens a picker" and must not be displaced by a tick).
   */
  showSelectedCheck?: boolean;
  disabled?: boolean;
  /**
   * `"hug"` (default) — the chip sizes to its label, for a filter/facet row.
   * `"fill"` — the chip inflates to its parent's width, for a grid cell. This is
   * the `Layout` axis 11:104 gained (756:4205 / 756:4207); it is what lets the
   * slot grid use this primitive instead of a private copy.
   */
  layout?: "hug" | "fill";
  /**
   * The slot exists but cannot be booked. Dashed hairline, content at 38%, not
   * pressable, announced as "unavailable". See the note at the top of the file —
   * this is a statement about the DATA, which is why it is not `disabled`.
   */
  unavailable?: boolean;
  /**
   * "filter" (default) — an independently togglable chip: `button` + selected
   * state, which is how a multi-select facet row must read.
   * "radio" — one-of-N within a group, e.g. SignUpStep2's gender row. Also emits
   * `checked`, which is the state Android's radio mapping actually reads.
   */
  role?: "filter" | "radio";
  accessibilityLabel?: string;
  testID?: string;
};

export function ChoiceChip({
  label,
  selected = false,
  onPress,
  icon,
  showSelectedCheck = true,
  disabled = false,
  layout = "hug",
  unavailable = false,
  role = "filter",
  accessibilityLabel,
  testID,
}: ChoiceChipProps) {
  // `unavailable` wins over `selected`: a slot that was taken while the user was
  // looking at it must stop reading as chosen.
  const s = STATE[unavailable ? "unavailable" : selected ? "selected" : "default"];
  const isSelected = selected && !unavailable;
  const isDisabled = disabled || unavailable;
  const { scheme } = useResolvedScheme();
  const contentColor = tokenColor(s.content, scheme);
  // Only the FILLED state gets a pressed colour. An unselected chip has no fill
  // to darken and must stay transparent, so its feedback is the scale below —
  // which still lands inside the 100ms budget in docs/MOBILE_UX.md §Motion.
  const pressedFill = s.fill
    ? blendTokens(s.fill, s.content, PRESSED_STATE_LAYER, scheme)
    : undefined;

  return (
    <Pressable
      accessibilityRole={role === "radio" ? "radio" : "button"}
      // The unavailability is announced, not only drawn — a dashed border is a
      // signal for an eye, and this state has to reach a screen reader too.
      accessibilityLabel={accessibilityLabel ?? (unavailable ? `${label}, unavailable` : label)}
      accessibilityState={{
        selected: isSelected,
        disabled: isDisabled,
        ...(role === "radio" ? { checked: isSelected } : null),
      }}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      className={cn(
        "flex-row items-center justify-center gap-xs rounded-md border",
        !isDisabled && "active:scale-[0.98]",
        INSET,
        // "hug": `self-start` keeps a chip hugging its label inside a stretching
        // row parent, instead of inflating to the row's cross-axis height.
        // "fill": the chip takes its grid cell, which is the 3-up slot grid.
        layout === "fill" ? "w-full" : "self-start",
        s.container,
      )}
      style={({ pressed }) => ({
        minHeight: TARGET_MIN,
        minWidth: TARGET_MIN,
        // `unavailable` dims its CONTENT below, not the whole control, so the
        // dashed hairline survives at full strength.
        opacity: disabled && !unavailable ? DISABLED_OPACITY : 1,
        ...(pressed && pressedFill ? { backgroundColor: pressedFill } : null),
      })}
    >
      {/* Decorative in both glyph slots: the Text between them carries the name,
          and the selected state is already on accessibilityState — so neither
          takes a `label`, which hides them from assistive tech rather than having
          a screen reader announce "image, image, Cardiology". */}
      <View
        className="flex-row items-center gap-xs"
        style={{ opacity: unavailable ? UNAVAILABLE_CONTENT_OPACITY : 1 }}
        testID={testID ? `${testID}-content` : undefined}
      >
        {icon ? (
          isHealthIcon(icon) ? (
            <Icon name={icon} size={GLYPH} color={contentColor} />
          ) : (
            <Icon chrome={icon} size={GLYPH} color={contentColor} />
          )
        ) : null}

        <Text className={cn("font-label-md text-label-md", s.label)}>{label}</Text>

        {isSelected && showSelectedCheck ? (
          <Icon chrome="check" size={GLYPH} color={contentColor} />
        ) : null}
      </View>
    </Pressable>
  );
}

export type ChoiceChipRowProps = {
  children: React.ReactNode;
  /**
   * Horizontal scroller instead of a wrapping row.
   *
   * Defaults to FALSE (wrap) on purpose: a wrap degrades gracefully if a caller
   * guesses wrong, whereas an unwanted ScrollView silently swallows the row's
   * height and clips it. SignUpStep2's gender row wraps; FindCare's filter row
   * scrolls.
   *
   * A scrollable row applies the 16px gutter as its own CONTENT inset, so it
   * must be placed OUTSIDE the screen's gutter (full-bleed). That is BRAND
   * §"Horizontal strips and carousels": items scroll edge to edge with a
   * trailing inset matching the leading gutter, instead of being clipped at a
   * padded edge. A wrapping row adds no horizontal padding and simply inherits
   * whatever gutter its parent already has.
   */
  scrollable?: boolean;
  testID?: string;
};

export function ChoiceChipRow({ children, scrollable = false, testID }: ChoiceChipRowProps) {
  if (scrollable) {
    return (
      <ScrollView
        horizontal
        // The scrollbar is chrome the frames don't draw, and on Android it
        // overlaps the chips' bottom edge.
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: ROW_GAP, paddingHorizontal: GUTTER, alignItems: "center" }}
        testID={testID}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: ROW_GAP }} testID={testID}>
      {children}
    </View>
  );
}
