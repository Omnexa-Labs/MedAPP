// Button — the shared CTA used by the auth, splash and booking screens.
//
// `variant="primary"` is the shape the approved Figma frames use for a primary
// call to action (e.g. Splash node 51:114):
//   w-full flex-row items-center justify-center gap-base rounded-full
//   bg-primary py-4  (+ a soft teal shadow, active:scale)
// The secondary/outline/ghost variants cover the rest of the component spec.
//
// RN notes:
//  - Press colours go through the Pressable `style` callback, since NativeWind
//    can't drive `active:bg-*` on a shadowed filled surface. The callback needs
//    real colour strings, so they're resolved by TOKEN NAME for the current
//    mode via src/lib/tokens.ts — never as literals, which would freeze the
//    button in light-mode colours while its `text-on-*` label flipped.
//  - Icons go through the shared <Icon /> component; this file must not import
//    an icon library (docs/BRAND.md — Icon.tsx is the only place that does).
//  - `active:scale-[0.98]` stays a className — that one works through NativeWind.

import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";
import { cn } from "@/lib/cn";
import { useResolvedScheme } from "@/lib/theme";
import { blendTokens, tokenColor, tokenShadow, type ColorToken } from "@/lib/tokens";
import { Icon, type ChromeIconName } from "./icons/Icon";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
/**
 * `cta` is the height the approved Figma frames use for a primary call to
 * action (16px vertical inset, ~48px tall). `lg`/`md` are the older Stitch
 * heights kept so existing screens don't shift until their frames are rebuilt.
 *
 * `docked` is 56, the height EVERY button in the booking frames draws — the
 * `DockedActionBar` pair and single (781:2281 / 781:2283), the discard dialog's
 * stacked pair (756:4765), the no-data "Start again" (756:4813) and the two
 * inline actions on the confirmation screen (756:4742). The three existing sizes
 * top out at 48, so those frames had no legal size and each screen invented one:
 * the flow shipped `borderRadius: 999`, `borderRadius: 12` at ~48 and
 * `borderRadius: 16` at 56 for what is one control. `cta` is deliberately NOT
 * changed to 56 — it is the auth/splash CTA and its frames still draw 48.
 */
export type ButtonSize = "md" | "lg" | "cta" | "docked";

interface Props extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fills the parent width (the auth CTA default). */
  fullWidth?: boolean;
  /** Rounded-full pill (default) vs rounded-md. Auth submit uses rounded-md. */
  pill?: boolean;
  loading?: boolean;
  /**
   * Overrides the variant's default elevation. `primary` carries the soft teal
   * `elevation/cta` shadow because that's what the Splash frame draws, but not
   * every approved frame does — the Login CTA (node 57:140) has no effect at
   * all — so a frame that draws a flat CTA passes `shadow={false}` instead of
   * silently inheriting an elevation the design never specified.
   */
  shadow?: boolean;
  leadingIcon?: ChromeIconName;
  trailingIcon?: ChromeIconName;
  /**
   * Arbitrary leading slot, for a glyph that is NOT UI chrome — specifically a
   * third-party brand mark on a social sign-in button:
   * `leading={<BrandMark name="google" />}`.
   *
   * Additive: `leadingIcon` still works exactly as before. This exists because
   * the Google mark is four-colour vendor artwork and can never come from an
   * icon font, so `leadingIcon`'s ChromeIconName type cannot express it — which
   * is how the buttons ended up with MaterialIcons' `g-mobiledata`. Ignored when
   * `leadingIcon` is also set; a button never draws both.
   */
  leading?: React.ReactNode;
  className?: string;
}

/**
 * Per-variant tokens. `container`/`text` are Tailwind classes (NativeWind
 * themes those for free); `fill` and `content` are TOKEN NAMES, resolved to the
 * current mode's value at render because they feed the `style` callback and the
 * Icon `color` prop, which only take strings.
 *
 * `fill: null` means "leave the parent surface showing through" — per BRAND.md
 * a transparent container must not be given a raw white/black fill. Those
 * variants press via scale + the state layer over `surface`.
 */
const VARIANT: Record<
  ButtonVariant,
  { container: string; text: string; content: ColorToken; fill: ColorToken | null; shadow: boolean }
> = {
  primary: {
    container: "bg-primary",
    text: "text-on-primary",
    content: "on-primary",
    fill: "primary",
    shadow: true,
  },
  secondary: {
    container: "bg-secondary-container",
    text: "text-on-secondary-container",
    content: "on-secondary-container",
    fill: "secondary-container",
    shadow: false,
  },
  outline: {
    container: "border border-outline-variant bg-surface",
    text: "text-on-surface",
    content: "primary",
    fill: null,
    shadow: false,
  },
  ghost: {
    container: "bg-transparent",
    text: "text-primary",
    content: "primary",
    fill: null,
    shadow: false,
  },
};

/**
 * Material 3's pressed state-layer opacity. Applied as `content` over `fill`,
 * so every variant darkens/lightens in the right direction in both modes
 * instead of needing a hand-picked pressed colour per variant per mode.
 */
const PRESSED_STATE_LAYER = 0.12;

// Vertical inset per size. `cta` is the approved Figma CTA (16px = `py-4`).
const SIZE_PADDING = { md: "py-sm", lg: "py-md", cta: "py-4", docked: "py-4" } as const;
const SIZE_PADDING_X = { md: "px-md", lg: "px-lg", cta: "px-md", docked: "px-md" } as const;

/**
 * `docked`'s 56, as a FLOOR rather than a fixed height.
 *
 * At the default font scale `py-4` + a label-md line box measures ~50, so the
 * minimum is what produces the frame's 56 and the label sits centred inside it.
 * At a large OS font scale the button grows past 56 instead of clipping its
 * label — docs/MOBILE_UX.md: "Test at 393pt wide *and* at a large font scale".
 * A fixed `height: 56` is what the screens hardcoded, and it is what clips.
 *
 * It lives in the style callback, not a class, because Tailwind's `min-h-*`
 * spacing scale is version-dependent and this number must not be.
 */
const DOCKED_MIN_HEIGHT = 56;

/**
 * The CTA's elevation, matching Figma's `elevation/floating` effect style
 * (`S:8ff24f17…`) which the approved `Get Started Button` 51:114 now carries:
 * `0 1px 2px` at 8% plus `0 2px 6px` at 6%, both tinted `elevation/shadow-floating-*`,
 * which resolves to the `shadow` token (`#0d1a17`).
 *
 * It used to be `{ y: 4, blur: 12, opacity: 0.24 }` tinted `primary` — that was
 * the frame's OLD value, and it made the shared Button the last elevated
 * non-floating surface in the app after the legacy shadow sweep removed 88
 * card and app-bar shadows. A 24% brand-tinted shadow over 12px of blur is the
 * same dated signature BRAND removed from cards; a floating control gets the
 * tight, near-neutral pair instead.
 *
 * RN takes a single drop shadow, not Figma's two layers, so this collapses them
 * the same way the nine surviving floating surfaces in `src/features/` do:
 * the ambient layer's geometry at the key layer's opacity. Keeping one number
 * here and in those screens is deliberate — two conventions for "floating"
 * would be the next drift.
 */
const CTA_SHADOW = { y: 2, blur: 6, opacity: 0.08 } as const;

export function Button({
  label,
  variant = "primary",
  size = "lg",
  fullWidth = true,
  pill = true,
  loading = false,
  shadow,
  leadingIcon,
  trailingIcon,
  leading,
  disabled,
  className,
  ...pressableProps
}: Props) {
  const v = VARIANT[variant];
  const elevated = shadow ?? v.shadow;
  const { scheme } = useResolvedScheme();
  const bg = v.fill ? tokenColor(v.fill, scheme) : "transparent";
  const bgPressed = blendTokens(v.fill ?? "surface", v.content, PRESSED_STATE_LAYER, scheme);
  // Icons and the spinner sit on the button's fill, so they take the fill's
  // matching `on-*` token rather than a literal.
  const contentColor = tokenColor(v.content, scheme);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      className={cn(
        "flex-row items-center justify-center gap-base active:scale-[0.98]",
        pill ? "rounded-full" : "rounded-md",
        SIZE_PADDING[size],
        // Horizontal padding only matters when the button hugs its content;
        // a full-width button centres its label, so px is redundant there.
        !fullWidth && SIZE_PADDING_X[size],
        fullWidth ? "w-full" : "self-start",
        v.container,
        className,
      )}
      style={({ pressed }) => ({
        opacity: isDisabled ? 0.6 : 1,
        backgroundColor: pressed ? bgPressed : bg,
        ...(size === "docked" ? { minHeight: DOCKED_MIN_HEIGHT } : null),
        // `shadow`, not `primary` — see CTA_SHADOW. A brand-tinted glow reads as
        // a colour effect; the near-neutral token reads as elevation.
        ...(elevated ? tokenShadow("shadow", CTA_SHADOW, scheme) : null),
      })}
      {...pressableProps}
    >
      {/* While loading, a spinner replaces the leading icon; icons are hidden
          so the label (caller-controlled, e.g. "Signing in…") stays put. */}
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : leadingIcon ? (
        <Icon chrome={leadingIcon} size={20} color={contentColor} />
      ) : (
        leading
      )}
      <Text className={cn("font-label-md text-label-md", v.text)}>{label}</Text>
      {trailingIcon && !loading && <Icon chrome={trailingIcon} size={20} color={contentColor} />}
    </Pressable>
  );
}
