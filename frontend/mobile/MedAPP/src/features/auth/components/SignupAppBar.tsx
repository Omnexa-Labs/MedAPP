// Signup app bar + step progress — the approved Figma component
// "Signup AppBar (Back + Stepper + Help)" (file kRifcg1KCEAlTXy4aimotK,
// node 292:607), whose own Figma note reads:
//
//   "Sign-up app bar: back chevron, centred MedApp logo, help button, and a
//    step progress bar beneath. Single axis: Step=1|2|3. The logo follows the
//    Colors mode automatically — the primary and reversed PNG assets are
//    stacked and their opacity is driven by logo/opacity-primary and
//    logo/opacity-reversed, so no Theme variant is required."
//
// Geometry from the node: a 64px bar on `surface` with a 16px inset, a 44px
// back target, the CENTRED logo at 42px, a 44px help target, then an 8px
// stepper track (`outline-variant`, radius/full) with a `primary` fill at
// step/3 (the frame draws 240.667 of the 361px track for step 2).
//
// It lived inline in SignUpStep1Screen until Step 2 was rebuilt against its own
// frame. Two call sites is the extraction threshold in components/ui/README.md,
// so it moved here. It is NOT in components/ui because it is not a presentation
// primitive — it is specific to the sign-up flow and knows about that flow's
// step count.
//
// FLAGGED: this bar CENTRES the logo, while docs/BRAND.md's app-shell rule says
// "logo on the left, do not centre". The bar is its own component in Figma, so
// the frame is followed and the conflict is raised rather than silently
// resolved. Also flagged: the Help button has no destination — no help/support
// route exists anywhere in the app yet.

import { Pressable, View } from "react-native";
import { Icon, Logo } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

/** The sign-up wizard is three steps; the fill is `step / STEP_COUNT`. */
export const STEP_COUNT = 3;

interface Props {
  /** 1-based step, used for the progress fill. */
  step: 1 | 2 | 3;
  onBack: () => void;
  /** Announced by the back control, e.g. "Back to sign in". */
  backLabel: string;
  onHelp?: () => void;
}

export function SignupAppBar({ step, onBack, backLabel, onHelp }: Props) {
  // Icon colours can't be Tailwind classes (react-native-svg / MaterialIcons
  // take a colour string), so they're resolved by token name for the mode.
  const onSurface = useTokenColor("on-surface");
  const primary = useTokenColor("primary");

  return (
    <View className="w-full bg-surface">
      {/* Bar (292:586) — 64px, 16px inset. */}
      <View className="h-16 w-full flex-row items-center justify-between px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          className="h-11 w-11 items-center justify-center"
          onPress={onBack}
        >
          <Icon chrome="chevron-left" size={24} color={onSurface} />
        </Pressable>

        {/* The bar follows the theme, so the logo does too — no explicit
            variant (docs/BRAND.md). The frame stacks the primary and reversed
            PNGs and cross-fades them by mode; <Logo> resolves the same thing
            with its default "auto". */}
        <Logo height={42} />

        {/* FLAGGED: no help/support route exists yet. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Help"
          className="h-11 w-11 items-center justify-center"
          onPress={onHelp}
        >
          <Icon chrome="help-outline" size={24} color={primary} />
        </Pressable>
      </View>

      {/* Stepper (292:593) — 8px track, radius/full, step/3 filled. */}
      <View
        className="w-full flex-row items-center px-4"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: STEP_COUNT, now: step }}
        accessibilityLabel={`Step ${step} of ${STEP_COUNT}`}
      >
        <View className="h-2 flex-1 flex-row overflow-hidden rounded-full bg-outline-variant">
          <View
            className="h-2 rounded-full bg-primary"
            style={{ width: `${(step / STEP_COUNT) * 100}%` }}
          />
        </View>
      </View>
    </View>
  );
}
