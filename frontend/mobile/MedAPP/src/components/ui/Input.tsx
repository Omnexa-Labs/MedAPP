// Input — the bordered text field used by the auth screens and HomeScreen's
// search row.
//
// Geometry comes from the approved Figma "Login" frame (file
// kRifcg1KCEAlTXy4aimotK, node 57:115 / 57:127): 52px tall, `radius/12`,
// `spacing/16` horizontal inset, 8px gap between the leading icon, the field
// and the trailing slot, 1px `outline-variant` hairline.
//
// FILL: `bg-field-surface`, the surface ROLE declared in global.css. The field
// used to have NO fill at all, which is half of why the auth forms read cheap —
// an unfilled field inside an unseparated card is just a rounded outline
// floating on the page, with nothing marking where the input actually is. The
// role is one step RECESSED from `card-surface` in both modes, and the alias
// points the opposite way per mode on purpose:
//
//   mode   card (`card-surface`)   field (`field-surface`)
//   light  #FFFFFF                 #DFF1EE  (primary-tint — a teal-tinted well)
//   dark   #242B2A                 #090F0E  (surface-container-lowest)
//
// Do not "simplify" this to one fixed token: in light the field has to go
// DARKER than the card and in dark it has to go darker than a card that itself
// stepped up, so a single step can't serve both. Content pairs are the same in
// both roles and modes — `on-surface` for the value, `on-surface-variant` for
// the placeholder and the leading icon.
//
// Focus/error border colours are driven imperatively because NativeWind can't
// reliably style `focus:` on a bare TextInput — so they're resolved BY TOKEN
// NAME for the current mode via lib/tokens.ts rather than hardcoded hexes,
// which would freeze the field in light-mode colours (docs/BRAND.md).
//
// The leading icon goes through the shared <Icon /> component; this file must
// not import an icon library directly. `icon` still takes the same
// MaterialIcons chrome names call sites already pass, so the API is unchanged.
//
// ACCESSIBILITY: RN does not associate a sibling <Text> label with a TextInput
// the way an HTML <label for> does, so a visible "Email Address" heading gives
// the field no programmatic name. Call sites MUST pass `accessibilityLabel`
// (and `accessibilityHint` with the validation message when `hasError`). The
// placeholder is used as a last-resort fallback so no field is ever announced
// nameless, but it is a fallback, not the intended API.

// MULTILINE (added for the booking flow's Reason for Visit field, Figma
// 757:4814 — 361x96). The single-line row is a fixed `h-[52px]` with
// `items-center`; a growing field needs a MINIMUM height, top-aligned content and
// its own vertical inset, or the first line renders vertically centred in a 96px
// box and the caret jumps as the user types. Three changes, no new component:
// `minHeight: 96`, `items-start` + `py-3`, and `textAlignVertical: "top"` (which
// Android needs explicitly — iOS top-aligns multiline input already).
//
// The focus treatment is UNCHANGED: 2px `primary`. Frame 758:2091 draws exactly
// that on the focused Reason field, so this is the design confirming existing
// behaviour rather than changing it.

import { useState } from "react";
import { TextInput, View } from "react-native";
import { cn } from "@/lib/cn";
import { useResolvedScheme } from "@/lib/theme";
import { tokenColor } from "@/lib/tokens";
import { Icon, type ChromeIconName } from "./icons/Icon";

export type InputProps = React.ComponentProps<typeof TextInput> & {
  /** Leading UI-chrome glyph (mail, lock, person …). Optional. */
  icon?: ChromeIconName;
  /**
   * Arbitrary leading slot, for the frames whose leading glyph is a CLINICAL
   * Health Icon rather than chrome — e.g. `icon/appointment` on the sign-up
   * Date of Birth field (node 326:697). Pass `<Icon name="…" size={20} />`.
   * Ignored when `icon` is set; the frames never draw both.
   */
  leading?: React.ReactNode;
  hasError?: boolean;
  trailing?: React.ReactNode;
};

/** Figma 757:4814 — the Reason field is 96 tall. A floor, so the field can grow. */
const MULTILINE_MIN_HEIGHT = 96;

export function Input({
  icon,
  leading,
  hasError,
  trailing,
  multiline,
  ...inputProps
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const { scheme } = useResolvedScheme();
  const borderColor = tokenColor(
    hasError ? "error" : focused ? "primary" : "outline-variant",
    scheme,
  );
  const iconColor = tokenColor("on-surface-variant", scheme);

  return (
    <View
      className={cn(
        "w-full flex-row gap-base rounded-md bg-field-surface px-4",
        multiline ? "items-start py-3" : "h-[52px] items-center",
      )}
      style={{
        borderWidth: focused ? 2 : 1,
        borderColor,
        ...(multiline ? { minHeight: MULTILINE_MIN_HEIGHT } : null),
      }}
    >
      {icon ? <Icon chrome={icon} size={20} color={iconColor} /> : leading}
      <TextInput
        {...inputProps}
        multiline={multiline}
        accessibilityLabel={inputProps.accessibilityLabel ?? inputProps.placeholder}
        // RN's equivalent of aria-invalid: the only way to tell a screen reader
        // the field failed validation, since the error <Text> below is a
        // sibling, not a programmatically linked description.
        aria-invalid={hasError ?? false}
        placeholderTextColor={iconColor}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        style={{
          flex: 1,
          color: tokenColor("on-surface", scheme),
          // `body-md` = 16px x 1.4 leading (Figma 57:112) = 22.4. Set inline
          // rather than via a `leading-*` class because src/lib/cn.ts has no
          // tailwind-merge, so a leading utility competing with the ramp's own
          // line height resolves by stylesheet order rather than intent.
          fontSize: 16,
          lineHeight: 22.4,
          // Android centres multiline text in the field's box without this; iOS
          // already top-aligns. Harmless on the single-line path.
          ...(multiline ? { textAlignVertical: "top" as const } : null),
        }}
      />
      {trailing}
    </View>
  );
}
