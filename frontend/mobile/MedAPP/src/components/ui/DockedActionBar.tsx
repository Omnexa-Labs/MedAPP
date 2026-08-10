// DockedActionBar — the bar pinned to the bottom edge that carries a screen's
// commit action.
//
// Figma: component set `DockedActionBar` 781:2291, variants `Buttons=Single`
// (781:2281, 393x88) and `Buttons=Pair` (781:2283, 393x115), footnote 781:2287.
//
//   root      absolute bottom/left/right, its OWN <SafeAreaView edges={["bottom"]}>
//   bar       fill `color/surface`, 1px top `color/outline-variant`,
//             px 16, pt 12, pb 20 ABOVE the inset
//   single    one 56-tall button, radius/12, full width
//   pair      row, gap 16, both flex-1 (172.5 each), left outline / right primary
//   footnote  centred row, gap 4, 12 below the buttons — 14px lock glyph
//             `on-surface-variant` + label-sm
//
// ONE ANSWER TO A QUESTION THE FLOW ANSWERED THREE TIMES. The docked CTA ships as
// `borderRadius: 999` on screen 1, `borderRadius: 12` at ~48 tall on screen 2, and
// `borderRadius: 16` at 56 on screen 3 — three radii and two heights for one
// control in one flow, and 48 is under the frame's 56. The frames say radius/12 at
// 56 everywhere. Because every button here is >=56, the 44pt floor is met by
// construction rather than by each screen remembering it.
//
// THE TRUST LINE LIVES HERE, NOT ON THE PAGE. "Secure encrypted checkout" is
// 781:2287, a child of the BAR. ReviewAppointmentScreen renders it as a free
// floating <View> at the bottom of the scroll body, which means it scrolls away
// from the button it is a reassurance about — and it is only reassuring while the
// button is visible.
//
// WHY THE SAFE AREA IS INSIDE THIS COMPONENT. The bar's `surface` fill must run
// UNDER the gesture bar, so the component claims the bottom inset itself and its
// screen passes `claimsBottomInset={false}` to DetailShell (see DetailShell.tsx,
// which names SelectTimeSlotScreen as exactly this case). If both claimed it the
// padding doubles. Screen 2 gains a docked bar in this pass and must therefore
// start passing that prop too.
//
// The inset is applied by SafeAreaView to ITSELF, and the 20pt bottom padding sits
// on an inner view, so the two add rather than one silently replacing the other.
//
// NO SHADOW. A bar is not a floating surface — it is chrome attached to an edge,
// and docs/BRAND.md's sanctioned floating roles are sheet, menu, dialog, toast.
// The 1px top hairline is the separation, the same way a card's is.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// This file uses none (react-native-safe-area-context is not an expo-* module).

import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTokenColor } from "@/lib/tokens";
import { Button } from "./Button";
import { Icon, type ChromeIconName } from "./icons/Icon";

/** 781:2287 — the footnote glyph is 14, below the dense-row 20 because it is a
 *  caption ornament rather than an icon in a row of its own. */
const FOOTNOTE_GLYPH = 14;

export type DockedActionBarProps = {
  primary: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    trailingIcon?: ChromeIconName;
  };
  /** Present => the `Buttons=Pair` variant. Rendered on the LEFT, as `outline`. */
  secondary?: { label: string; onPress: () => void; disabled?: boolean };
  /** The trust line, 781:2287. */
  footnote?: { label: string; icon?: ChromeIconName };
  testID?: string;
};

export function DockedActionBar({ primary, secondary, footnote, testID }: DockedActionBarProps) {
  const footnoteColor = useTokenColor("on-surface-variant");

  return (
    <View className="absolute bottom-0 left-0 right-0" testID={testID}>
      <SafeAreaView edges={["bottom"]} className="border-t border-outline-variant bg-surface">
        {/* Padding on an inner view so SafeAreaView's own bottom inset ADDS to
            the 20pt rather than being overwritten by it. */}
        <View className="px-4 pb-5 pt-3">
          {secondary ? (
            <View className="w-full flex-row items-center gap-4">
              <View className="flex-1">
                <Button
                  label={secondary.label}
                  variant="outline"
                  size="docked"
                  pill={false}
                  fullWidth
                  disabled={secondary.disabled}
                  onPress={secondary.onPress}
                />
              </View>
              <View className="flex-1">
                <Button
                  label={primary.label}
                  variant="primary"
                  size="docked"
                  pill={false}
                  fullWidth
                  loading={primary.loading}
                  disabled={primary.disabled}
                  trailingIcon={primary.trailingIcon}
                  onPress={primary.onPress}
                />
              </View>
            </View>
          ) : (
            <Button
              label={primary.label}
              variant="primary"
              size="docked"
              pill={false}
              fullWidth
              loading={primary.loading}
              disabled={primary.disabled}
              trailingIcon={primary.trailingIcon}
              onPress={primary.onPress}
            />
          )}

          {footnote ? (
            <View
              accessible
              accessibilityLabel={footnote.label}
              className="mt-3 w-full flex-row items-center justify-center gap-1"
            >
              {/* Decorative — the words beside it say the same thing. */}
              <Icon chrome={footnote.icon ?? "lock"} size={FOOTNOTE_GLYPH} color={footnoteColor} />
              <Text className="font-label-sm text-label-sm text-on-surface-variant">
                {footnote.label}
              </Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}
