// Sign-up verification step. Wedges between Step 1 and Step 2:
//
//   Step 1 (account)  →  Verify  →  Step 2 (about you)  →  Step 3 (security)
//
// Two sub-states inside one screen:
//   - "pick"  — user chooses email or phone. Email pre-fills from Step 1.
//               Phone is collected inline (Step 1 does not capture phone).
//   - "code"  — 6-digit input + resend timer. On success, the verification
//               token is written to the signup draft and we push to Step 2.
//
// Why one screen, not two routes: the back gesture from Step 2 should land
// the user back on the picker, not on a code-entry view with no context.

import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { ApiError } from "@/types/api";
import { useSignupOtpStart, useSignupOtpVerify } from "@/features/auth/hooks/use-signup-otp";

interface Props {
  /** Email collected at Step 1. Pre-fills the email-verify option. */
  email: string;
  /** Final submit handler, given the resulting verification triple. */
  onVerified: (verification: {
    channel: "sms" | "email";
    recipient: string;
    token: string;
  }) => void;
  onBack: () => void;
}

type Mode =
  | { state: "pick" }
  | { state: "code"; channel: "sms" | "email"; recipient: string; resendIn: number };

const E164 = /^\+[1-9]\d{6,14}$/;

export function SignUpVerifyScreen({ email, onVerified, onBack }: Props) {
  const [mode, setMode] = useState<Mode>({ state: "pick" });
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const start = useSignupOtpStart();
  const verify = useSignupOtpVerify();

  const phoneValid = useMemo(() => E164.test(phoneInput.trim()), [phoneInput]);

  // Resend countdown. The backend cooldown is server-side; we mirror it
  // in the button so the user knows when to retry without spamming.
  useEffect(() => {
    if (mode.state !== "code" || mode.resendIn <= 0) return;
    const t = setInterval(() => {
      setMode((m) =>
        m.state === "code" && m.resendIn > 0
          ? { ...m, resendIn: m.resendIn - 1 }
          : m,
      );
    }, 1000);
    return () => clearInterval(t);
  }, [mode.state, mode.state === "code" ? mode.resendIn : 0]);

  const begin = async (channel: "sms" | "email", recipient: string) => {
    setError(null);
    try {
      const { expiresIn } = await start.mutateAsync({ channel, recipient });
      setMode({ state: "code", channel, recipient, resendIn: expiresIn });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409) {
          setError("Looks like you already have an account. Try signing in instead.");
          return;
        }
        if (e.status === 429) {
          setError(e.message || "Please wait a moment before trying again.");
          return;
        }
        if (e.isNetwork) {
          setError("Network error. Check your connection.");
          return;
        }
      }
      setError("Couldn't send the code. Please try again.");
    }
  };

  const resend = async () => {
    if (mode.state !== "code" || mode.resendIn > 0) return;
    await begin(mode.channel, mode.recipient);
  };

  const submit = async () => {
    if (mode.state !== "code") return;
    setError(null);
    try {
      const { verificationToken } = await verify.mutateAsync({
        channel: mode.channel,
        recipient: mode.recipient,
        code,
      });
      onVerified({
        channel: mode.channel,
        recipient: mode.recipient,
        token: verificationToken,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setError("That code didn't match. Check it and try again.");
        return;
      }
      setError("Couldn't verify the code. Please try again.");
    }
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 24,
              paddingTop: 32,
              paddingBottom: 64,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="mx-auto w-full max-w-[440px]">
              {/* Header */}
              <Pressable
                onPress={onBack}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Back"
                className="mb-md flex-row items-center"
              >
                <MaterialIcons name="arrow-back" size={24} color="#171d1c" />
                <Text className="font-label-md text-label-md ml-xs text-on-surface">
                  Back
                </Text>
              </Pressable>

              <Text className="font-headline-lg text-headline-lg tracking-tight text-primary">
                Verify your contact
              </Text>
              <Text className="font-body-md text-body-md mt-xs text-on-surface-variant">
                {mode.state === "pick"
                  ? "Pick a way for us to confirm you. We'll send a 6-digit code."
                  : "Enter the 6-digit code we just sent."}
              </Text>

              {/* Card */}
              <View
                className="mt-md rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
                style={{
                  shadowColor: "#475569",
                  shadowOpacity: 0.05,
                  shadowRadius: 20,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 2,
                }}
              >
                {mode.state === "pick" ? (
                  <PickerView
                    email={email}
                    phoneInput={phoneInput}
                    setPhoneInput={setPhoneInput}
                    phoneValid={phoneValid}
                    isLoading={start.isPending}
                    onPickEmail={() => begin("email", email)}
                    onPickPhone={() => begin("sms", phoneInput.trim())}
                  />
                ) : (
                  <CodeEntryView
                    channel={mode.channel}
                    recipient={mode.recipient}
                    code={code}
                    setCode={setCode}
                    onSubmit={submit}
                    onResend={resend}
                    resendIn={mode.resendIn}
                    onChangeChannel={() => {
                      setMode({ state: "pick" });
                      setCode("");
                      setError(null);
                    }}
                    isSubmitting={verify.isPending}
                  />
                )}

                {error && (
                  <View className="mt-sm rounded-lg bg-error-container px-md py-sm">
                    <Text
                      className="font-label-sm text-label-sm text-on-error-container"
                      accessibilityLiveRegion="polite"
                    >
                      {error}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────

interface PickerProps {
  email: string;
  phoneInput: string;
  setPhoneInput: (s: string) => void;
  phoneValid: boolean;
  isLoading: boolean;
  onPickEmail: () => void;
  onPickPhone: () => void;
}

function PickerView({
  email,
  phoneInput,
  setPhoneInput,
  phoneValid,
  isLoading,
  onPickEmail,
  onPickPhone,
}: PickerProps) {
  return (
    <View>
      <ChannelCard
        icon="mail-outline"
        title="Email"
        subtitle={email}
        disabled={isLoading}
        onPress={onPickEmail}
      />

      <View className="my-sm flex-row items-center gap-sm">
        <View className="h-px flex-1 bg-outline-variant/30" />
        <Text className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
          Or
        </Text>
        <View className="h-px flex-1 bg-outline-variant/30" />
      </View>

      <Text className="font-label-md text-label-md ml-xs text-on-surface-variant">
        Phone number
      </Text>
      <View
        className="mt-xs flex-row items-center rounded-lg bg-surface px-sm"
        style={{ borderWidth: 1, borderColor: "#bcc9c6" }}
      >
        <MaterialIcons name="phone-iphone" size={20} color="#6d7a77" />
        <TextInput
          value={phoneInput}
          onChangeText={setPhoneInput}
          placeholder="+233241234567"
          placeholderTextColor="#bcc9c6"
          keyboardType="phone-pad"
          autoCorrect={false}
          autoComplete="tel"
          textContentType="telephoneNumber"
          style={{
            flex: 1,
            marginLeft: 8,
            paddingVertical: 12,
            color: "#171d1c",
            fontSize: 16,
            lineHeight: 20,
          }}
        />
      </View>
      <Text className="font-label-sm text-label-sm ml-xs mt-xs text-outline">
        Include country code, e.g. +233 for Ghana.
      </Text>

      <Pressable
        onPress={onPickPhone}
        disabled={!phoneValid || isLoading}
        testID="signup-verify.send-sms"
        accessibilityRole="button"
        accessibilityLabel="Send code by SMS"
        accessibilityState={{ disabled: !phoneValid || isLoading }}
        style={({ pressed }) => ({
          opacity: !phoneValid || isLoading ? 0.5 : 1,
          backgroundColor: pressed ? "#008378" : "#00685f",
        })}
        className="mt-md w-full flex-row items-center justify-center gap-base rounded-lg py-md active:scale-[0.98]"
      >
        <MaterialIcons name="sms" size={20} color="#ffffff" />
        <Text className="font-label-md text-label-md text-on-primary">
          Send code by SMS
        </Text>
      </Pressable>
    </View>
  );
}

interface ChannelCardProps {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  title: string;
  subtitle: string;
  disabled: boolean;
  onPress: () => void;
}

function ChannelCard({ icon, title, subtitle, disabled, onPress }: ChannelCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Verify with ${title}: ${subtitle}`}
      style={{ opacity: disabled ? 0.5 : 1 }}
      className="flex-row items-center gap-sm rounded-xl border border-outline-variant bg-surface p-md active:scale-[0.98]"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-container">
        <MaterialIcons name={icon} size={20} color="#00685f" />
      </View>
      <View className="flex-1">
        <Text className="font-label-md text-label-md text-on-surface">{title}</Text>
        <Text className="font-label-sm text-label-sm text-on-surface-variant" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#6d7a77" />
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────

interface CodeEntryProps {
  channel: "sms" | "email";
  recipient: string;
  code: string;
  setCode: (s: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onChangeChannel: () => void;
  resendIn: number;
  isSubmitting: boolean;
}

function CodeEntryView({
  channel,
  recipient,
  code,
  setCode,
  onSubmit,
  onResend,
  onChangeChannel,
  resendIn,
  isSubmitting,
}: CodeEntryProps) {
  return (
    <View>
      <Text className="font-body-sm text-body-sm text-on-surface-variant">
        Sent to{" "}
        <Text className="font-label-md text-label-md text-on-surface">{recipient}</Text>
        {channel === "sms" ? " by SMS" : " by email"}.
      </Text>

      <Text className="font-label-md text-label-md ml-xs mt-md text-on-surface-variant">
        Verification code
      </Text>
      <View
        className="mt-xs rounded-lg bg-surface px-sm"
        style={{ borderWidth: 1, borderColor: "#bcc9c6" }}
      >
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
          placeholder="• • • • • •"
          placeholderTextColor="#bcc9c6"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          style={{
            paddingVertical: 14,
            color: "#171d1c",
            fontSize: 22,
            letterSpacing: 8,
            textAlign: "center",
          }}
        />
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={code.length !== 6 || isSubmitting}
        testID="signup-verify.submit"
        accessibilityRole="button"
        accessibilityLabel="Verify code"
        accessibilityState={{ disabled: code.length !== 6 || isSubmitting }}
        style={({ pressed }) => ({
          opacity: code.length !== 6 || isSubmitting ? 0.5 : 1,
          backgroundColor: pressed ? "#008378" : "#00685f",
        })}
        className="mt-md w-full flex-row items-center justify-center gap-base rounded-lg py-md active:scale-[0.98]"
      >
        <Text className="font-label-md text-label-md text-on-primary">
          {isSubmitting ? "Verifying…" : "Verify"}
        </Text>
        {!isSubmitting && <MaterialIcons name="check" size={20} color="#ffffff" />}
      </Pressable>

      <View className="mt-md flex-row items-center justify-between">
        <Pressable onPress={onChangeChannel} hitSlop={8} accessibilityRole="button">
          <Text className="font-label-sm text-label-sm text-primary">Change channel</Text>
        </Pressable>
        <Pressable
          onPress={onResend}
          disabled={resendIn > 0}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          accessibilityState={{ disabled: resendIn > 0 }}
        >
          <Text
            className="font-label-sm text-label-sm"
            style={{ color: resendIn > 0 ? "#6d7a77" : "#00685f" }}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
