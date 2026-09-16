import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { DetailShell } from "@/components/shell";
import { Button, Card, Icon, InfoCallout, Input, KeyboardInset, Logo } from "@/components/ui";
import { ApiError } from "@/types/api";
import { authApi } from "./api";
import {
  ForgotPasswordSchema,
  ResetPasswordSchema,
  type ForgotPasswordValues,
  type ResetPasswordValues,
} from "./schema";

type Stage = "request" | "reset" | "complete";
const EMPTY_RESET: ResetPasswordValues = { token: "", newPassword: "", confirmPassword: "" };

function requestError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "We couldn't connect. Check your connection and try again.";
    if (error.status === 429) return "Too many requests. Wait a little before trying again.";
    if (error.status === 503)
      return "Password recovery is temporarily unavailable. Please try again later.";
  }
  return "We couldn't request a reset code. Please try again.";
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <Text className="font-label-sm text-label-sm text-error" accessibilityLiveRegion="polite">
      {message}
    </Text>
  ) : null;
}

export function ForgotPasswordScreen() {
  const [stage, setStage] = useState<Stage>("request");
  const [pending, setPending] = useState<"request" | "reset" | null>(null);
  const inFlight = useRef(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [visible, setVisible] = useState({ newPassword: false, confirmPassword: false });

  const requestForm = useForm<ForgotPasswordValues>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const resetForm = useForm<ResetPasswordValues>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: EMPTY_RESET,
  });

  useEffect(() => {
    if (!resendAt) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  const backToSignIn = () => router.replace("/(public)/sign-in");

  const requestCode = async ({ email: recipient }: ForgotPasswordValues) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending("request");
    setMessage(null);
    try {
      const result = await authApi.requestPasswordReset(recipient);
      setEmail(recipient);
      setResendAt(Date.now() + result.resendAfterSeconds * 1000);
      setRemaining(result.resendAfterSeconds);
      setStage("reset");
    } catch (error) {
      setMessage(requestError(error));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };

  const resetPassword = async (values: ResetPasswordValues) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending("reset");
    setMessage(null);
    try {
      await authApi.resetPassword({ token: values.token, newPassword: values.newPassword });
      // Recovery secrets stay in this form only and are cleared after use.
      resetForm.reset(EMPTY_RESET);
      requestForm.reset({ email: "" });
      setEmail("");
      setVisible({ newPassword: false, confirmPassword: false });
      setResendAt(0);
      setRemaining(0);
      setStage("complete");
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        resetForm.setError("token", {
          message: "This reset code is invalid or has expired. Check it or request another code.",
        });
      } else {
        setMessage(
          error instanceof ApiError && error.status === 0
            ? "We couldn't connect. Your password hasn't been confirmed as changed. Try again."
            : "We couldn't reset your password. Please try again.",
        );
      }
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };

  const changeEmail = () => {
    setMessage(null);
    resetForm.reset(EMPTY_RESET);
    setVisible({ newPassword: false, confirmPassword: false });
    setStage("request");
  };

  return (
    <DetailShell
      title="Account recovery"
      onBack={backToSignIn}
      backAccessibilityLabel="Back to sign in"
    >
      <KeyboardInset>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 32, gap: 24 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View className="items-center gap-3 pt-4">
            <Logo variant="icon" height={48} />
            <Text
              accessibilityRole="header"
              accessibilityLiveRegion="polite"
              className="text-center font-headline-xl text-headline-xl text-on-surface"
            >
              {stage === "complete" ? "Password updated" : "Reset your password"}
            </Text>
            <Text className="text-center font-body-md text-body-md text-on-surface-variant">
              {stage === "request"
                ? "Enter the email you use for MedApp. We'll help you get back to your account."
                : stage === "reset"
                  ? "Use the code from your email and choose a new password."
                  : "Your new password is ready. Sign in to continue your care."}
            </Text>
          </View>

          {message ? (
            <View accessibilityRole="alert" accessibilityLiveRegion="polite">
              <InfoCallout tone="error" testID="recovery-error">
                {message}
              </InfoCallout>
            </View>
          ) : null}

          {stage === "request" ? (
            <Card className="gap-6">
              <View className="gap-2">
                <Text className="font-label-md text-label-md text-on-surface">Email address</Text>
                <Controller
                  control={requestForm.control}
                  name="email"
                  render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
                    <>
                      <Input
                        icon="mail-outline"
                        accessibilityLabel="Email address"
                        accessibilityHint={error?.message ?? "The email you registered with"}
                        placeholder="you@example.com"
                        keyboardType="email-address"
                        autoComplete="email"
                        textContentType="emailAddress"
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        editable={!pending}
                        hasError={!!error}
                        returnKeyType="send"
                        onSubmitEditing={requestForm.handleSubmit(requestCode)}
                      />
                      <FieldError message={error?.message} />
                    </>
                  )}
                />
              </View>
              <Button
                label="Send reset code"
                size="docked"
                pill={false}
                shadow={false}
                loading={pending === "request"}
                disabled={!!pending}
                onPress={requestForm.handleSubmit(requestCode)}
              />
              <Button
                label="I already have a reset code"
                variant="ghost"
                disabled={!!pending}
                onPress={() => {
                  setMessage(null);
                  setStage("reset");
                }}
              />
            </Card>
          ) : null}

          {stage === "reset" ? (
            <>
              {email ? (
                <InfoCallout testID="recovery-request-accepted">
                  {`If an account exists for ${email}, use the reset code from your inbox. Check your spam folder too.`}
                </InfoCallout>
              ) : null}
              <Card className="gap-6">
                <View className="gap-2">
                  <Text className="font-label-md text-label-md text-on-surface">Reset code</Text>
                  <Controller
                    control={resetForm.control}
                    name="token"
                    render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
                      <>
                        <Input
                          icon="key"
                          accessibilityLabel="Reset code"
                          accessibilityHint={
                            error?.message ?? "Paste the complete reset code from your email"
                          }
                          placeholder="Paste your reset code"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="off"
                          editable={!pending}
                          hasError={!!error}
                          maxLength={256}
                        />
                        <FieldError message={error?.message} />
                      </>
                    )}
                  />
                </View>
                {(["newPassword", "confirmPassword"] as const).map((name) => {
                  const label = name === "newPassword" ? "New password" : "Confirm new password";
                  return (
                    <View key={name} className="gap-2">
                      <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
                      <Controller
                        control={resetForm.control}
                        name={name}
                        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
                          <>
                            <Input
                              icon="lock-outline"
                              accessibilityLabel={label}
                              accessibilityHint={
                                error?.message ?? "Use between 8 and 128 characters"
                              }
                              placeholder={
                                name === "newPassword" ? "Choose a new password" : "Enter it again"
                              }
                              value={value}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              secureTextEntry={!visible[name]}
                              autoComplete="new-password"
                              textContentType="newPassword"
                              autoCapitalize="none"
                              autoCorrect={false}
                              editable={!pending}
                              hasError={!!error}
                              returnKeyType={name === "confirmPassword" ? "done" : "next"}
                              onSubmitEditing={
                                name === "confirmPassword"
                                  ? resetForm.handleSubmit(resetPassword)
                                  : undefined
                              }
                              trailing={
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`${visible[name] ? "Hide" : "Show"} ${label.toLowerCase()}`}
                                  disabled={!!pending}
                                  onPress={() =>
                                    setVisible((current) => ({
                                      ...current,
                                      [name]: !current[name],
                                    }))
                                  }
                                  className="h-11 w-11 items-center justify-center"
                                >
                                  <Icon
                                    chrome={visible[name] ? "visibility-off" : "visibility"}
                                    size={20}
                                  />
                                </Pressable>
                              }
                            />
                            <FieldError message={error?.message} />
                          </>
                        )}
                      />
                      {name === "newPassword" ? (
                        <Text className="font-label-sm text-label-sm text-on-surface-variant">
                          Use 8–128 characters.
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                <Button
                  label="Update password"
                  size="docked"
                  pill={false}
                  shadow={false}
                  loading={pending === "reset"}
                  disabled={!!pending}
                  onPress={resetForm.handleSubmit(resetPassword)}
                />
              </Card>
              {email ? (
                <Button
                  label={remaining > 0 ? `Resend code in ${remaining}s` : "Resend code"}
                  variant="outline"
                  pill={false}
                  disabled={!!pending || remaining > 0}
                  loading={pending === "request"}
                  onPress={() => requestCode({ email })}
                />
              ) : null}
              <Button
                label={email ? "Use a different email" : "Request a reset code"}
                variant="ghost"
                disabled={!!pending}
                onPress={changeEmail}
              />
            </>
          ) : null}

          {stage === "complete" ? (
            <Card className="gap-6">
              <InfoCallout icon="check-circle" testID="recovery-complete">
                Your password has been changed. Use your new password the next time you sign in.
              </InfoCallout>
              <Button
                label="Back to sign in"
                size="docked"
                pill={false}
                shadow={false}
                onPress={backToSignIn}
              />
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardInset>
    </DetailShell>
  );
}
