// Email verification closes Step 1 of the signup flow. Keep the existing
// signup shell, contact card and six-digit code states. Code expiry and resend
// cooldown come from separate server fields; neither is a promise of delivery.
import { useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Button, Card, Icon, InfoCallout, KeyboardInset } from "@/components/ui";
import { SignupAppBar } from "./components/SignupAppBar";
import { CODE_LENGTH, CodeBoxRow } from "./components/CodeBoxRow";
import { useSignupOtpStart, useSignupOtpVerify } from "./hooks/use-signup-otp";
import { useResolvedScheme } from "@/lib/theme";
import { useTokenColor } from "@/lib/tokens";
import { ApiError } from "@/types/api";

interface Props {
  email: string;
  onVerified: (verification: {
    channel: "sms" | "email";
    recipient: string;
    token: string;
  }) => void;
  onBack: () => void;
}

interface Delivery {
  recipient: string;
  expiresAt: number;
  resendAt: number;
}

export function SignUpVerifyScreen({ email, onVerified, onBack }: Props) {
  const contact = email.trim();
  const { scheme } = useResolvedScheme();
  const muted = useTokenColor("on-surface-variant");
  const primary = useTokenColor("primary");
  const [code, setCode] = useState("");
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [now, setNow] = useState(Date.now);
  const [sendError, setSendError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const requestVersion = useRef(0);
  const inFlight = useRef(false);
  const start = useSignupOtpStart();
  const verify = useSignupOtpVerify();
  const busy = start.isPending || verify.isPending;

  useEffect(() => {
    requestVersion.current += 1;
    inFlight.current = false;
    setDelivery(null);
    setCode("");
    setSendError(null);
    setCodeError(null);
    return () => {
      requestVersion.current += 1;
    };
  }, [contact]);

  useEffect(() => {
    if (!delivery) return;
    const endAt = Math.max(delivery.expiresAt, delivery.resendAt);
    const tick = () => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (timestamp >= endAt) clearInterval(timer);
    };
    const timer = setInterval(tick, 1000);
    tick();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [delivery]);

  const sent = delivery !== null && delivery.recipient === contact;
  const expiresIn = sent ? Math.max(0, Math.ceil((delivery.expiresAt - now) / 1000)) : 0;
  const resendIn = sent ? Math.max(0, Math.ceil((delivery.resendAt - now) / 1000)) : 0;
  const expired = sent && expiresIn === 0;
  const visibleCodeError = expired ? "This code has expired. Request a new code." : codeError;

  const back = () => {
    requestVersion.current += 1;
    onBack();
  };

  const sendCode = async () => {
    if (!contact || inFlight.current || busy) return;
    if (sent && delivery.resendAt > Date.now()) return;
    const version = requestVersion.current;
    inFlight.current = true;
    setSendError(null);
    setCodeError(null);
    try {
      const result = await start.mutateAsync({ channel: "email", recipient: contact });
      if (requestVersion.current !== version) return;
      const requestedAt = Date.now();
      setNow(requestedAt);
      setDelivery({
        recipient: contact,
        expiresAt: requestedAt + result.expiresIn * 1000,
        resendAt: requestedAt + result.resendAfterSeconds * 1000,
      });
      setCode("");
    } catch (error) {
      if (requestVersion.current === version) setSendError(describeSendError(error));
    } finally {
      if (requestVersion.current === version) inFlight.current = false;
    }
  };

  const submit = async () => {
    if (
      !sent ||
      delivery.expiresAt <= Date.now() ||
      code.length !== CODE_LENGTH ||
      inFlight.current ||
      busy
    )
      return;
    const version = requestVersion.current;
    inFlight.current = true;
    setCodeError(null);
    setSendError(null);
    try {
      const result = await verify.mutateAsync({ channel: "email", recipient: contact, code });
      if (requestVersion.current !== version) return;
      setCode("");
      onVerified({ channel: "email", recipient: contact, token: result.verificationToken });
    } catch (error) {
      if (requestVersion.current === version) setCodeError(describeVerifyError(error));
    } finally {
      if (requestVersion.current === version) inFlight.current = false;
    }
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <SafeAreaView className="flex-1" edges={Platform.OS === "web" ? [] : ["top", "bottom"]}>
        <KeyboardInset>
          <SignupAppBar
            step={1}
            backLabel="Back to account details"
            onBack={back}
            onHelp={() => setShowHelp((value) => !value)}
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
            <View className="w-full gap-6">
              <View className="w-full flex-row items-center justify-between">
                <Text className="font-label-sm text-label-sm text-primary">Step 1 of 3</Text>
                <Text className="font-label-sm text-label-sm text-on-surface-variant">
                  Verify contact
                </Text>
              </View>
              <View className="w-full gap-2">
                <Text
                  accessibilityRole="header"
                  className="font-headline-xl text-headline-xl text-on-surface"
                >
                  Verify your email
                </Text>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  We&apos;ll email a 6-digit code to the address from step 1.
                </Text>
              </View>
              {showHelp ? (
                <InfoCallout>
                  Check your inbox and spam folder. Use Resend code if you need a new code, or
                  Change to correct your email.
                </InfoCallout>
              ) : null}
              <Card className="w-full gap-4 p-4">
                <View className="w-full gap-1">
                  <Text className="font-label-sm text-label-sm text-on-surface-variant">
                    Email from step 1
                  </Text>
                  <View className="w-full flex-row items-center gap-3 overflow-hidden rounded-md bg-surface-container-low py-1 pl-4 pr-2">
                    <Icon chrome="mail-outline" size={20} color={muted} />
                    <Text
                      className="flex-1 font-body-md text-body-md text-on-surface"
                      numberOfLines={1}
                    >
                      {contact}
                    </Text>
                    <Pressable
                      onPress={back}
                      accessibilityRole="button"
                      accessibilityLabel="Change email"
                      accessibilityHint="Goes back to your account details to edit your email"
                      className="h-11 items-center justify-center px-2 active:opacity-70"
                    >
                      <Text className="font-label-md text-label-md text-primary">Change</Text>
                    </Pressable>
                  </View>
                </View>
                {sendError ? (
                  <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    className="font-label-sm text-label-sm text-error"
                  >
                    {sendError}
                  </Text>
                ) : null}
              </Card>
              <View className="w-full gap-3">
                <Text className="font-label-md text-label-md text-on-surface">
                  {sent ? "Enter the 6-digit code" : "6-digit code"}
                </Text>
                <CodeBoxRow
                  value={code}
                  onChangeText={(value) => {
                    setCode(value);
                    setCodeError(null);
                  }}
                  disabled={!sent || expired || busy}
                  hasError={visibleCodeError !== null}
                  accessibilityLabel="6-digit verification code"
                  accessibilityHint={
                    visibleCodeError ??
                    (sent
                      ? `Enter the code we sent to ${contact}`
                      : "Send a code to your email first")
                  }
                />
                <Text
                  className={`w-full text-center font-label-sm text-label-sm ${visibleCodeError ? "text-error" : "text-on-surface-variant"}`}
                  accessibilityLiveRegion={visibleCodeError ? "polite" : "none"}
                >
                  {visibleCodeError ??
                    (sent ? `Sent to ${contact}` : "Tap Send code, then check your inbox.")}
                </Text>
                {sent && !expired ? (
                  <Text className="text-center font-label-sm text-label-sm text-on-surface-variant">{`Code expires in ${formatCooldown(expiresIn)}`}</Text>
                ) : null}
                {sent ? (
                  <Pressable
                    onPress={sendCode}
                    disabled={resendIn > 0 || busy}
                    accessibilityRole="button"
                    accessibilityLabel={
                      resendIn > 0 ? `Resend code in ${formatCooldown(resendIn)}` : "Resend code"
                    }
                    accessibilityState={{ disabled: resendIn > 0 || busy }}
                    className="h-11 w-full flex-row items-center justify-center gap-2 active:opacity-70"
                  >
                    <Icon
                      chrome="refresh"
                      size={20}
                      color={resendIn > 0 || busy ? muted : primary}
                    />
                    <Text
                      className={`font-label-md text-label-md ${resendIn > 0 || busy ? "text-on-surface-variant" : "text-primary"}`}
                    >
                      {resendIn > 0 ? `Resend code in ${formatCooldown(resendIn)}` : "Resend code"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Button
                label={!sent ? "Send code" : "Verify and continue"}
                variant="primary"
                size="cta"
                pill={false}
                shadow={false}
                loading={busy}
                disabled={busy || (!sent ? !contact : expired || code.length !== CODE_LENGTH)}
                trailingIcon="arrow-forward"
                className="h-14"
                testID={sent ? "signup-verify.submit" : "signup-verify.send-email"}
                onPress={sent ? submit : sendCode}
              />
            </View>
          </ScrollView>
        </KeyboardInset>
      </SafeAreaView>
    </View>
  );
}

function formatCooldown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function describeSendError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return "Looks like you already have an account. Try signing in instead.";
    if (error.status === 429) return error.message || "Please wait a moment before trying again.";
    if (error.status === 503)
      return "Email verification is temporarily unavailable. Please try again later.";
    if (error.isNetwork) return "Network error. Check your connection and try again.";
  }
  return "Couldn't send the code. Please try again.";
}

function describeVerifyError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400)
    return "That code is invalid or has expired. Check the 6 digits, or resend a new code.";
  return "Couldn't verify the code. Please try again.";
}
