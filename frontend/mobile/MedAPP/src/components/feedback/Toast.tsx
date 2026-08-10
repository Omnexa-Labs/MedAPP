// The ONE transient status chip. src/components/feedback/README.md has named
// `Toast` as this directory's job since it was created; this is it arriving.
//
// WHY IT IS SHARED RATHER THAN LOCAL
// It is extracted verbatim from ActiveScriptViewScreen, which owned the only
// implementation: an Animated.Value pair, a 220ms fade+slide, a 3s timer, and an
// inverse-surface pill. Wiring real downloads gave a second screen (Overview) the
// same need, and a second hand-rolled copy is exactly the drift the ui/ barrel
// notes complain about six times over. Timings, geometry and colour roles are
// unchanged from the original so nothing the user sees moved.
//
// WHY IT IS `message`-DRIVEN AND NOT `visible`-DRIVEN
// The screen it came from could only ever say one thing, so a fire-and-forget
// `show()` was enough. A download reports one of four outcomes, and the copy is
// the state — a boolean plus a separately-stored string can disagree, and the
// version that disagrees is the one that says "saved" after a write failed.
// Setting `message` to null hides it; there is no other way to hide it.
//
// Not a touch target: `pointerEvents="none"`, so BRAND's 44pt floor doesn't
// apply and it can never swallow a tap meant for the button underneath. It is
// announced instead, via `accessibilityLiveRegion` (Android) plus a role of
// "alert", so a screen-reader user gets the outcome without a target to find.

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { Icon } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

/** Success is not "everything worked" — it is "the claim in the message is true". */
export type ToastTone = "success" | "error";

export interface ToastProps {
  /** The copy. `null` (or empty) hides the chip. */
  message: string | null;
  tone?: ToastTone;
  /** Called after the auto-dismiss animation; set `message` to null here. */
  onDismiss?: () => void;
  /**
   * Distance from the bottom of the parent, in px.
   *
   * A prop and not a constant because the two hosts differ: a detail screen's
   * shell claims the bottom inset (30 is clear of it), while a tab root has
   * BottomNav floating `absolute bottom-0` over the same 80px band and needs to
   * clear that instead. Getting this wrong parks the chip behind the tab bar.
   */
  bottom?: number;
  /** Auto-dismiss delay. The original screen's 3s. */
  durationMs?: number;
}

const IN_OUT_MS = 220;
const SLIDE_PX = 16;

export function Toast({
  message,
  tone = "success",
  onDismiss,
  bottom = 30,
  durationMs = 3000,
}: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(SLIDE_PX)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The message is held locally so the chip can animate OUT while still showing
  // its text. Clearing the prop alone would blank the words mid-fade.
  const [shown, setShown] = useState<{ message: string; tone: ToastTone } | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: IN_OUT_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: SLIDE_PX, duration: IN_OUT_MS, useNativeDriver: true }),
    ]).start(() => {
      setShown(null);
      onDismiss?.();
    });
  }, [opacity, translateY, onDismiss]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!message) return;

    setShown({ message, tone });
    opacity.setValue(0);
    translateY.setValue(SLIDE_PX);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: IN_OUT_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: IN_OUT_MS, useNativeDriver: true }),
    ]).start();

    timer.current = setTimeout(hide, durationMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, tone, durationMs, hide, opacity, translateY]);

  // An INVERSE surface — a near-black pill in light mode, near-white in dark —
  // which is the M3 pair the original screen already used.
  const inverseSurface = useTokenColor("inverse-surface");
  const inverseOnSurface = useTokenColor("inverse-on-surface");
  const inversePrimary = useTokenColor("inverse-primary");

  if (!shown) return null;

  // The error glyph takes `inverse-on-surface`, NOT `error`. M3 defines no error
  // role for an inverse surface, and the real `error` red (#ba1a1a light) on a
  // near-black pill is the kind of dark-on-dark failure this codebase has already
  // been through once — see ActiveScriptViewScreen's colour-literal notes. The
  // tone is carried by the glyph SHAPE and the copy; nothing here needs red.
  const isError = shown.tone === "error";

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={shown.message}
      style={{
        position: "absolute",
        bottom,
        left: 16,
        right: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        backgroundColor: inverseSurface,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 999,
        opacity,
        transform: [{ translateY }],
      }}
    >
      <Icon
        chrome={isError ? "error-outline" : "check-circle"}
        size={20}
        color={isError ? inverseOnSurface : inversePrimary}
      />
      <Text
        className="font-label-md text-label-md flex-shrink"
        style={{ color: inverseOnSurface }}
      >
        {shown.message}
      </Text>
    </Animated.View>
  );
}

/**
 * The state half, so neither screen hand-rolls it.
 *
 * `show(tone, message)` takes both together for the same reason `<Toast>` does:
 * the copy and the tone are one fact.
 */
export function useToast() {
  const [state, setState] = useState<{ message: string | null; tone: ToastTone }>({
    message: null,
    tone: "success",
  });

  const show = useCallback((tone: ToastTone, message: string) => {
    setState({ tone, message });
  }, []);

  const clear = useCallback(() => {
    setState((prev) => ({ ...prev, message: null }));
  }, []);

  return { ...state, show, clear };
}
