// Sign-up Step 1 — "Create account".
//
// Translated from the Stitch HTML the user pasted. Same translation rules as
// SignInScreen:
//   - The desktop split layout (hidden md:flex left column with hero image +
//     trust badge) is dropped — this is a phone app.
//   - filter blur on decorative blobs → low-opacity solid circles.
//   - hover:* / group-hover:* → dropped.
//   - <input type=checkbox> → custom Pressable checkbox.
//   - The Stitch dump uses font-headline-lg (32px) for the card title; the
//     SignIn screen already established the mobile pattern of swapping to
//     headline-lg-mobile (24px), so this screen does the same.
//
// On submit, Step 1 just hands its values to the parent (the route) so the
// flow can progress to Step 2 — no network call here.

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
import { SignUpStep1Schema, type SignUpStep1Values } from "@/features/auth/schema";

interface Props {
  onNext?: (values: SignUpStep1Values) => void;
}

export function SignUpStep1Screen({ onNext }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpStep1Values>({
    resolver: zodResolver(SignUpStep1Schema),
    defaultValues: {
      firstName: "",
      middleName: "",
      lastName: "",
      email: "",
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
      <StatusBar style="dark" />

      {/* Decorative corner blobs — matches SignIn for visual continuity.
          On web, RN-Web warns about the `pointerEvents` prop; use
          style.pointerEvents there. Native still wants the prop. */}
      <View
        pointerEvents={Platform.OS === "web" ? undefined : "none"}
        style={Platform.OS === "web" ? { pointerEvents: "none" } : undefined}
        className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary-fixed opacity-10"
      />
      <View
        pointerEvents={Platform.OS === "web" ? undefined : "none"}
        style={Platform.OS === "web" ? { pointerEvents: "none" } : undefined}
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
            <View className="mx-auto w-full max-w-[440px]">
              {/* Top row: back link + step indicator. */}
              <View className="mb-md flex-row items-center justify-between">
                <Link href="/(public)/sign-in" asChild>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back to sign in"
                    hitSlop={8}
                    className="flex-row items-center gap-xs active:opacity-70"
                  >
                    <MaterialIcons name="arrow-back" size={20} color="#3d4947" />
                    <Text className="font-label-md text-label-md text-on-surface-variant">
                      Back
                    </Text>
                  </Pressable>
                </Link>
                <Text className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Step 1 of 3
                </Text>
              </View>

              {/* Header */}
              <View className="mb-lg items-center">
                <View
                  className="mb-md h-14 w-14 items-center justify-center rounded-xl bg-primary-container"
                  style={{
                    ...Platform.select({
                      ios: {
                        shadowColor: "#475569",
                        shadowOpacity: 0.15,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 4 },
                      },
                      web: {
                        boxShadow: "0px 4px 12px rgba(71, 85, 105, 0.15)",
                      },
                      android: {
                        elevation: 4,
                      },
                    }),
                  }}
                >
                  <MaterialIcons name="medical-services" size={28} color="#f4fffc" />
                </View>
                <Text className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
                  Create your account
                </Text>
                <Text className="font-body-md text-body-md mt-xs text-center text-on-surface-variant">
                  Join MedApp for personalized healthcare management.
                </Text>
              </View>

              {/* Form card */}
              <View
                className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
                style={Platform.select({
                  ios: {
                    shadowColor: "#475569",
                    shadowOpacity: 0.05,
                    shadowRadius: 20,
                    shadowOffset: { width: 0, height: 4 },
                  },
                  web: {
                    boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.05)",
                  },
                  android: {
                    elevation: 2,
                  },
                })}
              >
                {/* First name */}
                <FieldShell label="First Name" error={errors.firstName?.message}>
                  <Controller
                    control={control}
                    name="firstName"
                    render={({ field }) => (
                      <InputWithIcon
                        icon="person"
                        placeholder="John"
                        autoCapitalize="words"
                        autoComplete="name-given"
                        textContentType="givenName"
                        value={field.value ?? ""}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        hasError={!!errors.firstName}
                      />
                    )}
                  />
                </FieldShell>

                {/* Middle name (optional) */}
                <View className="mt-md">
                  <FieldShell label="Middle Name (Optional)" error={errors.middleName?.message}>
                    <Controller
                      control={control}
                      name="middleName"
                      render={({ field }) => (
                        <InputWithIcon
                          icon="person-outline"
                          placeholder="Quincy"
                          autoCapitalize="words"
                          autoComplete="additional-name"
                          textContentType="middleName"
                          value={field.value ?? ""}
                          onChangeText={field.onChange}
                          onBlur={field.onBlur}
                          hasError={!!errors.middleName}
                        />
                      )}
                    />
                  </FieldShell>
                </View>

                {/* Surname */}
                <View className="mt-md">
                  <FieldShell label="Surname" error={errors.lastName?.message}>
                    <Controller
                      control={control}
                      name="lastName"
                      render={({ field }) => (
                        <InputWithIcon
                          icon="person"
                          placeholder="Smith"
                          autoCapitalize="words"
                          autoComplete="name-family"
                          textContentType="familyName"
                          value={field.value ?? ""}
                          onChangeText={field.onChange}
                          onBlur={field.onBlur}
                          hasError={!!errors.lastName}
                        />
                      )}
                    />
                  </FieldShell>
                </View>

                {/* Email */}
                <View className="mt-md">
                  <FieldShell label="Email Address" error={errors.email?.message}>
                    <Controller
                      control={control}
                      name="email"
                      render={({ field }) => (
                        <InputWithIcon
                          icon="mail-outline"
                          placeholder="john@example.com"
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
                  </FieldShell>
                </View>

                {/* Password */}
                <View className="mt-md">
                  <FieldShell label="Password" error={errors.password?.message}>
                    <Controller
                      control={control}
                      name="password"
                      render={({ field }) => (
                        <InputWithIcon
                          icon="lock-outline"
                          placeholder="At least 8 characters"
                          autoCapitalize="none"
                          autoComplete="password-new"
                          autoCorrect={false}
                          secureTextEntry={!showPassword}
                          textContentType="newPassword"
                          value={field.value ?? ""}
                          onChangeText={field.onChange}
                          onBlur={field.onBlur}
                          hasError={!!errors.password}
                          trailing={
                            <Pressable
                              onPress={() => setShowPassword((s) => !s)}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel={
                                showPassword ? "Hide password" : "Show password"
                              }
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
                  </FieldShell>
                </View>

                {/* Confirm password */}
                <View className="mt-md">
                  <FieldShell
                    label="Confirm Password"
                    error={errors.confirmPassword?.message}
                  >
                    <Controller
                      control={control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <InputWithIcon
                          icon="lock-reset"
                          placeholder="Re-enter your password"
                          autoCapitalize="none"
                          autoComplete="password-new"
                          autoCorrect={false}
                          secureTextEntry={!showConfirm}
                          textContentType="newPassword"
                          value={field.value ?? ""}
                          onChangeText={field.onChange}
                          onBlur={field.onBlur}
                          hasError={!!errors.confirmPassword}
                          trailing={
                            <Pressable
                              onPress={() => setShowConfirm((s) => !s)}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel={
                                showConfirm ? "Hide password" : "Show password"
                              }
                            >
                              <MaterialIcons
                                name={showConfirm ? "visibility-off" : "visibility"}
                                size={20}
                                color="#6d7a77"
                              />
                            </Pressable>
                          }
                        />
                      )}
                    />
                  </FieldShell>
                </View>

                {/* Terms checkbox */}
                <View className="mt-md">
                  <Controller
                    control={control}
                    name="agreeToTerms"
                    render={({ field }) => (
                      <Pressable
                        className="flex-row items-start gap-sm py-xs"
                        onPress={() => field.onChange(!field.value)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!field.value }}
                      >
                        <View
                          className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${
                            field.value
                              ? "border-primary bg-primary"
                              : "border-outline-variant bg-transparent"
                          }`}
                        >
                          {field.value ? (
                            <MaterialIcons name="check" size={14} color="#ffffff" />
                          ) : null}
                        </View>
                        <Text className="font-label-sm text-label-sm flex-1 text-on-surface-variant">
                          I agree to the{" "}
                          <Text className="text-primary">Terms of Service</Text> and{" "}
                          <Text className="text-primary">Privacy Policy</Text>
                        </Text>
                      </Pressable>
                    )}
                  />
                  {errors.agreeToTerms && (
                    <Text className="font-label-sm text-label-sm ml-xs text-error">
                      {errors.agreeToTerms.message}
                    </Text>
                  )}
                </View>

                {/* Primary CTA */}
                <Pressable
                  testID="signup.step1.next"
                  accessibilityRole="button"
                  accessibilityLabel="Continue to step 2"
                  onPress={onSubmit}
                  disabled={isSubmitting}
                  className="mt-md w-full flex-row items-center justify-center gap-base rounded-lg bg-primary py-md active:scale-[0.98]"
                  style={({ pressed }) => ({
                    opacity: isSubmitting ? 0.6 : 1,
                    backgroundColor: pressed ? "#008378" : "#00685f",
                    ...Platform.select({
                      ios: {
                        shadowColor: "#00685f",
                        shadowOpacity: 0.15,
                        shadowRadius: 6,
                        shadowOffset: { width: 0, height: 2 },
                      },
                      web: {
                        boxShadow: "0px 2px 6px rgba(0, 104, 95, 0.15)",
                      },
                      android: {
                        elevation: 3,
                      },
                    }),
                  })}
                >
                  <Text className="font-label-md text-label-md text-on-primary">
                    Continue
                  </Text>
                  <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />
                </Pressable>

                {/* Divider */}
                <View className="my-sm flex-row items-center gap-sm py-sm">
                  <View className="h-px flex-1 bg-outline-variant/30" />
                  <Text className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                    Or continue with
                  </Text>
                  <View className="h-px flex-1 bg-outline-variant/30" />
                </View>

                {/* Social buttons */}
                <View className="flex-row gap-sm">
                  <SocialButton
                    icon="g-translate"
                    label="Google"
                    onPress={() => {
                      /* TODO: Google OAuth wire-up */
                    }}
                  />
                  <SocialButton
                    icon="apple"
                    label="Apple"
                    onPress={() => {
                      /* TODO: Apple sign-in wire-up */
                    }}
                  />
                </View>
              </View>

              {/* Footer */}
              <View className="mt-lg items-center">
                <View className="flex-row items-center">
                  <Text className="font-body-md text-body-md text-on-surface-variant">
                    Already have an account?{" "}
                  </Text>
                  <Link
                    href="/(public)/sign-in"
                    className="font-label-md text-label-md ml-xs text-primary"
                  >
                    Log In
                  </Link>
                </View>

                <View className="mt-md items-center">
                  <View className="flex-row items-center gap-xs">
                    <MaterialIcons name="verified-user" size={16} color="#6d7a77" />
                    <Text className="font-label-sm text-label-sm text-outline">
                      HIPAA Compliant &amp; Secure
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
// Local primitives — mirrors SignInScreen. Promote to components/ui/ once a
// third screen needs them.
// ---------------------------------------------------------------------------

function FieldShell({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="space-y-xs">
      <Text className="font-label-md text-label-md ml-xs text-on-surface-variant">
        {label}
      </Text>
      {children}
      {error ? (
        <Text className="font-label-sm text-label-sm ml-xs text-error">{error}</Text>
      ) : null}
    </View>
  );
}

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

interface SocialButtonProps {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  onPress: () => void;
}

function SocialButton({ icon, label, onPress }: SocialButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${label}`}
      className="flex-1 flex-row items-center justify-center gap-sm rounded-lg border border-outline-variant/30 bg-surface-container-low py-sm active:scale-[0.98]"
    >
      <MaterialIcons name={icon} size={20} color="#171d1c" />
      <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
    </Pressable>
  );
}
