// KeyboardInset — a container that actually gets out of the keyboard's way.
//
// ---------------------------------------------------------------------------
// WHY KeyboardAvoidingView STOPPED WORKING, MEASURED ON DEVICE
// ---------------------------------------------------------------------------
// Reported: "when a bottom input like the chat input is active the keyboard
// overlays it" — on EVERY screen with a bottom-anchored input.
//
// Thirteen files already used `KeyboardAvoidingView`, so the screens were trying.
// The first fix was to give Android a `behavior` (it had `undefined`, meaning the
// KAV did nothing there). A screenshot of the running app with the keyboard up
// proved that insufficient: the composer was ABSENT and the message list was
// clipped mid-sentence exactly at the keyboard's top edge — the layout had not
// moved at all.
//
// The reason is structural. `KeyboardAvoidingView` infers the keyboard from a
// WINDOW RESIZE. Under SDK 55's default Android edge-to-edge the window is no
// longer resized when the IME opens, so there is nothing for it to infer from and
// no `behavior` value can rescue it. It is not misconfigured; its input signal is
// gone.
//
// ---------------------------------------------------------------------------
// WHY REANIMATED AND NOT react-native-keyboard-controller
// ---------------------------------------------------------------------------
// `react-native-keyboard-controller` is the usual recommendation and would work,
// but it is a THIRD-PARTY NATIVE MODULE: Expo Go does not bundle it, so adopting
// it would make this bug untestable without a development build — on the one
// device we can actually reproduce it on.
//
// `react-native-reanimated` (4.2.1) is already a dependency, is bundled in Expo
// Go, and `useAnimatedKeyboard()` reads the IME inset from the platform directly
// — the same signal keyboard-controller uses. Same mechanism, no new native
// dependency, verifiable today. If this project later gains a development build
// and needs the extra surface (keyboard-follow gestures, toolbars), migrating is
// a contained change because every call site goes through this one component.
//
// ---------------------------------------------------------------------------
// HOW IT WORKS, AND THE ONE SUBTLETY
// ---------------------------------------------------------------------------
// The keyboard's height is applied as `paddingBottom` on a flex-1 container, so
// the content column shrinks and a bottom-anchored child rides up with it. That
// matches what the old KAV was TRYING to do with `behavior="padding"`.
//
// The subtlety is the safe-area inset. Under edge-to-edge, a screen that already
// reserves the bottom inset (for the gesture bar) would double-count it once the
// keyboard is open — the keyboard covers the gesture bar, so that reservation is
// no longer needed. `subtractBottomInset` handles that: pass it when the parent
// claims the bottom inset itself. The value is clamped at 0 so a small keyboard
// on a large inset can never produce negative padding.
//
// Animated rather than a state update on a keyboard event: `useAnimatedKeyboard`
// tracks the IME frame-by-frame on the UI thread, so the composer travels WITH
// the keyboard instead of snapping after it lands.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// None is used — reanimated and safe-area-context only.

import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";

interface Props {
  children: ReactNode;
  /**
   * True when the PARENT already reserves the bottom safe-area inset. The
   * keyboard covers the gesture bar, so that reservation must come back off
   * while it is open or the composer floats above the keyboard by the inset.
   */
  subtractBottomInset?: boolean;
  className?: string;
  testID?: string;
}

export function KeyboardInset({
  children,
  subtractBottomInset = false,
  className,
  testID,
}: Props) {
  const keyboard = useAnimatedKeyboard();
  const insets = useSafeAreaInsets();

  const style = useAnimatedStyle(() => {
    const inset = subtractBottomInset ? insets.bottom : 0;
    // Clamped: a keyboard shorter than the inset must not push content DOWN.
    const padding = Math.max(keyboard.height.value - inset, 0);
    return { paddingBottom: padding };
  });

  return (
    <Animated.View style={[{ flex: 1 }, style]} className={className} testID={testID}>
      {children}
    </Animated.View>
  );
}
