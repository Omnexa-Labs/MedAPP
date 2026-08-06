// Sign-up verification gate. Wedges between Step 1 and Step 2:
//
//   Step 1 (account)  →  Verify  →  Step 2 (about you)  →  Step 3 (security)
//
// Rebuilt from the approved Figma frame `sign_up_verify` (file
// kRifcg1KCEAlTXy4aimotK, node 447:455, 393 × 767, fill `color/background`),
// which is the first design this screen has ever had. It replaces a legacy
// implementation that had a bespoke "Back" text header, no stepper, a
// two-sub-state picker/code flow, and a country selector whose own fill sat on
// top of the phone input's.
//
// ── Frame structure ──────────────────────────────────────────────────────────
// AppBar          292:157   instance of `Signup AppBar (Back + Stepper + Help)`,
//                           Step=1, UNCHANGED — see the note on the gate below
// Body            447:468   16px inset, 8px top / 32px bottom, 24px gaps
//   447:469                 stepper labels: "Step 1 of 3" ↔ "Verify contact"
//   447:472                 heading: headline-xl 28 + body-md, 8px gap
//   447:1214                Card / Contact — email context row + phone group
//   447:1242                Code Section — label, 6 boxes, caption, resend row
//   447:1261                CTA — 56px, radius/12, `primary`
//
// ── How the gate is represented in the stepper ───────────────────────────────
// No 4th step and no renumbering. The bar stays on `Step=1` (the progress fill
// stays at 120/361) because verification CLOSES OUT step 1 rather than being a
// new step, and the body's label row keeps the literal left slot "Step 1 of 3"
// while the right-hand section-name slot — which reads "Account" on
// sign_up_create_account — names the gate: "Verify contact". So the gate is
// legible without touching the 1 → 2 → 3 progression.
//
// ── The four designed states ─────────────────────────────────────────────────
// The frame ships as four 393-wide state frames. All four are one screen here,
// driven by (sentTo, code, codeError, verify.isPending):
//
//   Frame                          node       this screen's condition
//   sign_up_verify (canonical)     447:455    sentTo != null, no error
//   state=code-not-sent            447:1407   sentTo == null
//   state=invalid-code             447:1483   codeError == true
//   state=verifying                447:1555   verify.isPending
//
// ── Behaviour preserved from the legacy screen ───────────────────────────────
//  - `useSignupOtpStart` / `useSignupOtpVerify` mutations, unchanged.
//  - The `expiresIn` the start mutation returns still seeds the resend cooldown
//    and still ticks down once per second.
//  - `onVerified({ channel, recipient, token })` is still called with the same
//    triple, so the draft store gets the verification that the Step 3 submit
//    consumes. `token` is still `verificationToken` off the verify result.
//  - The same ApiError branches: 409 (account exists), 429 (rate limited),
//    network, and 400 on verify (wrong code).
//  - The country list, its search, and the Ghana +233 default (now in
//    features/auth/components/PhoneField.tsx).
//
// ── FLAGGED — a behaviour the design drops ───────────────────────────────────
// (1) EMAIL AS A VERIFICATION CHANNEL IS GONE. The legacy screen had a "pick"
//     sub-state offering `begin("email", email)` — verify by email OR by SMS —
//     plus a "Change channel" link back to the picker. The frame has no such
//     affordance: the email is a READ-ONLY context chip, and the body copy is
//     explicit that SMS is the channel ("add the phone number we'll text your
//     6-digit code to"). So `channel` is now always "sms". This is a real
//     reduction in capability, not a restyle:
//       - a user whose phone can't receive SMS (roaming, MVNO, landline) has no
//         route through the gate at all, where before they could use email;
//       - `authApi.signupOtpStart` still accepts `channel: "email"` and the
//         draft's `SignUpVerification.channel` union still has "email", so the
//         backend path stays live with no UI reaching it.
//     Nothing was removed silently — the API, the hook and the store type are
//     untouched and would light up again the moment the designer adds the
//     affordance. Needs a designer ruling.
//
// ── Other flags ──────────────────────────────────────────────────────────────
// (2) The frame's code caption reads "Sent to +233 24 123 4567 · code expires in
//     10 minutes" — TWO timers. The API returns exactly one number, `expiresIn`,
//     and the legacy screen spends it on the resend cooldown. There is no field
//     backing a separate code-expiry duration, so the "· code expires in 10
//     minutes" half is NOT rendered rather than hardcoded to a number the
//     backend never promised. Needs either a second field on the start response
//     or a designer drop.
// (3) The frame draws no validation message for the phone field and no surface
//     for a SEND failure (409 / 429 / network). Both are rendered in the phone
//     group's helper-text slot, so they stay inside designed geometry — but the
//     copy and treatment are ours.
// (4) The card's Figma effect is TWO stacked shadows (`elevation/shadow-card`
//     0 8 24 @10% + `elevation/shadow-card-contact` 0 2 6 @6%, both teal). React
//     Native supports exactly one shadow per view, so this uses the shared
//     <Card> primitive's single `shadow`-token elevation. Matching the two-layer
//     effect would need a nested wrapper view purely to carry a second shadow,
//     which is not worth the extra node.
// (5) The Card / Contact node uses 16px padding + gap rather than the shared
//     `Card / Form`'s 32/24 — the designer's own flagged deviation, because 32
//     would drop the phone control to 297px and crowd the country segment. So
//     <Card> is given `p-4` / `gap-4` overrides.
// (6) The AppBar's Help button still has no destination — no help/support route
//     exists. Flag carried by SignupAppBar itself.

import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Button, Card, Icon,
  KeyboardInset,
} from "@/components/ui";
import { SignupAppBar } from "@/features/auth/components/SignupAppBar";
import {
  CODE_LENGTH,
  CodeBoxRow,
} from "@/features/auth/components/CodeBoxRow";
import {
  DEFAULT_COUNTRY,
  PhoneField,
  type Country,
} from "@/features/auth/components/PhoneField";
import { useSignupOtpStart, useSignupOtpVerify } from "@/features/auth/hooks/use-signup-otp";
import { useResolvedScheme } from "@/lib/theme";
import { useTokenColor } from "@/lib/tokens";
import { ApiError } from "@/types/api";

interface Props {
  /** Email collected at Step 1. Shown as read-only context (445:1785). */
  email: string;
  /** Called with the verification triple the draft store and Step 3 submit consume. */
  onVerified: (verification: {
    channel: "sms" | "email";
    recipient: string;
    token: string;
  }) => void;
  /**
   * Back out of the gate. Wired to BOTH the app bar's back control and the email
   * chip's "Change" action (445:1792) — the email is owned by Step 1, so the only
   * honest way to change it is to go back and edit it there.
   */
  onBack: () => void;
}

/**
 * Digits only, 5–12 — unchanged from the legacy screen, broad enough to cover
 * every dial code in the list.
 */
const MIN_LOCAL_DIGITS = 5;
const MAX_LOCAL_DIGITS = 12;

export function SignUpVerifyScreen({ email, onVerified, onBack }: Props) {
  const { scheme } = useResolvedScheme();
  // Icon colours can't be Tailwind classes (MaterialIcons takes a colour
  // string), so they're resolved by TOKEN NAME for the current mode rather than
  // hardcoded — a literal would freeze them in light mode (docs/BRAND.md).
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const primary = useTokenColor("primary");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localNumber, setLocalNumber] = useState("");
  const [code, setCode] = useState("");
  /** The E.164 recipient a code has actually been sent to; null = code-not-sent. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  /** Send-side failure (409 / 429 / network) — FLAGGED (3). */
  const [sendError, setSendError] = useState<string | null>(null);
  /** Verify-side failure — drives the frame's `state=invalid-code`. */
  const [codeError, setCodeError] = useState<string | null>(null);

  const start = useSignupOtpStart();
  const verify = useSignupOtpVerify();

  const digits = localNumber.replace(/\D/g, "");
  const phoneValid = digits.length >= MIN_LOCAL_DIGITS && digits.length <= MAX_LOCAL_DIGITS;
  const e164 = `${country.code}${digits}`;

  /**
   * "A code is outstanding for the number currently in the field."
   *
   * Deriving this by COMPARING rather than storing a boolean is what keeps the
   * screen honest now that the phone control stays editable after a send (the
   * legacy screen froze the recipient in its `code` sub-state, so the question
   * never arose). Three things fall out of it for free:
   *   - editing the number drops straight back to `state=code-not-sent`, so the
   *     CTA can never verify a code against a number the user has since changed;
   *   - restoring the original number restores the sent state WITH its remaining
   *     cooldown, because `resendIn` is independent;
   *   - and therefore the cooldown can't be bypassed by editing a digit and
   *     changing it back.
   */
  const sent = sentTo !== null && sentTo === e164;
  const isVerifying = verify.isPending;
  const hasCodeError = codeError !== null;

  // Resend countdown — seeded from the start mutation's `expiresIn`, exactly as
  // the legacy screen did. The dependency is the BOOLEAN, not the number, so one
  // interval runs for the whole cooldown instead of being torn down and rebuilt
  // on every tick.
  const cooling = resendIn > 0;
  useEffect(() => {
    if (!cooling) return;
    const timer = setInterval(() => {
      setResendIn((remaining) => (remaining > 0 ? remaining - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooling]);

  const sendCode = async () => {
    if (!phoneValid || start.isPending) return;
    setSendError(null);
    setCodeError(null);
    try {
      const { expiresIn } = await start.mutateAsync({ channel: "sms", recipient: e164 });
      setSentTo(e164);
      setResendIn(expiresIn);
      setCode("");
    } catch (e) {
      setSendError(describeSendError(e));
    }
  };

  const resend = async () => {
    if (resendIn > 0) return;
    await sendCode();
  };

  const submit = async () => {
    // `sent` (not just `sentTo`) so a code is never verified against a number the
    // user has edited since the send — see the note on `sent` above.
    if (!sent || !sentTo || code.length !== CODE_LENGTH || isVerifying) return;
    setSendError(null);
    setCodeError(null);
    try {
      const { verificationToken } = await verify.mutateAsync({
        channel: "sms",
        recipient: sentTo,
        code,
      });
      onVerified({ channel: "sms", recipient: sentTo, token: verificationToken });
    } catch (e) {
      setCodeError(describeVerifyError(e));
    }
  };

  // CTA copy and gating per state: "Send code" (447:1434) before a code exists,
  // "Verifying…" while the mutation is in flight (447:1555, Variant=Loading),
  // "Verify and continue" (447:1261) otherwise.
  const ctaLabel = !sent ? "Send code" : isVerifying ? "Verifying…" : "Verify and continue";
  const ctaDisabled = !sent
    ? !phoneValid || start.isPending
    : code.length !== CODE_LENGTH || isVerifying;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        {/* KeyboardInset, NOT KeyboardAvoidingView — the KAV infers the keyboard
          from a WINDOW RESIZE that Android edge-to-edge no longer performs, so it
          silently does nothing there. Proven on device on the chat composer. */}
      <KeyboardInset className="flex-1">
          {/* AppBar + Stepper (292:157) — outside the ScrollView, as the frame
              pins it above the body. Step=1 unchanged: the gate closes out step
              1 rather than adding a step. */}
          <SignupAppBar
            step={1}
            backLabel="Back to account details"
            onBack={onBack}
            onHelp={() => {
              /* FLAGGED (6): no help/support screen exists yet. */
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
            {/* Body (447:468) — 24px between blocks. */}
            <View className="w-full gap-6">
              {/* Stepper Labels (447:469) */}
              <View className="w-full flex-row items-center justify-between">
                <Text className="font-label-sm text-label-sm text-primary">Step 1 of 3</Text>
                <Text className="font-label-sm text-label-sm text-on-surface-variant">
                  Verify contact
                </Text>
              </View>

              {/* Heading (447:472) */}
              <View className="w-full gap-2">
                <Text className="font-headline-xl text-headline-xl text-on-surface">
                  Verify your contact details
                </Text>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  Check the email from step 1, then add the phone number we&apos;ll text your
                  6-digit code to.
                </Text>
              </View>

              {/* Card / Contact (447:1214) — the shared <Card> primitive, whose
                  `card-surface` fill, `outline-variant` hairline, radius/24 and
                  token-tinted elevation are exactly this node's treatment. The
                  p-4 / gap-4 overrides are the designer's own flagged deviation
                  from Card / Form's 32/24 — FLAGGED (5). */}
              <Card className="w-full gap-4 p-4">
                {/* Email Context Row (445:1785) */}
                <View className="w-full gap-1">
                  <Text className="font-label-sm text-label-sm text-on-surface-variant">
                    Email from step 1
                  </Text>
                  {/* Read-only Email (445:1787) — `surface-container-low` with NO
                      hairline, deliberately, so it cannot be mistaken for an
                      editable field. 4px inset around a 44px action ⇒ 52px tall,
                      matching the phone control below it. */}
                  <View className="w-full flex-row items-center gap-3 overflow-hidden rounded-md bg-surface-container-low py-1 pl-4 pr-2">
                    {/* icon/chrome-mail (9:28) — its own Figma note says Health
                        Icons has no envelope, so this is the chrome escape
                        hatch. `on-surface-variant` pairs with the chip's
                        `surface-container-low` fill, as Input's leading icon
                        does. */}
                    <Icon chrome="mail-outline" size={20} color={onSurfaceVariant} />
                    <Text
                      className="flex-1 font-body-md text-body-md text-on-surface"
                      numberOfLines={1}
                    >
                      {email}
                    </Text>
                    {/* Change Action (445:1792) — 44px target. */}
                    <Pressable
                      onPress={onBack}
                      accessibilityRole="button"
                      accessibilityLabel="Change email"
                      accessibilityHint="Goes back to your account details to edit your email"
                      className="h-11 items-center justify-center px-2 active:opacity-70"
                    >
                      <Text className="font-label-md text-label-md text-primary">Change</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Phone Field Group (447:1224) */}
                <View className="w-full gap-2">
                  <Text className="font-label-md text-label-md text-on-surface">Phone number</Text>
                  <PhoneField
                    country={country}
                    onCountryChange={setCountry}
                    value={localNumber}
                    onChangeText={(next) => {
                      // Same permissive mask as the legacy screen: the user may
                      // type spaces, dashes and brackets; only digits are sent.
                      setLocalNumber(next.replace(/[^\d\s\-()]/g, ""));
                      setSendError(null);
                    }}
                    hasError={sendError !== null}
                    editable={!start.isPending && !isVerifying}
                  />
                  {/* Helper text (447:1236), doubling as the send-error slot —
                      FLAGGED (3). */}
                  {sendError ? (
                    <Text
                      className="w-full font-label-sm text-label-sm text-error"
                      accessibilityLiveRegion="polite"
                    >
                      {sendError}
                    </Text>
                  ) : (
                    <Text className="w-full font-label-sm text-label-sm text-on-surface-variant">
                      We&apos;ll text your 6-digit code to this number. Standard SMS rates may
                      apply.
                    </Text>
                  )}
                </View>
              </Card>

              {/* Code Section (447:1242) — 12px gaps. */}
              <View className="w-full gap-3">
                <Text className="font-label-md text-label-md text-on-surface">
                  {/* 447:1423 vs 447:1243 */}
                  {sent ? "Enter the 6-digit code" : "6-digit code"}
                </Text>

                <CodeBoxRow
                  value={code}
                  onChangeText={(next) => {
                    setCode(next);
                    // Clearing the error on edit is what turns the Error boxes
                    // back into Filled/Focused, matching the frame's transition
                    // out of state=invalid-code.
                    if (codeError) setCodeError(null);
                  }}
                  disabled={!sent || isVerifying}
                  hasError={hasCodeError}
                  accessibilityLabel="6-digit verification code"
                  accessibilityHint={
                    codeError ??
                    (sent
                      ? `Enter the code we sent to ${sentTo}`
                      : "Send a code to your phone number first")
                  }
                />

                {/* Caption (447:1253 / 447:1432), or the inline error (447:1508).
                    The error carries TEXT as well as colour, so colour is never
                    the only signal (WCAG 1.4.1, docs/BRAND.md). */}
                <Text
                  className={`w-full text-center font-label-sm text-label-sm ${
                    hasCodeError ? "text-error" : "text-on-surface-variant"
                  }`}
                  accessibilityLiveRegion={hasCodeError ? "polite" : "none"}
                >
                  {hasCodeError
                    ? codeError
                    : sent
                      ? `Sent to ${sentTo}` // FLAGGED (2): no code-expiry field.
                      : "We'll send the code to this number once you tap Send code."}
                </Text>

                {/* Resend Row (445:1808) — absent entirely from
                    state=code-not-sent, so it is not rendered before a send. */}
                {sent ? (
                  <Pressable
                    onPress={resend}
                    disabled={resendIn > 0 || start.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={
                      resendIn > 0 ? `Resend code in ${formatCooldown(resendIn)}` : "Resend code"
                    }
                    accessibilityState={{ disabled: resendIn > 0 || start.isPending }}
                    className="h-11 w-full flex-row items-center justify-center gap-2 active:opacity-70"
                  >
                    <Icon
                      chrome="refresh"
                      size={20}
                      color={resendIn > 0 ? onSurfaceVariant : primary}
                    />
                    <Text
                      className={`font-label-md text-label-md ${
                        resendIn > 0 ? "text-on-surface-variant" : "text-primary"
                      }`}
                    >
                      {resendIn > 0 ? `Resend code in ${formatCooldown(resendIn)}` : "Resend code"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* CTA (447:1261 / 447:1434) — 56px, radius/12, `primary`. The node
                  carries no effect, so `shadow={false}` rather than inheriting
                  the Button variant's default `elevation/cta`. */}
              <Button
                label={ctaLabel}
                variant="primary"
                size="cta"
                pill={false}
                shadow={false}
                loading={isVerifying}
                disabled={ctaDisabled}
                trailingIcon="arrow-forward"
                className="h-14"
                testID={sent ? "signup-verify.submit" : "signup-verify.send-sms"}
                onPress={sent ? submit : sendCode}
              />
            </View>
          </ScrollView>
        </KeyboardInset>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `mm:ss`, matching the frame's "Resend code in 0:42" (445:1807). */
function formatCooldown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** The legacy screen's ApiError branches, unchanged. */
function describeSendError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) {
      return "Looks like you already have an account. Try signing in instead.";
    }
    if (e.status === 429) {
      return e.message || "Please wait a moment before trying again.";
    }
    if (e.isNetwork) {
      return "Network error. Check your connection.";
    }
  }
  return "Couldn't send the code. Please try again.";
}

function describeVerifyError(e: unknown): string {
  // The frame's own copy for state=invalid-code (447:1508).
  if (e instanceof ApiError && e.status === 400) {
    return "That code doesn't match. Check the 6 digits, or resend a new code.";
  }
  return "Couldn't verify the code. Please try again.";
}
