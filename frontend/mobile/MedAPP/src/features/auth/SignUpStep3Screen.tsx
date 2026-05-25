// Sign-up Step 3 — "Secure your account".
//
// Translation calls vs. the Stitch HTML:
//   - The md:grid-cols-12 two-column layout (toggles 7/12 left, compliance
//     card 5/12 right) becomes a vertical stack on phone.
//   - The hero "secure server room" image inside the compliance card is
//     dropped — desktop filler.
//   - The Stitch toggle is a styled checkbox + sibling label that animates
//     on :checked. RN doesn't do sibling selectors; we use a Pressable that
//     animates its inner dot via flex alignment + Animated would be overkill
//     here, so the dot just hard-snaps. Visually equivalent at this size.
//   - The "?" help button in the Stitch top bar is dropped (no destination
//     yet). Back arrow stays.

import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SignUpStep3Schema, type SignUpStep3Values } from "@/features/auth/schema";

interface Props {
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onBack?: () => void;
  onSubmit?: (values: SignUpStep3Values) => void;
}

export function SignUpStep3Screen({ isSubmitting, errorMessage, onBack, onSubmit }: Props) {
  const { control, handleSubmit } = useForm<SignUpStep3Values>({
    resolver: zodResolver(SignUpStep3Schema),
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
      <StatusBar style="dark" />

      {/* Decorative corner blobs — match Step 1 / Step 2 for continuity. */}
      <View
        pointerEvents="none"
        className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary-fixed opacity-10"
      />
      <View
        pointerEvents="none"
        className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-tertiary-fixed opacity-[0.05]"
      />

      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 64,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="mx-auto w-full max-w-[480px]">
              {/* Top row: back + step indicator. */}
              <View className="mb-md flex-row items-center justify-between">
                <Pressable
                  onPress={onBack}
                  accessibilityRole="button"
                  accessibilityLabel="Back to step 2"
                  hitSlop={8}
                  className="flex-row items-center gap-xs active:opacity-70"
                >
                  <MaterialIcons name="arrow-back" size={20} color="#3d4947" />
                  <Text className="font-label-md text-label-md text-on-surface-variant">
                    Back
                  </Text>
                </Pressable>
                <Text className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Step 3 of 3
                </Text>
              </View>

              {/* Progress bar — full width gradient at 100%. */}
              <View className="mb-lg">
                <View className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
                  <LinearGradient
                    colors={["#00685f", "#008378"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ height: "100%", width: "100%", borderRadius: 9999 }}
                  />
                </View>
              </View>

              {/* Header */}
              <View className="mb-lg items-center">
                <View className="mb-md h-20 w-20 items-center justify-center rounded-full bg-primary-container/20">
                  <MaterialIcons name="shield" size={36} color="#00685f" />
                </View>
                <Text className="font-headline-lg-mobile text-headline-lg-mobile text-center text-on-surface">
                  Secure your account
                </Text>
                <Text className="font-body-md text-body-md mt-sm max-w-[340px] text-center text-on-surface-variant">
                  Your privacy is our priority. Enable security features to keep your health
                  data safe and compliant with the highest medical standards.
                </Text>
              </View>

              {/* Toggle: Biometric */}
              <Controller
                control={control}
                name="enableBiometric"
                render={({ field }) => (
                  <ToggleRow
                    icon="fingerprint"
                    title="Enable Biometric Login"
                    description="Use FaceID or Fingerprint for faster, secure access to your medical records."
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />

              {/* Toggle: 2FA */}
              <View className="mt-md">
                <Controller
                  control={control}
                  name="enableTwoFactor"
                  render={({ field }) => (
                    <ToggleRow
                      icon="key"
                      title="Two-Factor Authentication"
                      description="Add an extra layer of security by requiring a code sent to your mobile device."
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </View>

              {/* Toggle: Anonymous data sharing */}
              <View className="mt-md">
                <Controller
                  control={control}
                  name="shareAnonymousData"
                  render={({ field }) => (
                    <ToggleRow
                      icon="data-usage"
                      title="Health Data Sharing"
                      description="Anonymously share data with medical researchers to help advance healthcare technology."
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </View>

              {/* Compliance card */}
              <View className="mt-md rounded-xl border border-outline-variant/30 bg-surface-container p-md">
                <View className="mb-base flex-row items-center gap-sm">
                  <MaterialIcons name="verified-user" size={20} color="#00685f" />
                  <Text className="font-label-md text-label-md text-primary">
                    Compliance &amp; Protection
                  </Text>
                </View>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  Your data is encrypted using AES-256 bit encryption and stored on secure,
                  local-compliant servers. We strictly adhere to{" "}
                  <Text className="font-label-md text-label-md text-on-surface">HIPAA</Text> and{" "}
                  <Text className="font-label-md text-label-md text-on-surface">GDPR</Text>{" "}
                  regulations.
                </Text>
                <View className="mt-md flex-row items-center gap-sm rounded-lg bg-surface p-sm">
                  <MaterialIcons name="lock-clock" size={18} color="#6d7a77" />
                  <Text className="font-label-sm text-label-sm text-on-surface-variant">
                    Last security audit completed: Oct 2026
                  </Text>
                </View>
              </View>

              {/* Form-level error */}
              {errorMessage ? (
                <View className="mt-md rounded-lg bg-error-container px-md py-sm">
                  <Text
                    className="font-label-sm text-label-sm text-on-error-container"
                    accessibilityLiveRegion="polite"
                  >
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              {/* Submit */}
              <View className="pt-lg">
                <Pressable
                  testID="signup.step3.submit"
                  accessibilityRole="button"
                  accessibilityLabel="Complete setup"
                  onPress={submit}
                  disabled={isSubmitting}
                  className="w-full flex-row items-center justify-center gap-base rounded-full bg-primary px-lg py-4 active:scale-[0.98]"
                  style={({ pressed }) => ({
                    opacity: isSubmitting ? 0.6 : 1,
                    backgroundColor: pressed ? "#008378" : "#00685f",
                    shadowColor: "#00685f",
                    shadowOpacity: 0.25,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 6,
                  })}
                >
                  <Text className="font-label-md text-label-md text-on-primary">
                    {isSubmitting ? "Securing profile…" : "Complete Setup"}
                  </Text>
                  {!isSubmitting && (
                    <MaterialIcons name="check-circle" size={20} color="#ffffff" />
                  )}
                </Pressable>
                <Text className="font-label-sm text-label-sm mt-md px-md text-center text-on-surface-variant">
                  By completing setup, you agree to our{" "}
                  <Text className="text-primary">Terms of Service</Text> and{" "}
                  <Text className="text-primary">Privacy Policy</Text>.
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local primitives.
// ---------------------------------------------------------------------------

function ToggleRow({
  icon,
  title,
  description,
  value,
  onValueChange,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  title: string;
  description: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      className="flex-row items-center justify-between rounded-xl border border-outline-variant/30 bg-surface-container-lowest/80 p-md active:opacity-95"
      style={{
        shadowColor: "#475569",
        shadowOpacity: 0.05,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
    >
      <View className="flex-1 flex-row items-start gap-sm">
        <View className="rounded-lg bg-secondary-container/30 p-sm">
          <MaterialIcons name={icon} size={22} color="#515f74" />
        </View>
        <View className="flex-1">
          <Text className="font-label-md text-label-md text-on-surface">{title}</Text>
          <Text className="font-label-sm text-label-sm mt-xs text-on-surface-variant">
            {description}
          </Text>
        </View>
      </View>
      <Toggle value={value} />
    </Pressable>
  );
}

function Toggle({ value }: { value: boolean }) {
  return (
    <View
      className={`ml-sm h-6 w-12 justify-center rounded-full px-0.5 ${
        value ? "bg-primary" : "bg-outline-variant"
      }`}
    >
      <View
        className="h-5 w-5 rounded-full bg-white"
        style={{
          transform: [{ translateX: value ? 22 : 0 }],
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}
      />
    </View>
  );
}
