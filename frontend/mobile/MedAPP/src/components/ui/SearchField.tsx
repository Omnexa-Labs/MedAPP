// SearchField — the ONE screen-level search row.
//
// Figma: component set "SearchField" 396:538, variants State=Default (396:525)
// and State=Has query (396:530). The designer's own component description,
// verbatim:
//
//   "Screen search field. 361x52, radius 12, 16px gutter. State=Has query adds
//    a 44x44 clear button. Fill is color/field-surface (the canonical Input
//    treatment) so the field stays visibly recessed from color/card-surface and
//    the page in both modes — never surface-container-lowest, never
//    transparent."
//
// That description is the whole reason this file exists. Five screens had each
// re-derived this row from scratch as a bare <TextInput> and diverged from the
// canonical Input on every axis at once:
//
//   FindCareScreen        h emergent from paddingVertical 14 (not 52);
//                         bg-surface-container-lowest (not the recessed field
//                         role, so field and card are the same colour);
//                         placeholder/glyph/value frozen at #6d7a77/#171d1c, so
//                         in dark mode you type near-black on a dark field;
//                         plus a drop shadow, which BRAND forbids outright.
//   ExploreScreen         same, with placeholderTextColor "#6d7a7799".
//   CommunityHubScreen    same, "#3d4947" — and it is a SIBLING panel of
//                         Explore in the same feature, one bordered-flat and one
//                         borderless-with-shadow. Two hand-rolls of one control,
//                         two different controls.
//                         (Both Community panels were deleted on 2026-08-07 as
//                         unbacked group/follow UI. They stay in this list
//                         because the divergence they document is the reason
//                         this component exists.)
//   InboxScreen           same, "#6d7a77".
//   PhoneField            the country-picker's own search row.
//
// None of the five had Input's focus or error border at all.
//
// THIS IS A COMPOSITION OVER Input, NOT A COPY OF IT, AND NOT A CHANGE TO IT.
// Every piece of the geometry and every colour below comes from `Input` by
// import: the 52pt height, `radius/12`, the 16px gutter, `bg-field-surface`, the
// tokenised outline-variant/primary/error border, `on-surface` for the typed
// value and `on-surface-variant` for the placeholder and the leading glyph. This
// file adds exactly two things Input does not have — the search glyph and the
// Has-query clear button — and nothing else. If a metric here disagrees with
// Input, Input wins, because a second definition of the field is the drift this
// component exists to end.
//
// Deviations from 396:538, disclosed rather than silently absorbed:
//
//   frame gap 12 -> rendered 8. The gap between the leading glyph and the text
//     lives in Input's own className (`gap-base` = 8px) and Input takes no
//     className, so composition cannot reach it. Both 8 and 12 are on BRAND's
//     spacing scale; 8 is what every other field in the app already renders, so
//     matching Input is the lesser drift. FLAGGED for the designer: either
//     396:538 drops to 8 to match the canonical Input, or Input moves to 12 and
//     every field moves with it — but not one field at 12 and the rest at 8.
//   frame Has-query pr 4 -> Input's fixed px-4 (16) plus a -12 pull on the clear
//     button, see CLEAR_PULL below.
//   frame text leading 22 -> Input's 22.4 (body-md 16 x 1.4 leading, BRAND's
//     ramp). 0.4px, and the ramp is binding.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. None is used — the glyphs go through the shared <Icon />, which is the
// only file permitted to touch an icon library.

import { Pressable, View } from "react-native";
import { useTokenColor } from "@/lib/tokens";
import { Icon } from "./icons/Icon";
import { Input } from "./Input";

/** 396:525 / 396:530 draw the leading glyph at 20, matching Input's own. */
const GLYPH = 20;

/**
 * 396:535 is named "clear-button (44x44)" in the frame — the designer sized the
 * target, not just the glyph, so this is the frame's number AND the hard floor
 * from docs/MOBILE_UX.md ("never ship a 36pt tap area"). The hand-rolled copies
 * drew this at ~36.
 */
const CLEAR_TARGET = 44;

/**
 * Reconciles the frame's `pr-4` (4px) on State=Has query with Input's fixed
 * `px-4` (16px) gutter.
 *
 * The frame tightens the right inset precisely so a 44pt target does not shove
 * the glyph 38px in from the edge; at pr-4 the glyph centre sits 26px in. Input
 * owns the padding and exposes no override, so the 12px difference is taken back
 * on the button instead. This does NOT shrink the touch target — a negative
 * margin moves the 44x44 box, it does not resize it, which is why the pull lives
 * here and not in the button's own size.
 */
const CLEAR_PULL = -12;

export type SearchFieldProps = {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Fired by the keyboard's search key. */
  onSubmit?: () => void;
  /**
   * Called by the clear affordance, which appears whenever `value` is non-empty
   * (Figma's State=Has query). OPTIONAL BY DESIGN: when it is omitted the button
   * still renders and still clears, via `onChangeText("")`. A search field that
   * silently loses its clear button because a call site forgot one prop is how
   * the sixth private copy gets written.
   */
  onClear?: () => void;
  /**
   * Trigger mode. `false` renders a non-editable field that navigates on press —
   * the dashboard "search" entry point that opens the real search screen. It is
   * a real Pressable with `accessibilityRole="button"`, not a field a user can
   * fail to type into.
   */
  editable?: boolean;
  onPress?: () => void;
  autoFocus?: boolean;
  hasError?: boolean;
  /**
   * Screen-reader name. RN does not associate a sibling heading with a
   * TextInput, so the field needs its own — same contract as Input. Defaults to
   * "Search" so no field is ever announced nameless, but call sites should say
   * what is being searched ("Search the care directory").
   */
  accessibilityLabel?: string;
  /**
   * Lands on the interactive node: the TextInput in editable mode, the Pressable
   * in trigger mode.
   */
  testID?: string;
};

export function SearchField({
  value,
  onChangeText,
  placeholder = "Search",
  onSubmit,
  onClear,
  editable = true,
  onPress,
  autoFocus,
  hasError,
  accessibilityLabel = "Search",
  testID,
}: SearchFieldProps) {
  // Resolved by TOKEN NAME for the mode being rendered, never as a literal.
  // `on-surface-variant` is the pair Input uses for its placeholder and leading
  // glyph, and matching it is the point: the five hand-rolls each froze this at
  // a light-mode hex, which is the drift the tests next door assert against.
  const glyphColor = useTokenColor("on-surface-variant");

  // Figma models the clear button ONLY on the editable field. A trigger has no
  // keyboard, so there is nothing for the user to have typed and nothing to
  // clear — the press target is the whole row.
  const showClear = editable && value.length > 0;

  const field = (
    <Input
      // chrome, not a Health Icon: the frame's layer is "icon/chrome-search",
      // and BRAND records that Health Icons ships no UI chrome glyph for search.
      icon="search"
      hasError={hasError}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      accessibilityLabel={accessibilityLabel}
      editable={editable}
      autoFocus={autoFocus}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
      onSubmitEditing={onSubmit}
      // iOS would otherwise draw its own clear affordance on top of 396:535,
      // giving one field two clear buttons in one corner.
      clearButtonMode="never"
      testID={editable ? testID : undefined}
      // In trigger mode the wrapping Pressable owns the accessible node, so the
      // inner field must not be reachable or announced separately.
      focusable={editable}
      importantForAccessibility={editable ? "auto" : "no-hide-descendants"}
      trailing={
        showClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            // Clearing works whether or not the caller passed `onClear` — see
            // the prop's doc comment.
            onPress={() => (onClear ? onClear() : onChangeText(""))}
            className="items-center justify-center active:opacity-70"
            style={{ width: CLEAR_TARGET, height: CLEAR_TARGET, marginRight: CLEAR_PULL }}
          >
            <Icon chrome="close" size={GLYPH} color={glyphColor} />
          </Pressable>
        ) : undefined
      }
    />
  );

  if (editable) return field;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      className="w-full active:opacity-70"
    >
      {/* `pointerEvents="none"` keeps the non-editable TextInput from becoming
          the touch responder, so the whole 52pt row presses as one button
          rather than only its padding. */}
      <View pointerEvents="none">{field}</View>
    </Pressable>
  );
}
