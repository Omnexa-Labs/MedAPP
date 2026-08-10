// Sign-in screen — rebuilt against the APPROVED Figma frame "Login"
// (file kRifcg1KCEAlTXy4aimotK, page "Onboarding & Auth", node 57:102).
//
// The previous version was translated from the Stitch HTML before the design
// system existed; per the product owner's call, Figma is the source of truth,
// so the layout, spacing, radii, colours and copy below come from the frame,
// not from the old screen. What was preserved is the behaviour the design
// cannot express: RHF + zod validation, useLogin for the network call,
// useBiometricLogin/useBiometricCapability, the onSuccess side-effect and the
// error copy.
//
// Frame structure (all values read from get_design_context / get_variable_defs,
// not eyeballed):
//   screen      bg `background`, 24px padding, column, centred
//   Header      64px logo tile (radius 24) · "MedApp" headline-lg 24/Manrope
//               Bold `primary` · "Secure Healthcare Access" body-md
//               `on-surface-variant`; 4px gaps
//   Spacer      32
//   Card        <Card> — radius 24, `card-surface` fill, 32px inset, 24px gaps,
//               1px `outline-variant` hairline, and NO drop shadow
//               (docs/BRAND.md: "cards do NOT cast a drop shadow" — the local
//               `CARD_SHADOW` this screen once carried is gone for good)
//     fields    label-md label + 52px input (radius 12, 16px inset,
//               `field-surface` fill)
//     remember  <ConsentRow> — 20px checkbox (radius 4, 1.5px hairline),
//               12px gap, label-md, aligned to the label's first line
//     CTA       56px, radius 12, `primary` fill, arrow-right 20
//     divider   1px hairlines + "OR CONTINUE WITH" label-sm `on-surface-variant`
//     biometric two flex-1 tiles, radius 24, 12px inset, `field-surface` fill
//   Spacer      48
//   Footer      signup row · HIPAA badge · Privacy/Terms links
//               (all tertiary type on `on-surface-variant`)
//
// The card, the field fill and the consent row now come from the shared
// primitives (`<Card>`, `<Input>`, `<ConsentRow>`) rather than being hand-rolled
// here — the recessed-field / hairline-separated-card treatment is a
// design-system concern, not a per-screen one, and hand-rolling it here is what
// let this screen drift (it is how the rejected card shadow got in twice).
//
// Deviations from the frame are marked FLAGGED inline below, and are:
//   1. The frame's Email Input carries an "Eye Toggle Target (44x44)"
//      (I57:115;318:654) identical to the password field's. An email field has
//      nothing to mask, so this is an unoverridden default on the shared Input
//      component instance, not intent — omitted here.
//   2. `radius/4` on the Checkbox conflicts with BRAND's 12/24/full scale. Owned
//      by <ConsentRow> now; still an open designer question.
//   3. Field-level validation, the form-level error banner and the
//      "no enrolled credential" case have no state in the frame.
//   4. FaceID uses the chrome icon fallback — Health Icons has no face glyph.
//   5. The frame has no single-tile biometric variant; a fingerprint-only
//      Android device renders one full-width tile. Undesigned — see the report.
//
// NOT deviations any more (the frame was re-read; the old notes were stale):
//   - the divider label, the HIPAA row and the footer links are
//     `color/on-surface-variant` (#3D4947) in the frame, not `outline-variant`.
//     The old TERTIARY_TEXT mitigation is deleted — there is no contrast
//     conflict left to mitigate (8.9:1).
//   - the Remember Me Row is node 437:1162, an instance of the `ConsentRow`
//     design-system component (434:1161), not the old 57:137.
//
// RN translation rules: no hover/cursor states, the checkbox is a Pressable
// (core RN has no checkbox), and the frame's "filled" inputs are rendered as
// real placeholders.
//
// ACCESSIBILITY (not expressible in the frame, so not a deviation):
//  - Every tappable string — "Forgot Password?", "Sign Up", "Privacy Policy",
//    "Terms of Service" — goes through <TextLink>, which reaches the 44pt
//    minimum target via `hitSlop` rather than padding, because padding would
//    change the frame's metrics (the Password label row and the footer rows are
//    hug-height). `label-sm` is 12px on lineHeight 1, so 16 top + 16 bottom is
//    exactly 44; "Forgot Password?" uses 24/8 so its target doesn't reach into
//    the password field 4px below it.
//  - Both text fields carry an explicit `accessibilityLabel` plus an
//    `accessibilityHint` carrying the validation message, because RN does not
//    associate the visible label <Text> with the TextInput the way <label for>
//    does; <Input> also sets `aria-invalid` from `hasError`.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Link } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  ConsentRow,
  Icon,
  InfoCallout,
  Input,
  Logo,
  type InfoCalloutTone,
  KeyboardInset,
} from "@/components/ui";
import { useResolvedScheme } from "@/lib/theme";
import { useTokenColor } from "@/lib/tokens";
import { ApiError } from "@/types/api";
import { LoginSchema, type LoginFormValues } from "@/features/auth/schema";
import { useLogin } from "@/features/auth/hooks/use-login";
import {
  BiometricLoginAbort,
  useBiometricCapability,
  useBiometricLogin,
} from "@/features/auth/hooks/use-biometric-login";

/**
 * The Card's inset on node 57:112 is `spacing/32`, but the <Card> primitive
 * defaults to `p-md` (24) and src/lib/cn.ts has no tailwind-merge — passing
 * `p-8` in `className` would leave two competing padding utilities whose
 * resolution order NativeWind does not guarantee. The `style` prop is merged
 * last by <Card>, so it wins deterministically.
 *
 * FLAGGED for the Card owner: the primitive should carry the frame's 32px inset
 * (or expose an inset variant) so this override can go away.
 */
const CARD_INSET = 32;

interface Props {
  onSuccess?: () => void;
}

export function SignInScreen({ onSuccess }: Props) {
  const login = useLogin();
  const biometric = useBiometricLogin();
  const biometricCapability = useBiometricCapability();
  const [showPassword, setShowPassword] = useState(false);
  /**
   * The form-level message, WITH ITS REGISTER.
   *
   * It used to be a bare string rendered unconditionally in `error-container` /
   * `on-error-container`, which meant one of the four things that could land in
   * it was mis-typed: "Sign in with your password first to enable biometric." is
   * GUIDANCE about a feature the user has not used yet — nothing has failed, no
   * credential was rejected, and there is nothing to correct. Painting it as an
   * error on the first screen every user meets reports a fault that does not
   * exist, and it devalues the register for the message that follows it, which
   * genuinely is one ("Email or password is incorrect").
   *
   * WHY A TONE RATHER THAN SUPPRESSING IT. The alternative was to show it only
   * after a biometric attempt — but it ALREADY is only shown then: `onBiometric`
   * is the sole writer of the `no_credentials` branch, and the tiles that call it
   * are gated on device capability. So "show it later" would change nothing. What
   * is actually wrong is the styling of a message that has to appear at exactly
   * the moment it appears: the user just tapped Fingerprint and is owed an
   * explanation of why nothing happened. It stays, in the informational register.
   */
  const [formMessage, setFormMessage] = useState<{
    text: string;
    tone: InfoCalloutTone;
  } | null>(null);
  const setFormError = (text: string) => setFormMessage({ text, tone: "error" });
  const setFormNotice = (text: string) => setFormMessage({ text, tone: "info" });
  const clearFormMessage = () => setFormMessage(null);
  const { scheme } = useResolvedScheme();
  // Icon colours can't be Tailwind classes (react-native-svg / MaterialIcons
  // take a colour string), so they're resolved by token name for the mode.
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const primary = useTokenColor("primary");

  // Run the biometric flow. user_cancel is silent (the user changed
  // their mind); refresh_failed clears the stale token and tells the
  // user to use password; biometric_failed shows a non-fatal hint.
  const onBiometric = async (kind: "face" | "fingerprint") => {
    clearFormMessage();
    try {
      await biometric.mutateAsync(kind);
      onSuccess?.();
    } catch (e) {
      if (e instanceof BiometricLoginAbort) {
        if (e.kind === "user_cancel") return; // silent
        if (e.kind === "no_credentials")
          // INFORMATIONAL. There is no stored credential to unlock yet, which is
          // simply where a new device starts. The sentence tells the user what to
          // do next; it is not reporting a failure.
          setFormNotice("Sign in with your password first to enable biometric.");
        else if (e.kind === "biometric_failed")
          setFormError("Biometric not recognised. Try again or use your password.");
        else if (e.kind === "refresh_failed")
          setFormError("Your session expired. Please sign in with your password.");
        return;
      }
      setFormError("Something went wrong. Please try again.");
    }
  };

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
    mode: "onBlur",
  });

  const onSubmit = handleSubmit(async (values) => {
    clearFormMessage();
    try {
      await login.mutateAsync({ email: values.email, password: values.password });
      onSuccess?.();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.isUnauthorized) setFormError("Email or password is incorrect.");
        else if (e.isNetwork) setFormError("Network error. Check your connection.");
        else setFormError(e.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  });

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        {/* KeyboardInset, NOT KeyboardAvoidingView — the KAV infers the keyboard
          from a WINDOW RESIZE that Android edge-to-edge no longer performs, so it
          silently does nothing there. Proven on device on the chat composer. */}
      <KeyboardInset className="flex-1">
          <ScrollView
            // The frame centres its column, but at 393px the content is ~850px
            // tall — taller than the viewport on the target devices — so it has
            // to scroll. `justifyContent: center` here clips the overflow on
            // Android (the footer became unreachable), so the column is
            // top-aligned with the frame's own 24px padding on all sides.
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 24,
              paddingVertical: 24,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="mx-auto w-full max-w-[440px] items-center">
              {/* ---------------- Header (57:107) ---------------- */}
              <View className="w-full items-center gap-xs">
                {/* Logo Tile (57:108) — the real exported brand asset, which is
                    already the teal tile + white mark, clipped to the frame's
                    24px radius. The tile doesn't follow the theme, so the
                    variant is explicit per docs/BRAND.md. */}
                <Logo variant="icon" height={64} className="overflow-hidden rounded-card" />
                <Text className="font-headline-lg-mobile text-headline-lg-mobile text-center text-primary">
                  MedApp
                </Text>
                <Text className="font-body-md text-body-md text-center text-on-surface-variant">
                  Secure Healthcare Access
                </Text>
              </View>

              {/* Spacer xl (57:111) */}
              <View className="h-8" />

              {/* ---------------- Card (57:112) ----------------
                  The <Card> primitive now carries the frame's treatment: radius
                  24, the `card-surface` ROLE (so dark mode steps UP a tone
                  instead of rendering near-black, which is what
                  `bg-surface-container-lowest` did here), the full-strength
                  `outline-variant` hairline and `elevation/card`. Only the 32px
                  inset is overridden — see CARD_INSET. */}
              <Card className="w-full gap-md" style={{ padding: CARD_INSET }}>
                {/* Email Field Group (57:113) */}
                <View className="w-full gap-xs">
                  <Text className="font-label-md text-label-md text-on-surface-variant">
                    Email Address
                  </Text>
                  <Controller
                    control={control}
                    name="email"
                    render={({ field }) => (
                      <Input
                        icon="mail-outline"
                        placeholder="name@example.com"
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect={false}
                        keyboardType="email-address"
                        textContentType="emailAddress"
                        value={field.value ?? ""}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        hasError={!!errors.email}
                        accessibilityLabel="Email Address"
                        accessibilityHint={errors.email?.message}
                      />
                    )}
                  />
                  {/* Field-level validation isn't in the frame (FLAGGED); it's
                      required behaviour, so it's styled on the error token. */}
                  {errors.email && (
                    <Text
                      className="font-label-sm text-label-sm text-error"
                      accessibilityLiveRegion="polite"
                    >
                      {errors.email.message}
                    </Text>
                  )}
                </View>

                {/* Password Field Group (57:123) */}
                <View className="w-full gap-xs">
                  <View className="w-full flex-row items-center justify-between">
                    <Text className="font-label-md text-label-md text-on-surface-variant">
                      Password
                    </Text>
                    {/* Asymmetric on purpose: this row sits only 4px above the
                        52px password input, so a symmetric 16px expansion would
                        eat the top of the field. 24 up lands in the card's 24px
                        group gap (nothing tappable there); 12 + 24 + 8 = 44. */}
                    <TextLink
                      href="/(public)/forgot-password"
                      label="Forgot Password?"
                      className="font-label-sm text-label-sm text-primary"
                      hitSlop={{ top: 24, bottom: 8, left: 12, right: 12 }}
                    />
                  </View>
                  <Controller
                    control={control}
                    name="password"
                    render={({ field }) => (
                      <Input
                        icon="lock-outline"
                        placeholder="Enter your password"
                        autoCapitalize="none"
                        autoComplete="password"
                        autoCorrect={false}
                        secureTextEntry={!showPassword}
                        textContentType="password"
                        value={field.value ?? ""}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        hasError={!!errors.password}
                        accessibilityLabel="Password"
                        accessibilityHint={errors.password?.message}
                        trailing={
                          <Pressable
                            onPress={() => setShowPassword((s) => !s)}
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityLabel={
                              showPassword ? "Hide password" : "Show password"
                            }
                          >
                            <Icon
                              chrome={showPassword ? "visibility-off" : "visibility"}
                              size={20}
                              color={onSurfaceVariant}
                            />
                          </Pressable>
                        }
                      />
                    )}
                  />
                  {errors.password && (
                    <Text
                      className="font-label-sm text-label-sm text-error"
                      accessibilityLiveRegion="polite"
                    >
                      {errors.password.message}
                    </Text>
                  )}
                </View>

                {/* Remember Me Row (437:1162 — an instance of the `ConsentRow`
                    design-system component 434:1161, NOT the old hand-rolled
                    row). <ConsentRow> owns the frame's geometry: 20x20 checkbox
                    at radius 4 with a 1.5px hairline, `spacing/12` gap (the row
                    used to use 8), `counterAxisAlignItems: MIN` via items-start,
                    label always `label-md`, and a 44x44 target from hitSlop.
                    `labelPressable` because this label is inert text — unlike
                    sign-up step 1's, which carries two navigating links. */}
                <Controller
                  control={control}
                  name="rememberMe"
                  render={({ field }) => (
                    <ConsentRow
                      checked={!!field.value}
                      onChange={field.onChange}
                      accessibilityLabel="Remember me"
                      labelPressable
                    >
                      Remember me
                    </ConsentRow>
                  )}
                />

                {/* Form-level message — not in the frame (FLAGGED), kept because
                    the screen has to surface a failed sign-in.

                    Now the shared `InfoCallout` rather than a sixth private
                    tinted box: it owns both registers (`info` = `primary-tint`
                    with a `primary` glyph, `error` = `error-container` with its
                    own `on-` pair), and it always draws a glyph, so the tone is
                    never carried by fill colour alone (docs/BRAND.md §Colour
                    rules, WCAG 1.4.1). The live region moves onto the wrapper so
                    a screen reader still announces the message the moment it
                    appears — the callout renders a plain <Text> otherwise. */}
                {formMessage && (
                  <View className="w-full" accessibilityLiveRegion="polite">
                    <InfoCallout tone={formMessage.tone}>{formMessage.text}</InfoCallout>
                  </View>
                )}

                {/* Log In Button (57:140) — 56px, radius 12, arrow-right.
                    The node carries NO effect, so the elevation the `primary`
                    variant inherits from the Splash frame is opted out of. */}
                <Button
                  testID="signin.submit"
                  className="h-14"
                  size="cta"
                  pill={false}
                  shadow={false}
                  label={isSubmitting ? "Signing in…" : "Log In"}
                  trailingIcon="arrow-forward"
                  loading={isSubmitting}
                  onPress={onSubmit}
                  disabled={isSubmitting}
                />

                {/* Divider (57:144) + Biometric Row (57:148).
                    The frame draws these unconditionally. They are now gated on
                    DEVICE CAPABILITY only (`deviceCapable` = hardware + an
                    enrolled biometric), not on a stored refresh token: gating on
                    the token meant a fresh install or any post-sign-out session
                    showed no biometric affordance on the only screen where a
                    first-time user could discover it, and it made the
                    `no_credentials` branch in onBiometric unreachable. With the
                    tiles rendered, tapping one now produces exactly the copy
                    that branch was written for. Still conditional on hardware,
                    because tapping a tile on an unenrolled device can only fail
                    — the frame has no state for that, which is correct. */}
                {biometricCapability.ready && biometricCapability.deviceCapable && (
                  <>
                    {/* The hairlines ARE `outline-variant` per the frame — that's
                        the token's documented job. The label between them is
                        `on-surface-variant` (#3D4947), which is what the frame
                        actually paints; the old `outline` substitution was
                        working around a value the frame no longer uses. */}
                    <View className="w-full flex-row items-center gap-sm">
                      <View className="h-px flex-1 bg-outline-variant" />
                      <Text className="font-label-sm text-label-sm text-center text-on-surface-variant">
                        OR CONTINUE WITH
                      </Text>
                      <View className="h-px flex-1 bg-outline-variant" />
                    </View>
                    <View className="w-full flex-row items-start gap-sm">
                      {biometricCapability.kinds.includes("face") && (
                        <BiometricTile
                          // FLAGGED: face recognition has no Health Icons glyph
                          // (checked symbols/ and people/), so this is the
                          // documented chrome escape hatch, matching the frame's
                          // `icon/faceid`. Fingerprint below is NOT chrome —
                          // the registry has the real Health Icon.
                          icon={<Icon chrome="face" size={24} color={primary} />}
                          label="FaceID"
                          disabled={biometric.isPending}
                          onPress={() => onBiometric("face")}
                        />
                      )}
                      {biometricCapability.kinds.includes("fingerprint") && (
                        <BiometricTile
                          icon={<Icon name="fingerprint" size={24} color={primary} />}
                          label="Fingerprint"
                          disabled={biometric.isPending}
                          onPress={() => onBiometric("fingerprint")}
                        />
                      )}
                    </View>
                  </>
                )}
              </Card>

              {/* Spacer lg (58:121) */}
              <View className="h-12" />

              {/* ---------------- Footer (58:122) ---------------- */}
              <View className="w-full items-center gap-xs">
                {/* Signup Row (58:123) */}
                <View className="flex-row items-center gap-xs">
                  <Text className="font-body-md text-body-md text-on-surface-variant">
                    Don&apos;t have an account?
                  </Text>
                  <TextLink
                    href="/(public)/sign-up"
                    label="Sign Up"
                    className="font-label-md text-label-md text-primary"
                  />
                </View>

                {/* Spacer xl (58:126) */}
                <View className="h-8" />

                {/* HIPAA Badge Row (58:127). The frame's `icon/shield-check-small`
                    is a domain concept (data security), and the registry already
                    has it — `secure` = healthicons symbols/ui_secure — so this
                    is a real Health Icon, not the chrome fallback. */}
                <View className="flex-row items-center gap-xs">
                  <Icon name="secure" size={16} color={onSurfaceVariant} />
                  <Text className="font-label-sm text-label-sm text-on-surface-variant">
                    HIPAA Compliant &amp; Secure
                  </Text>
                </View>

                {/* Spacer xs (58:132) */}
                <View className="h-1" />

                {/* Links Row (58:133) */}
                <View className="flex-row items-start gap-md">
                  <TextLink
                    href="/(public)/privacy"
                    label="Privacy Policy"
                    className="font-label-sm text-label-sm text-on-surface-variant"
                  />
                  <TextLink
                    href="/(public)/terms"
                    label="Terms of Service"
                    className="font-label-sm text-label-sm text-on-surface-variant"
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardInset>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local primitive. One screen uses it, so it stays local per the house rule in
// components/ui/README.md (extract at 2+ call sites).
// ---------------------------------------------------------------------------

interface BiometricTileProps {
  /**
   * Rendered <Icon /> element rather than a glyph name, because the two tiles
   * come from different sets: Fingerprint is a Health Icon (`name`), FaceID has
   * no Health Icons equivalent and falls back to chrome. The caller passes the
   * already-resolved `primary` colour — the tile sits on `field-surface`.
   */
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * FaceID / Fingerprint tile (57:149, 57:156): flex-1, radius 24, 12px inset.
 *
 * Fill is `field-surface` per the frame — the same recessed role the inputs use.
 * It used to be `bg-surface`, which is the PAGE colour: inside a `card-surface`
 * card the tiles had no fill of their own and read as empty space.
 */
function BiometricTile({ icon, label, onPress, disabled }: BiometricTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{ opacity: disabled ? 0.5 : 1 }}
      className="flex-1 items-center justify-center gap-xs rounded-card border border-outline-variant bg-field-surface p-3 active:scale-[0.98]"
    >
      {icon}
      <Text className="font-label-sm text-label-sm text-on-surface-variant">{label}</Text>
    </Pressable>
  );
}

/**
 * Default expansion for an inline link. The smallest tappable string on this
 * screen is `label-sm` = 12px text on a lineHeight of 1, so 16px top + 16px
 * bottom takes the target to exactly the 44pt minimum (label-md rows get 46).
 * Horizontal is 12 because the narrowest label ("Sign Up") is already ~60px
 * wide, and 12 is exactly half the frame's 24px Links Row gap — so the two
 * footer targets meet without overlapping each other.
 */
const LINK_HIT_SLOP = { top: 16, bottom: 16, left: 12, right: 12 } as const;

interface TextLinkProps {
  /** expo-router path. */
  href: React.ComponentProps<typeof Link>["href"];
  label: string;
  /** Type/colour classes — the caller owns them so each row keeps the frame's ramp. */
  className?: string;
  /**
   * Overrides `LINK_HIT_SLOP` where a symmetric expansion would reach into a
   * neighbouring target. Must still total ≥ 44pt with the text height.
   */
  hitSlop?: React.ComponentProps<typeof Pressable>["hitSlop"];
}

/**
 * Inline tappable string ("Forgot Password?", "Sign Up", the footer links).
 *
 * Reaches the 44pt minimum target via `hitSlop` rather than padding: padding
 * would change the frame's metrics, since the Password label row and the footer
 * rows are hug-height in the design.
 */
function TextLink({ href, label, className, hitSlop = LINK_HIT_SLOP }: TextLinkProps) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={label} hitSlop={hitSlop}>
        <Text className={className}>{label}</Text>
      </Pressable>
    </Link>
  );
}
