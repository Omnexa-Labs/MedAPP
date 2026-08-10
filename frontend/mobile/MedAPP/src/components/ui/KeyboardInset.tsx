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
// NO SAFE-AREA SUBTRACTION, and that was a deliberate removal. A first version
// took a `subtractBottomInset` prop and called `useSafeAreaInsets()` for screens
// whose shell reserves the gesture bar. Nothing passed it — every current caller
// sits in a shell with `claimsBottomInset={false}` — and the hook made this
// component REQUIRE a SafeAreaProvider, which broke two booking suites that
// render without one. An unused option that imposes a context requirement is a
// bad trade; add it back with a caller when a screen actually needs it.
//
// Animated rather than a state update on a keyboard event: `useAnimatedKeyboard`
// tracks the IME frame-by-frame on the UI thread, so the composer travels WITH
// the keyboard instead of snapping after it lands.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// None is used — reanimated and safe-area-context only.

import type { ReactNode } from "react";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";

interface Props {
  children: ReactNode;
  className?: string;
  testID?: string;
}

export function KeyboardInset({ children, className, testID }: Props) {
  const keyboard = useAnimatedKeyboard();

  const style = useAnimatedStyle(() => {
    // Clamped at 0 — `height` should never be negative, but a floor costs
    // nothing and a negative padding would push content off-screen.
    return { paddingBottom: Math.max(keyboard.height.value, 0) };
  });

  return (
    <Animated.View style={[{ flex: 1 }, style]} className={className} testID={testID}>
      {children}
    </Animated.View>
  );
}
