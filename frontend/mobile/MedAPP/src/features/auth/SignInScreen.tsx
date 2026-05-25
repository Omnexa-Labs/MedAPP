// Sign-in screen — translated from the Stitch HTML.
//
// RHF + zod for the form, useLogin for the network call, useAuthStore for the
// success side-effect (handled inside useLogin). The screen itself just
// renders the form and surfaces errors.
//
// Translation rules applied (see splash for the full list):
//  - filter blur on hero image and corner blobs → low-opacity solid (RN blur
//    is expensive; visually equivalent at these opacities).
//  - hover:* / group-hover:* → dropped.
//  - focus:ring-2 focus:border-primary → onFocus toggles border color.
//  - cursor:pointer → drop (RN has no cursor).
//  - <input type=checkbox> → custom Pressable checkbox; no checkbox primitive
//    in core RN.

import { useState } from "react";
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
import { Link } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MaterialIcons } from "@expo/vector-icons";
import { ApiError } from "@/types/api";
import { LoginSchema, type LoginFormValues } from "@/features/auth/schema";
import { useLogin } from "@/features/auth/hooks/use-login";

interface Props {
  onSuccess?: () => void;
}

export function SignInScreen({ onSuccess }: Props) {
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    setFormError(null);
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
      <StatusBar style="dark" />

      {/* Decorative corner blobs — Stitch uses heavy blur + low opacity.
          Solid low-opacity circles read identically at these scales. */}
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
            // No justifyContent here — on Android, flexGrow + justifyContent
            // center clips bottom-overflow content (the footer with HIPAA +
            // Privacy/Terms was getting cut off below the fold without being
            // reachable by scrolling). Top-aligned with generous top padding
            // gives the visual breathing room without breaking overflow.
            contentContainerStyle={{
              // flexGrow lets the inner view fill the viewport and lets
              // scrolling kick in when the form is taller than the screen.
              // paddingBottom is generous so the HIPAA + Privacy/Terms block
              // clears the Pixel 5's gesture nav bar even when keyboard is
              // closed.
              flexGrow: 1,
              paddingHorizontal: 24,
              paddingTop: 32,
              paddingBottom: 64,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="mx-auto w-full max-w-[440px]">
              {/* Logo + header.
                  Stitch ships mb-xl (80px) — too much on a phone. mb-lg keeps
                  the breathing room without blowing past the fold. */}
              <View className="mb-lg items-center">
                <View
                  className="mb-md h-16 w-16 items-center justify-center rounded-xl bg-primary-container active:scale-95"
                  style={{
                    shadowColor: "#475569",
                    shadowOpacity: 0.15,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 4,
                  }}
                >
                  <MaterialIcons name="medical-services" size={32} color="#f4fffc" />
                </View>
                <Text className="font-headline-lg text-headline-lg tracking-tight text-primary">
                  MedApp
                </Text>
                <Text className="font-body-md text-body-md mt-xs text-on-surface-variant">
                  Secure Healthcare Access
                </Text>
              </View>

              {/* Login card.
                  Stitch uses p-xl (80px) — comically huge on a phone. p-md
                  (24px) is the standard card inset across Material 3 mobile. */}
              <View
                className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
                style={{
                  shadowColor: "#475569",
                  shadowOpacity: 0.05,
                  shadowRadius: 20,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 2,
                }}
              >
                {/* Email field */}
                <View className="space-y-xs">
                  <Text className="font-label-md text-label-md ml-xs text-on-surface-variant">
                    Email Address
                  </Text>
                  <Controller
                    control={control}
                    name="email"
                    render={({ field }) => (
                      <InputWithIcon
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
                      />
                    )}
                  />
                  {errors.email && (
                    <Text className="font-label-sm text-label-sm ml-xs text-error">
                      {errors.email.message}
                    </Text>
                  )}
                </View>

                {/* Password field */}
                <View className="mt-md space-y-xs">
                  <View className="ml-xs flex-row items-center justify-between">
                    <Text className="font-label-md text-label-md text-on-surface-variant">
                      Password
                    </Text>
                    <Text className="font-label-sm text-label-sm text-primary">
                      Forgot Password?
                    </Text>
                  </View>
                  <Controller
                    control={control}
                    name="password"
                    render={({ field }) => (
                      <InputWithIcon
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
                        trailing={
                          <Pressable
                            onPress={() => setShowPassword((s) => !s)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                          >
                            <MaterialIcons
                              name={showPassword ? "visibility-off" : "visibility"}
                              size={20}
                              color="#6d7a77"
                            />
                          </Pressable>
                        }
                      />
                    )}
                  />
                  {errors.password && (
                    <Text className="font-label-sm text-label-sm ml-xs text-error">
                      {errors.password.message}
                    </Text>
                  )}
                </View>

                {/* Remember me */}
                <View className="mt-md flex-row items-center justify-between py-xs">
                  <Controller
                    control={control}
                    name="rememberMe"
                    render={({ field }) => (
                      <Pressable
                        className="flex-row items-center"
                        onPress={() => field.onChange(!field.value)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!field.value }}
                      >
                        <View
                          className={`h-4 w-4 items-center justify-center rounded border ${
                            field.value
                              ? "border-primary bg-primary"
                              : "border-outline-variant bg-transparent"
                          }`}
                        >
                          {field.value ? (
                            <MaterialIcons name="check" size={12} color="#ffffff" />
                          ) : null}
                        </View>
                        <Text className="font-label-md text-label-md ml-base text-on-surface-variant">
                          Remember me
                        </Text>
                      </Pressable>
                    )}
                  />
                </View>

                {/* Form-level error */}
                {formError && (
                  <View className="mt-sm rounded-lg bg-error-container px-md py-sm">
                    <Text
                      className="font-label-sm text-label-sm text-on-error-container"
                      accessibilityLiveRegion="polite"
                    >
                      {formError}
                    </Text>
                  </View>
                )}

                {/* Submit */}
                <Pressable
                  testID="signin.submit"
                  accessibilityRole="button"
                  accessibilityLabel="Log in"
                  onPress={onSubmit}
                  disabled={isSubmitting}
                  className="mt-md w-full flex-row items-center justify-center gap-base rounded-lg bg-primary py-md active:scale-[0.98]"
                  style={({ pressed }) => ({
                    opacity: isSubmitting ? 0.6 : 1,
                    backgroundColor: pressed ? "#008378" : "#00685f",
                    shadowColor: "#00685f",
                    shadowOpacity: 0.15,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 3,
                  })}
                >
                  <Text className="font-label-md text-label-md text-on-primary">
                    {isSubmitting ? "Signing in…" : "Log In"}
                  </Text>
                  {!isSubmitting && (
                    <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />
                  )}
                </Pressable>

                {/* Divider */}
                <View className="my-sm flex-row items-center gap-sm py-sm">
                  <View className="h-px flex-1 bg-outline-variant/30" />
                  <Text className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                    Or continue with
                  </Text>
                  <View className="h-px flex-1 bg-outline-variant/30" />
                </View>

                {/* Biometric grid */}
                <View className="flex-row gap-sm">
                  <BiometricButton
                    icon="face"
                    label="FaceID"
                    onPress={() => {
                      /* TODO: biometric auth — pending expo-local-authentication wire-up */
                    }}
                  />
                  <BiometricButton
                    icon="fingerprint"
                    label="Fingerprint"
                    onPress={() => {
                      /* TODO: biometric auth — pending expo-local-authentication wire-up */
                    }}
                  />
                </View>
              </View>

              {/* Footer */}
              <View className="mt-lg items-center">
                <View className="flex-row items-center">
                  <Text className="font-body-md text-body-md text-on-surface-variant">
                    Don&apos;t have an account?{" "}
                  </Text>
                  <Link
                    href="/(public)/sign-up"
                    className="font-label-md text-label-md ml-xs text-primary"
                  >
                    Sign Up
                  </Link>
                </View>

                <View className="mt-md items-center">
                  <View className="flex-row items-center gap-xs">
                    <MaterialIcons name="verified-user" size={16} color="#6d7a77" />
                    <Text className="font-label-sm text-label-sm text-outline">
                      HIPAA Compliant &amp; Secure
                    </Text>
                  </View>
                  <View className="mt-xs flex-row gap-md">
                    <Text className="font-label-sm text-label-sm text-outline">
                      Privacy Policy
                    </Text>
                    <Text className="font-label-sm text-label-sm text-outline">
                      Terms of Service
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local primitives. Promote to components/ui/ once a second screen needs them.
// ---------------------------------------------------------------------------

type InputProps = React.ComponentProps<typeof TextInput> & {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  hasError?: boolean;
  trailing?: React.ReactNode;
};

function InputWithIcon({ icon, hasError, trailing, ...inputProps }: InputProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = hasError ? "#ba1a1a" : focused ? "#00685f" : "#bcc9c6";

  return (
    <View
      className="flex-row items-center rounded-lg bg-surface px-sm"
      style={{ borderWidth: focused ? 2 : 1, borderColor }}
    >
      <MaterialIcons name={icon} size={20} color="#6d7a77" />
      <TextInput
        {...inputProps}
        placeholderTextColor="#bcc9c6"
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        style={{
          flex: 1,
          marginLeft: 8,
          paddingVertical: 12,
          color: "#171d1c",
          fontSize: 16,
          lineHeight: 20,
        }}
      />
      {trailing}
    </View>
  );
}

interface BiometricButtonProps {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  onPress: () => void;
}

function BiometricButton({ icon, label, onPress }: BiometricButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center justify-center rounded-xl border border-outline-variant bg-surface p-sm active:scale-95"
    >
      <MaterialIcons name={icon} size={24} color="#00685f" />
      <Text className="font-label-sm text-label-sm mt-xs text-on-surface-variant">{label}</Text>
    </Pressable>
  );
}
