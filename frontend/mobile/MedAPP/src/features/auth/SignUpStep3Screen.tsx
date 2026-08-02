// Sign-up Step 3 — rebuilt against the APPROVED Figma frame
// "sign_up_security_setup" (file kRifcg1KCEAlTXy4aimotK, page "Sign Up",
// node 38:93).
//
// The previous version was translated from a Stitch dump before the design
// system existed. Per the product owner's call, Figma is the source of truth, so
// the layout, spacing, radii, colours and copy below come from the frame — not
// from the old screen (which drew decorative corner blobs, its own bespoke
// sticky header with a "Step 3 of 3" caption and an inline progress bar, a
// MaterialIcons `shield` badge, a 480px desktop wrapper, hardcoded hexes for the
// switch/shadow colours, and a raw RN <Switch>). What was preserved is the
// behaviour the design cannot express: RHF + zod (`SignUpStep3Schema`), the
// `onBack` / `onSubmit` / `onSkip` hand-off to the route (which composes the
// full sign-up payload and fires the mutation), the submit-error surface, and
// the bound `lastAuditDate`.
//
// Frame structure (values read from get_design_context / get_variable_defs /
// get_metadata, not eyeballed):
//   AppBar 292:596   the shared <SignupAppBar step={3} /> — 64px bar, 16px
//                    inset, centred 42px logo, then the 8px stepper at 3/3.
//   Body 338:328     16px inset, 24px top / 32px bottom, 24px gaps
//     (stepper labels) "Step 3 of 3" / "Security" — see FLAGGED (9)
//     338:796        Intro Block — 16px gaps, centred: a 64px `primary-tint`
//                    radius/full badge holding icon/health-data-security at
//                    32px in `primary`, then headline-xl (28) and body-md.
//     338:802        Toggle Cards — 12px gaps. Each card: radius 24, 16px
//                    inset, 12px gaps, a 1px hairline, and NO drop shadow. The
//                    frame's `elevation/card` still draws 0 8 24 @ 12%; that is
//                    a stale effect style, superseded by docs/BRAND.md
//                    ("cards do NOT cast a drop shadow"), and <Card> emits none.
//                    Then a 44px
//                    `primary-tint` icon chip at radius 12 holding a 24px glyph
//                    in `primary`, a 4px-gap
//                    text column (label-md + label-sm) and a 44px switch tap
//                    target holding the 52×32 Switch component (41:106/41:107).
//                    The hairline is STATEFUL: the two cards drawn On carry a
//                    `primary` border, the one drawn Off carries
//                    `outline-variant` — so it tracks the toggle value here.
//     338:852        Compliance Card — same card geometry, 12px gaps: header
//                    row (icon/secure 20 in `on-surface-variant` + label-md),
//                    label-sm body, then a hug-width `success-container`
//                    radius/full audit chip (12/8 inset, 8px gap) holding
//                    icon/calendar 20 in `success` + label-sm.
//
//     Both card nodes above go through the shared <Card> primitive, so their
//     fill is the `card-surface` ROLE and the elevation is emitted in LIGHT MODE
//     ONLY. The frame names `surface-container-lowest`, which is a fixed step:
//     literal #FFFFFF over a #F5FAF8 page in light, and #090F0E — darker than
//     the #0E1514 page — in dark, so every "raised" card on this screen sank in
//     dark mode. Deviation from the frame's token, per the Card fix.
//
//     338:872        Divider — 1px `outline-variant`, full width.
//     338:873        Footer — 12px gaps, centred: a 56px `primary` CTA at
//                    radius 12 ("Complete Setup" + icon/chrome-arrow-right,
//                    label-md on `on-primary`, NO effect on the node), a 44px
//                    "Skip for now" text action in `primary`, and a centred
//                    label-sm legal note.
//
// Switch component (41:106 On / 41:107 Off), from get_metadata: a 52×32
// radius/full track with a 24px thumb inset 4px (x=24 when On, x=4 when Off)
// and a 12px glyph centred in the thumb. On = `primary` track, `on-primary`
// thumb, check glyph in `primary`. Off = `outline-variant` track,
// `surface-container-lowest` thumb, dash glyph in `on-surface-variant`.
//
// FLAGGED deviations / gaps (also listed in the task report):
//   1. SEMANTIC CONFLICT on the third toggle. The frame labels it "Share Data
//      with Care Team — Let your providers view your health records.", but the
//      field it is bound to is `shareAnonymousData`, which the schema and
//      `authApi.signUpFull` define as anonymised sharing with RESEARCHERS.
//      Those are different consents with different legal weight. The frame's
//      copy is used (Figma wins on copy) and the field name is left alone
//      (renaming it is an API-contract change), but ONE of the two has to move:
//      either the frame means provider access and needs a new field, or the
//      copy needs to say "researchers". Needs a product/legal decision.
//   2. The frame has no submit-error state and no error slot. The route can
//      surface a 409 / network failure, so `errorMessage` renders on
//      `error-container` above the divider. Needs a designed error state.
//   3. The frame draws "Skip for now" unconditionally; the screen still renders
//      it only when the route passes `onSkip`, so the control can't appear
//      inert. Both prod call sites pass it.
//   4. The frame's legal line is ONE undifferentiated `on-surface-variant`
//      string with no link affordance, yet "Terms of Service" and "Privacy
//      Policy" have real routes in this app. They are rendered as `primary`
//      tappable spans (same call as the rebuilt Step 1 frame) so the
//      navigation isn't lost. The frame needs a designed link treatment.
//   5. The switch is a bespoke Pressable, not RN's <Switch>: the platform
//      control can't express the frame's glyph-in-thumb (check / dash) or take
//      themed token colours. Accessibility is preserved via
//      `accessibilityRole="switch"` + `accessibilityState.checked`, and state
//      is never signalled by colour alone (the thumb moves AND its glyph
//      changes shape).
//   6. The audit chip's label is `on-surface` in the frame. It is rendered on
//      `on-success-container` here, per docs/BRAND.md's binding rule that text
//      on an accent surface must use that accent's `on-*` pair — otherwise it
//      is `on-surface` on a dark `success-container` in dark mode. Flagged as a
//      deliberate token correction.
//   7. The app bar CENTRES the logo, contradicting BRAND's "logo on the left"
//      app-shell rule, and its Help button has no destination. Both are
//      properties of the shared <SignupAppBar> and are flagged there too.
//   8. The signup flow routes Step 1 → contact verification → Step 2 → Step 3.
//      The verification step was never designed; it is untouched here and still
//      needs a frame.
//   9. STEPPER LABEL ADDED, deviating from the frame. Node 338:328 has NO
//      stepper caption row, while steps 1 and 2 (301:621, 326:221) both draw
//      one — so on the last step the progress bar sat at a solid, unlabelled
//      100% and read as a finished loading bar rather than "you are on step 3
//      of 3". A wizard that stops telling you where you are on its final screen
//      is an inconsistency, not a design choice, so the shared
//      <SignupStepLabels step={3} title="Security" /> renders here too.
//      "Security" is the title implied by the frame's own name
//      (sign_up_security_setup) and heading; the designer should confirm the
//      wording and add the row to the frame.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, Icon, type HealthIconName } from "@/components/ui";
import { useResolvedScheme } from "@/lib/theme";
import { useTokenColor } from "@/lib/tokens";
import { SignupAppBar } from "@/features/auth/components/SignupAppBar";
import { FRAME_CARD_INSET, SignupStepLabels } from "@/features/auth/components/signup-form";
import { SignUpStep3Schema, type SignUpStep3Values } from "@/features/auth/schema";

/** Switch geometry from 41:106 — 52×32 track, 24px thumb, 4px inset. */
const SWITCH = { width: 52, height: 32, thumb: 24, inset: 4 } as const;

interface Props {
  isSubmitting?: boolean;
  /** Submit failure from the route. FLAGGED (2) — no error state in the frame. */
  errorMessage?: string | null;
  /** Bound variable, not hardcoded copy — the frame draws "Last audit: Jun 2026". */
  lastAuditDate?: string;
  onBack?: () => void;
  onSubmit?: (values: SignUpStep3Values) => void;
  onSkip?: () => void;
}

/**
 * The three Toggle Cards (338:803 / 338:820 / 338:837) — copy and glyphs taken
 * from the frame. Every glyph is a real Health Icons registry entry, so nothing
 * had to be added to src/components/ui/icons/registry.ts.
 *
 * FLAGGED (1): `shareAnonymousData` carries the frame's care-team copy while the
 * schema/API define it as anonymised research sharing.
 */
const TOGGLES: {
  name: keyof SignUpStep3Values;
  icon: HealthIconName;
  title: string;
  description: string;
  testID: string;
}[] = [
  {
    name: "enableBiometric",
    icon: "fingerprint",
    title: "Biometric Login",
    description: "Use Face ID or fingerprint to sign in securely.",
    testID: "signup.step3.biometric",
  },
  {
    name: "enableTwoFactor",
    icon: "secure-communication",
    title: "Two-Factor Authentication",
    description: "Add a verification code step when signing in.",
    testID: "signup.step3.two-factor",
  },
  {
    name: "shareAnonymousData",
    icon: "health-worker",
    title: "Share Data with Care Team",
    description: "Let your providers view your health records.",
    testID: "signup.step3.data-sharing",
  },
];

export function SignUpStep3Screen({
  isSubmitting,
  errorMessage,
  lastAuditDate = "Jun 2026",
  onBack,
  onSubmit,
  onSkip,
}: Props) {
  const { scheme } = useResolvedScheme();
  // Icon colours can't be Tailwind classes (react-native-svg / MaterialIcons
  // take a colour string), so they're resolved by token name for the mode.
  const primary = useTokenColor("primary");
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const success = useTokenColor("success");

  const { control, handleSubmit } = useForm<SignUpStep3Values>({
    resolver: zodResolver(SignUpStep3Schema),
    // The frame draws Biometric and Share Data On and 2FA Off.
    defaultValues: {
      enableBiometric: true,
      enableTwoFactor: false,
      shareAnonymousData: true,
    },
    mode: "onSubmit",
  });

  const submit = handleSubmit((values) => onSubmit?.(values));

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        {/* AppBar + Stepper (292:596) — outside the ScrollView: the frame pins
            it above the body, and it carries the way back out. */}
        <SignupAppBar
          step={3}
          backLabel="Back to step 2"
          onBack={() => onBack?.()}
          onHelp={() => {
            /* FLAGGED (7): needs a help/support screen + a designed target. */
          }}
        />

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingTop: 24,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Body (338:328) — 24px between blocks. */}
          <View className="w-full gap-6">
            {/* Stepper Labels — FLAGGED (9): NOT in the frame. Steps 1 and 2
                both label their stepper; without this row step 3's solid 100%
                bar read as a finished loading indicator. */}
            <SignupStepLabels step={3} title="Security" />

            {/* Intro Block (338:796) — 16px gaps, centred. */}
            <View className="w-full items-center gap-4">
              {/* Icon Badge (338:797) — 64px, radius/full, `primary-tint`. */}
              <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-tint">
                <Icon name="health-data-security" size={32} color={primary} />
              </View>
              <Text className="w-full text-center font-headline-xl text-headline-xl text-on-surface">
                Secure your account
              </Text>
              <Text className="w-full text-center font-body-md text-body-md text-on-surface-variant">
                Add an extra layer of protection to keep your health records private and safe.
              </Text>
            </View>

            {/* Toggle Cards (338:802) — 12px gaps. */}
            <View className="w-full gap-3">
              {TOGGLES.map((toggle) => (
                <Controller
                  key={toggle.name}
                  control={control}
                  name={toggle.name}
                  render={({ field }) => (
                    <ToggleCard
                      testID={toggle.testID}
                      icon={toggle.icon}
                      title={toggle.title}
                      description={toggle.description}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              ))}
            </View>

            {/* Compliance Card (338:852) — the shared <Card>, 12px gaps. Was
                hand-rolled with a local `cardShadow` on the (now false) grounds
                that the primitive couldn't express this node. */}
            <Card className="w-full gap-3" style={FRAME_CARD_INSET}>
              {/* Header (338:853) — 8px gap. */}
              <View className="w-full flex-row items-center gap-2">
                <Icon name="secure" size={20} color={onSurfaceVariant} />
                <Text className="font-label-md text-label-md text-on-surface">
                  HIPAA-Compliant Security
                </Text>
              </View>
              <Text className="w-full font-label-sm text-label-sm text-on-surface-variant">
                Your health data is encrypted end-to-end and stored in accordance with HIPAA
                security standards.
              </Text>
              {/* Audit Chip (338:859) — hug width, radius/full, 12/8 inset.
                  FLAGGED (6): label takes `on-success-container`, not the
                  frame's `on-surface`, so it stays legible in dark mode. */}
              <View className="flex-row items-center gap-2 self-start rounded-full bg-success-container px-3 py-2">
                <Icon name="calendar" size={20} color={success} />
                <Text className="font-label-sm text-label-sm text-on-success-container">
                  Last audit: {lastAuditDate}
                </Text>
              </View>
            </Card>

            {/* Submit error — FLAGGED (2): not in the frame. */}
            {errorMessage ? (
              <View className="w-full rounded-md bg-error-container p-4">
                <Text
                  className="font-label-sm text-label-sm text-on-error-container"
                  accessibilityLiveRegion="polite"
                >
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {/* Divider (338:872) */}
            <View className="h-px w-full bg-outline-variant" />

            {/* Footer (338:873) — 12px gaps, centred. */}
            <View className="w-full items-center gap-3">
              {/* CTA (338:874) — 56px, radius 12, no effect on the node, so the
                  primary variant's elevation is opted out of. */}
              <Button
                testID="signup.step3.submit"
                className="h-14"
                size="cta"
                pill={false}
                shadow={false}
                label="Complete Setup"
                accessibilityLabel="Complete setup"
                trailingIcon="arrow-forward"
                loading={isSubmitting}
                disabled={isSubmitting}
                onPress={submit}
              />

              {/* Skip for now (338:878) — a 44px text action.
                  FLAGGED (3): only rendered when the route wires it. */}
              {onSkip ? (
                <Pressable
                  testID="signup.step3.skip"
                  onPress={onSkip}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Skip security setup for now"
                  className="h-11 w-full items-center justify-center active:opacity-70"
                >
                  <Text className="font-label-md text-label-md text-primary">Skip for now</Text>
                </Pressable>
              ) : null}

              {/* Legal note (338:880). FLAGGED (4): the frame draws one flat
                  string; the two routes are kept tappable. */}
              <Text className="w-full text-center font-label-sm text-label-sm text-on-surface-variant">
                By continuing you agree to our{" "}
                <Text
                  className="text-primary"
                  accessibilityRole="link"
                  onPress={() => router.push("/(public)/terms")}
                >
                  Terms of Service
                </Text>{" "}
                and{" "}
                <Text
                  className="text-primary"
                  accessibilityRole="link"
                  onPress={() => router.push("/(public)/privacy")}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local primitives. This is their only screen, so they stay local per the house
// rule in components/ui/README.md (extract at 2+ call sites).
// ---------------------------------------------------------------------------

/**
 * Toggle Card (338:803) — the shared <Card> at the frame's 16px inset, 12px
 * gaps, plus a STATEFUL hairline: `primary` when the toggle is on,
 * `outline-variant` when it is off (exactly what the frame draws across its
 * three instances).
 *
 * It used to hand-roll the treatment — `bg-surface-container-lowest` plus its own
 * `useTokenShadow` call. Both are gone: the fixed-step fill was literal #FFFFFF
 * over a #F5FAF8 page in light and #090F0E (darker than the #0E1514 page) in
 * dark, so three "raised" cards actually sank in dark mode; and cards no longer
 * carry a drop shadow in any mode (docs/BRAND.md).
 *
 * The Pressable WRAPS the Card rather than being it: <Card> renders a View, and
 * `active:scale-[0.99]` has to scale the whole visible surface — fill and
 * hairline — not just the content inside it.
 *
 * The whole card is the tap target, not just the switch — the frame gives the
 * switch its own 44px target, and making the row tappable only widens it.
 */
function ToggleCard({
  testID,
  icon,
  title,
  description,
  value,
  onValueChange,
}: {
  testID: string;
  icon: HealthIconName;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  // The glyph sits on the `primary-tint` chip and the on-state hairline is the
  // same accent, so both resolve one token for the current mode — never a hex.
  const primary = useTokenColor("primary");

  return (
    <Pressable
      testID={testID}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      accessibilityHint={description}
      className="w-full active:scale-[0.99]"
    >
      <Card
        className="w-full flex-row items-center gap-3"
        // borderColor inline, not a `border-primary` className: <Card> already
        // names `border-outline-variant`, and src/lib/cn.ts has no
        // tailwind-merge, so two competing border-colour utilities would resolve
        // by stylesheet order rather than intent. Still a token, just resolved.
        style={{ ...FRAME_CARD_INSET, ...(value ? { borderColor: primary } : null) }}
      >
        {/* Icon Chip (I338:803;337:785) — 44px, radius 12, `primary-tint`. */}
        <View className="h-11 w-11 items-center justify-center rounded-md bg-primary-tint">
          <Icon name={icon} size={24} color={primary} />
        </View>

        {/* Text (I338:803;337:787) — 4px gap. */}
        <View className="flex-1 gap-1">
          <Text className="font-label-md text-label-md text-on-surface">{title}</Text>
          <Text className="font-label-sm text-label-sm text-on-surface-variant">{description}</Text>
        </View>

        {/* Switch Tap Target (I338:803;339:366) — 44px tall, hugging the 52×32
            switch. `pointerEvents="none"` so the whole card owns the press. */}
        <View pointerEvents="none" className="h-11 items-center justify-center">
          <ThemedSwitch on={value} />
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * Switch (41:106 On / 41:107 Off) — 52×32 radius/full track with a 24px thumb
 * inset 4px and a 12px glyph centred in it.
 *
 * FLAGGED (5): RN's <Switch> can't draw a glyph in the thumb or take themed
 * token colours, so this is a Pressable-free presentational View; the parent
 * card carries the switch role/state for assistive tech. Colour is never the
 * only cue — the thumb translates AND its glyph changes from a check to a dash
 * (WCAG 1.4.1, docs/BRAND.md).
 */
function ThemedSwitch({ on }: { on: boolean }) {
  // The glyph sits on the thumb, so it takes the thumb fill's matching pair:
  // `primary` on an `on-primary` thumb, `on-surface-variant` on a
  // `surface-container-lowest` one. Never a literal white.
  const onGlyph = useTokenColor("primary");
  const offGlyph = useTokenColor("on-surface-variant");

  return (
    <View
      className={`justify-center rounded-full ${on ? "bg-primary" : "bg-outline-variant"}`}
      style={{ width: SWITCH.width, height: SWITCH.height }}
    >
      <View
        className={`absolute items-center justify-center rounded-full ${
          on ? "bg-on-primary" : "bg-surface-container-lowest"
        }`}
        style={{
          width: SWITCH.thumb,
          height: SWITCH.thumb,
          left: on ? SWITCH.width - SWITCH.thumb - SWITCH.inset : SWITCH.inset,
        }}
      >
        <Icon chrome={on ? "check" : "remove"} size={12} color={on ? onGlyph : offGlyph} />
      </View>
    </View>
  );
}
