// Sign-up Step 1 — rebuilt against the APPROVED Figma frame
// "Sign Up - Create Account" (file kRifcg1KCEAlTXy4aimotK, page "Sign Up",
// node 1:34).
//
// The previous version was translated from a Stitch dump before the design
// system existed. Per the product owner's call, Figma is the source of truth,
// so the layout, spacing, radii, colours and copy below come from the frame —
// not from the old screen (which centred a "medical-services" tile, drew
// decorative blobs, labelled every field, and said "Continue" instead of
// "Create Account"). What was preserved is the behaviour the design cannot
// express: RHF + zod (`SignUpStep1Schema`), the `onNext` hand-off to the route
// (which stores the draft and pushes the contact-verification step), the
// password/confirm reveal toggles, and the Terms/Privacy destinations.
//
// Frame structure (values read from get_design_context / get_variable_defs,
// not eyeballed):
//   AppBar 292:157  64px bar, 16px inset — 44px back target · CENTRED logo
//                   (42px tall) · 44px help target; then an 8px stepper track
//                   (`outline-variant`, radius/full) with a `primary` progress
//                   fill at 1/3 (120.333 of 361).
//   Body 301:620    16px inset, 8px top / 32px bottom, 24px gaps
//     301:621       stepper labels: "Step 1 of 3" `primary` ↔ "Account"
//                   `on-surface-variant`, both label-sm
//     301:624       heading: headline-xl 28 + body-md, 8px gap
//     301:627       Card / Account Basics — radius 24, 16px inset, 16px gaps,
//                   1px `outline-variant` hairline, `elevation/card`
//                   (0 8 24 #0D1A17 @12% = the `shadow` token @12%). Rendered
//                   by the shared <Card>, so the fill is the `card-surface` ROLE
//                   and the elevation is LIGHT MODE ONLY — the frame's
//                   `surface-container-lowest` is a fixed step that goes DARKER
//                   than the page in dark mode. Deviation from the frame's token.
//       4 × 52px inputs (radius 12, 16px inset, leading 20px glyph), the
//       password hint (label-sm), the consent row (44px target + 20px
//       radius/4 box), and the 56px `primary` CTA "Create Account".
//     301:678       divider + "or continue with" (label-sm, lowercase)
//     301:682       two flex-1 56px social buttons
//     301:700       footer: 44px "Already have an account? Sign In" row +
//                   two trust badges (icon 20 + label-sm), 24px apart
//
// FLAGGED deviations / gaps (also listed in the task report):
//   1. The frame gives the inputs no visible labels and no error state. Both
//      are required behaviour, so validation messages are rendered on the
//      `error` token and each field carries an accessibilityLabel/Hint (RN has
//      no <label for>). Needs a designed error state.
//   2. The app bar's Help button has no destination anywhere in the app — no
//      help/support route exists. It is rendered per the frame with a TODO
//      handler; it needs both a screen and a designed target.
//   3. RESOLVED (was: "the marks are the <Icon /> chrome fallback"). The social
//      buttons drew MaterialIcons `g-mobiledata` — a boxed platform "G", not
//      Google's mark, and not permitted on a sign-in button by Google's branding
//      rules (no icon font can be: the mark is four-colour). They now render the
//      vendored artwork the primitives added, `<BrandMark name="google" />` /
//      `name="apple"`, which lives in src/components/ui/brand/ rather than the
//      Health Icons registry. These entries now open the provider sign-in flow;
//      and the frame's `brand/google-*` colour variables have no Figma
//      counterpart for the new Brand Marks set.
//   4. `radius/4` on the checkbox contradicts BRAND's 12/24/full scale — the
//      same conflict already flagged on the Login frame (`rounded-xs`). It now
//      lives in <ConsentRow>, not here.
//   5. The frame CENTRES the logo in this app bar; BRAND's app-shell rule says
//      "logo on the left, do not centre". The signup bar is its own component
//      in Figma, so the frame is followed and the conflict flagged.
//   6. The signup flow routes Step 1 → contact verification → Step 2. That
//      step was never designed; it is untouched here (the route owns it) and
//      still needs a frame.
//   7. DATA MODEL: the frame's single "Full Name" field replaced the legacy
//      First / Middle / Surname trio. Two consequences, both needing a product
//      decision (raised in the task report, not just buried here):
//        a. `middleName` is no longer captured ANYWHERE in the app. That is a
//           dropped capability, not a deferral.
//        b. `authApi.signUpFull` splits the string on whitespace, so a mononym
//           POSTs the same token as both first_name and last_name, and a
//           three-part name puts two tokens in last_name. Lossy for the
//           mononym-heavy markets BRAND.md targets. Real fix: a backend that
//           accepts a single legal name.
//   8. The frame specifies no CHECKED state for the consent checkbox (1:68 is
//      drawn unchecked only), so the check glyph's size/colour are ours: 16px
//      on `on-primary`. Needs specifying. That decision now lives once, in
//      <ConsentRow>, instead of once per screen.
//   9. The frame's password hint ("Min 8 characters, 1 number, 1 symbol") is
//      stricter than the legacy length-only rule, so `SignUpStep1Schema`
//      gained digit + symbol regexes to match the copy it now shows.
//
// The app bar stays LOCAL: steps 2 and 3 are still on the legacy design, so
// this is its only call site today. Promote it to components/ui when those
// frames are rebuilt (house rule: extract at 2+ call sites).
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Link, router, type Href } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BrandMark,
  Button,
  Card,
  ConsentRow,
  Icon,
  Input,
  type BrandMarkName,
  KeyboardInset,
  InfoCallout,
} from "@/components/ui";
import { useResolvedScheme } from "@/lib/theme";
import { useTokenColor } from "@/lib/tokens";
import { SignupAppBar } from "@/features/auth/components/SignupAppBar";
import {
  FieldError,
  FRAME_CARD_INSET,
  SignupStepLabels,
} from "@/features/auth/components/signup-form";
import { SignUpStep1Schema, type SignUpStep1Values } from "@/features/auth/schema";

interface Props {
  onNext?: (values: SignUpStep1Values) => void;
  initialName?: string;
  initialEmail?: string;
  providerMessage?: string;
  onEmailOnly?: () => void;
}

export function SignUpStep1Screen({
  onNext,
  initialName = "",
  initialEmail = "",
  providerMessage,
  onEmailOnly,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { scheme } = useResolvedScheme();
  // Icon colours can't be Tailwind classes (react-native-svg / MaterialIcons
  // take a colour string), so they're resolved by token name for the mode.
  const onSurfaceVariant = useTokenColor("on-surface-variant");

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpStep1Values>({
    resolver: zodResolver(SignUpStep1Schema),
    defaultValues: {
      fullName: initialName,
      email: initialEmail,
      password: "",
      confirmPassword: "",
      agreeToTerms: false,
    },
    mode: "onBlur",
  });

  const onSubmit = handleSubmit((values) => {
    onNext?.(values);
  });

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        {/* KeyboardInset, NOT KeyboardAvoidingView — the KAV infers the keyboard
          from a WINDOW RESIZE that Android edge-to-edge no longer performs, so it
          silently does nothing there. Proven on device on the chat composer. */}
        <KeyboardInset className="flex-1">
          {/* ---------------- AppBar + Stepper (292:157) ----------------
              Outside the ScrollView: the frame pins it above the body, and it
              carries the only way back out of the flow. Extracted to
              <SignupAppBar> once Step 2 was rebuilt against its own frame and
              became the second call site (components/ui/README.md house rule);
              FLAGGED (2) and (5) now live on that component. */}
          <SignupAppBar
            step={1}
            backLabel="Back to sign in"
            onBack={() => router.replace("/(public)/sign-in")}
            onHelp={() => {
              /* TODO: needs a help/support screen + a designed target. */
            }}
          />

          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: 32,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Body (301:620) — 24px between blocks. */}
            <View className="w-full gap-6">
              {/* Stepper Labels (301:621) — shared with steps 2 and 3. */}
              <SignupStepLabels step={1} title="Account" />

              {/* Heading (301:624) */}
              <View className="w-full gap-2">
                <Text className="font-headline-xl text-headline-xl text-on-surface">
                  Create your health account
                </Text>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  Secure healthcare access and wellness tracking.
                </Text>
              </View>

              {/* ---------------- Card / Account Basics (301:627) ----------------
                  The shared <Card> primitive. It used to be hand-rolled here
                  with a local `cardShadow`, on the grounds that the primitive
                  was stuck on pre-design-system geometry — that is no longer
                  true: <Card> now IS this node (radius 24, `card-surface`,
                  full-strength `outline-variant` hairline, and the same
                  `elevation/card` = `shadow` @12% / 8y / 24blur, light mode
                  only). Only the frame's 16px inset is restated. */}
              <Card className="w-full gap-4" style={FRAME_CARD_INSET}>
                {/* Full Name (301:628). The frame keeps a single Full Name
                    field; the API boundary splits it (FLAGGED 7).
                    Input + message are wrapped in an 8px stack so the error
                    reads as belonging to its own field rather than floating
                    midway between two of the card's 16px gaps — same shape as
                    the frame's own Password Field group (301:644). */}
                <View className="w-full gap-2">
                  <Controller
                    control={control}
                    name="fullName"
                    render={({ field }) => (
                      <Input
                        icon="person"
                        placeholder="Full Name"
                        autoCapitalize="words"
                        autoComplete="name"
                        textContentType="name"
                        value={field.value ?? ""}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        hasError={!!errors.fullName}
                        accessibilityLabel="Full Name"
                        accessibilityHint={errors.fullName?.message}
                      />
                    )}
                  />
                  <FieldError message={errors.fullName?.message} />
                </View>

                {/* Email (301:636) — icon/chrome-mail per the component's own
                    Figma note (Health Icons has no envelope). */}
                <View className="w-full gap-2">
                  <Controller
                    control={control}
                    name="email"
                    render={({ field }) => (
                      <Input
                        icon="mail-outline"
                        placeholder="Email Address"
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
                  <FieldError message={errors.email?.message} />
                </View>

                {/* Password Field (301:644) — input + 8px + hint. */}
                <View className="w-full gap-2">
                  <Controller
                    control={control}
                    name="password"
                    render={({ field }) => (
                      <Input
                        icon="lock-outline"
                        placeholder="Password"
                        autoCapitalize="none"
                        autoComplete="password-new"
                        autoCorrect={false}
                        secureTextEntry={!showPassword}
                        textContentType="newPassword"
                        value={field.value ?? ""}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        hasError={!!errors.password}
                        accessibilityLabel="Password"
                        accessibilityHint={errors.password?.message}
                        trailing={
                          <RevealToggle
                            shown={showPassword}
                            onPress={() => setShowPassword((s) => !s)}
                            color={onSurfaceVariant}
                          />
                        }
                      />
                    )}
                  />
                  {/* The frame draws the hint unconditionally (301:655); the
                      error replaces it, since both describe the same rule and
                      the frame has no error state (FLAGGED 1). */}
                  {errors.password ? (
                    <FieldError message={errors.password.message} />
                  ) : (
                    <Text className="font-label-sm text-label-sm text-on-surface-variant">
                      Min 8 characters, 1 number, 1 symbol
                    </Text>
                  )}
                </View>

                {/* Confirm Password (301:656) */}
                <View className="w-full gap-2">
                  <Controller
                    control={control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <Input
                        icon="lock-outline"
                        placeholder="Confirm Password"
                        autoCapitalize="none"
                        autoComplete="password-new"
                        autoCorrect={false}
                        secureTextEntry={!showConfirm}
                        textContentType="newPassword"
                        value={field.value ?? ""}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        hasError={!!errors.confirmPassword}
                        accessibilityLabel="Confirm Password"
                        accessibilityHint={errors.confirmPassword?.message}
                        trailing={
                          <RevealToggle
                            shown={showConfirm}
                            onPress={() => setShowConfirm((s) => !s)}
                            color={onSurfaceVariant}
                          />
                        }
                      />
                    )}
                  />
                  <FieldError message={errors.confirmPassword?.message} />
                </View>

                {/* Consent Row (301:668) — the shared <ConsentRow>.
                    Replaces a hand-rolled row that stacked two defects: a 44x44
                    Pressable centred (`items-center`) against a TWO-LINE label,
                    so the box floated in the gap between the lines and belonged
                    to neither; and a `body-md` (16px Regular) label where every
                    other label in this card — and sign-in's identical
                    "Remember me" row — is `label-md` (14px SemiBold).
                    <ConsentRow> pins the box to the FIRST line by keeping the
                    20px box and the 20px label leading equal, and gets its
                    >=44pt target from hitSlop instead of an inflated View.

                    `labelPressable` is deliberately OFF: this sentence carries
                    two navigating links, so a row-level press would make every
                    tap ambiguous ("did that toggle consent or open the Terms?").
                    Only the box toggles. */}
                <Controller
                  control={control}
                  name="agreeToTerms"
                  render={({ field }) => (
                    <ConsentRow
                      testID="signup.step1.terms"
                      checked={!!field.value}
                      onChange={field.onChange}
                      accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
                      error={errors.agreeToTerms?.message}
                    >
                      I agree to the{" "}
                      <Text
                        className="text-primary underline"
                        accessibilityRole="link"
                        onPress={() => router.push("/(public)/terms")}
                      >
                        Terms of Service
                      </Text>{" "}
                      and{" "}
                      <Text
                        className="text-primary underline"
                        accessibilityRole="link"
                        onPress={() => router.push("/(public)/privacy")}
                      >
                        Privacy Policy
                      </Text>
                    </ConsentRow>
                  )}
                />

                {/* CTA / Create Account (301:674) — 56px, radius 12, no effect
                    on the node, so the primary variant's elevation is opted
                    out of. */}
                <Button
                  testID="signup.step1.next"
                  className="h-14"
                  size="cta"
                  pill={false}
                  shadow={false}
                  label={isSubmitting ? "Creating account…" : "Create Account"}
                  trailingIcon="arrow-forward"
                  loading={isSubmitting}
                  onPress={onSubmit}
                  disabled={isSubmitting}
                />
              </Card>

              {providerMessage ? (
                <>
                  <InfoCallout>{providerMessage}</InfoCallout>
                  <Button
                    label="Continue with email only"
                    variant="outline"
                    onPress={onEmailOnly}
                  />
                </>
              ) : null}
              {/* Divider / or continue with (301:678) */}
              <View className="w-full flex-row items-center gap-3">
                <View className="h-px flex-1 bg-outline-variant" />
                <Text className="font-label-sm text-label-sm text-on-surface-variant">
                  or continue with
                </Text>
                <View className="h-px flex-1 bg-outline-variant" />
              </View>

              {/* Social Buttons (301:682) — the REAL vendor marks now
                  (<BrandMark>), not MaterialIcons' boxed `g-mobiledata`. */}
              <View className="w-full flex-row items-start gap-3">
                <SocialButton
                  mark="google"
                  label="Google"
                  onPress={() => {
                    router.push("/(public)/provider-sign-in" as Href);
                  }}
                />
                <SocialButton
                  mark="apple"
                  label="Apple"
                  onPress={() => {
                    router.push("/(public)/provider-sign-in" as Href);
                  }}
                />
              </View>

              {/* Footer (301:700) */}
              <View className="w-full items-center gap-4">
                {/* Sign In Link (301:701) — the whole 44px row is the target. */}
                <Link href="/(public)/sign-in" asChild>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Sign In"
                    className="h-11 w-full flex-row items-center justify-center"
                  >
                    <Text className="text-center font-label-md text-label-md text-on-surface-variant">
                      Already have an account? <Text className="text-primary">Sign In</Text>
                    </Text>
                  </Pressable>
                </Link>

                {/* Trust Badges (301:703). "secure" is a real Health Icon
                    (symbols/ui_secure) per the icon/secure component note; the
                    padlock is the chrome fallback the frame itself uses, since
                    Health Icons ships no plain padlock. */}
                <View className="w-full flex-row items-center justify-center gap-6">
                  <TrustBadge icon={<Icon name="secure" size={20} color={onSurfaceVariant} />}>
                    HIPAA Compliant
                  </TrustBadge>
                  <TrustBadge
                    icon={<Icon chrome="lock-outline" size={20} color={onSurfaceVariant} />}
                  >
                    256-bit Encryption
                  </TrustBadge>
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
// Local primitives. This is their only screen, so they stay local per the
// house rule in components/ui/README.md (extract at 2+ call sites).
// ---------------------------------------------------------------------------

/** Password reveal toggle (I301:645;318:654) — 44×44 target, 20px glyph. */
function RevealToggle({
  shown,
  onPress,
  color,
}: {
  shown: boolean;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={shown ? "Hide password" : "Show password"}
      className="h-11 w-11 items-center justify-center"
    >
      <Icon chrome={shown ? "visibility-off" : "visibility"} size={20} color={color} />
    </Pressable>
  );
}

/**
 * SocialButton (301:180) — flex-1, 56px, radius 12, on the `card-surface` role.
 *
 * Takes a BRAND MARK, not an icon name. It used to take a `ChromeIconName` and
 * was handed `g-mobiledata`, MaterialIcons' boxed platform "G" — which is why
 * "the google icon is not showing" as Google's mark. An icon font can never
 * express it: the G is four-colour vendor artwork. <BrandMark> renders the
 * vendored SVG (src/components/ui/brand/), keeps the two marks optically the
 * same size, and refuses to recolour the G.
 *
 * No `color` prop: the Google mark carries its own vendor colours, and the
 * monochrome Apple mark defaults to `on-surface` for the current mode — which is
 * the correct pair for this surface, and flips in dark mode on its own.
 */
function SocialButton({
  mark,
  label,
  onPress,
}: {
  mark: BrandMarkName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${label}`}
      className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-md border border-outline-variant bg-card-surface px-3 active:scale-[0.98]"
    >
      {/* No `label`: the word "Google"/"Apple" is right there, so the mark is
          decorative and <BrandMark> hides it from assistive tech. */}
      <BrandMark name={mark} size={20} />
      <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
    </Pressable>
  );
}

/** TrustBadge (301:181) — icon + label-sm; meaning is carried by the text. */
function TrustBadge({ icon, children }: { icon: React.ReactNode; children: string }) {
  return (
    <View className="flex-row items-center gap-1">
      {icon}
      <Text className="font-label-sm text-label-sm text-on-surface-variant">{children}</Text>
    </View>
  );
}
