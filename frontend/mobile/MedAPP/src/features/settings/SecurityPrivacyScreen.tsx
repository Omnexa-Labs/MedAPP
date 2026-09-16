// Security and privacy: biometric enrollment, password changes and session management.
// EHR care-team sharing has its own scope and confirmation flow.

import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import {
  Button,
  Card,
  InfoCallout,
  Input,
  KeyboardInset,
  SectionHeader,
  type InputProps,
} from "@/components/ui";
import { authApi } from "@/features/auth/api";
import { BiometricSettingsCard } from "./BiometricSettingsCard";
import { useAuthStore } from "@/store/auth-store";
import { ApiError } from "@/types/api";
import {
  EMPTY_PASSWORD_DRAFT,
  validatePasswordChange,
  type PasswordChangeDraft,
  type PasswordChangeErrors,
} from "./password-change";

/** A successful password change ends refresh sessions and requires sign-in. */
type SubmitState =
  { kind: "idle" } | { kind: "saving" } | { kind: "done" } | { kind: "failed"; message: string };

export function SecurityPrivacyScreen() {
  return (
    <DetailShell
      title="Security & privacy"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/settings" as Href);
      }}
    >
      <KeyboardInset>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <SectionHeader title="Authentication" icon="secure" />
          </View>
          <BiometricSettingsCard />
          <Card className="mt-3 gap-3 p-4">
            <Text className="font-headline-md text-headline-md text-on-surface">
              Two-factor authentication
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Protect password sign-in with an authenticator app and keep recovery codes for backup.
            </Text>
            <Button
              label="Manage two-factor authentication"
              variant="outline"
              onPress={() => router.push("/(app)/two-factor" as Href)}
            />
          </Card>
          <ChangePasswordCard />
          <Card className="mt-3 gap-3 p-4">
            <Text className="font-headline-md text-headline-md text-on-surface">
              Care-team sharing
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Choose which doctors or nurses can view your EHR summary and vitals, and whether they
              may add vitals.
            </Text>
            <Button
              label="Manage care-team sharing"
              variant="outline"
              onPress={() => router.push("/(app)/care-team-sharing" as Href)}
            />
          </Card>

          <View className="mt-8">
            <SectionHeader title="Sessions" icon="secure" />
          </View>
          <Card className="mt-2 gap-3 p-4">
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Review your sign-ins and sign out sessions you no longer use.
            </Text>
            <Button
              label="Manage active sessions"
              variant="outline"
              pill={false}
              shadow={false}
              onPress={() => router.push("/(app)/active-sessions" as Href)}
            />
          </Card>

          <Card className="mt-4 gap-3 p-4">
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Review or disconnect Google and Apple accounts used to sign in.
            </Text>
            <Button
              label="Manage connected accounts"
              variant="outline"
              onPress={() => router.push("/(app)/connected-accounts" as Href)}
            />
          </Card>

          <View className="mt-8">
            <SectionHeader title="Not available yet" icon="preferences" />
          </View>
          <UnavailableControls />
        </ScrollView>
      </KeyboardInset>
    </DetailShell>
  );
}

function ChangePasswordCard() {
  const [draft, setDraft] = useState<PasswordChangeDraft>(EMPTY_PASSWORD_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const saving = useRef(false);

  const errors = useMemo(() => validatePasswordChange(draft), [draft]);
  // Errors appear only AFTER a submit attempt, so the form does not scold a
  // patient for a field they have not finished typing.
  const shown: PasswordChangeErrors = submitted ? errors : {};

  const set = useCallback(<K extends keyof PasswordChangeDraft>(key: K, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    // Any edit clears a previous outcome: a stale "Password changed" banner above
    // a form being retyped reads as though the new attempt already succeeded.
    setState({ kind: "idle" });
  }, []);

  const submit = useCallback(async () => {
    if (saving.current) return;
    setSubmitted(true);
    if (Object.keys(validatePasswordChange(draft)).length > 0) return;
    saving.current = true;
    setState({ kind: "saving" });
    try {
      await authApi.changePassword({
        currentPassword: draft.currentPassword,
        newPassword: draft.newPassword,
      });
      // Cleared on success so the secrets do not sit in component state, and so
      // the form cannot be resubmitted with a password that is no longer current.
      setDraft(EMPTY_PASSWORD_DRAFT);
      setSubmitted(false);
      setState({ kind: "done" });
    } catch (error) {
      // The server's own message, not invented copy. A wrong current password is a
      // 400 whose `detail` the client surfaces as `ApiError.message`.
      const message =
        error instanceof ApiError
          ? error.message
          : "Your password could not be changed. Try again.";
      setState({ kind: "failed", message });
    } finally {
      saving.current = false;
    }
  }, [draft]);

  if (state.kind === "done") {
    return (
      <Card className="mt-3 gap-4 p-4" testID="security-change-password">
        <View accessibilityLiveRegion="polite" accessibilityRole="alert">
          <InfoCallout testID="security-password-done">
            Your password has been changed. Sign in again with your new password.
          </InfoCallout>
        </View>
        <Button
          label="Sign in again"
          onPress={async () => {
            if (saving.current) return;
            saving.current = true;
            await useAuthStore.getState().signOut();
            if (!useAuthStore.getState().isAuthenticated)
              router.replace("/(public)/sign-in" as Href);
          }}
        />
      </Card>
    );
  }

  return (
    <Card className="mt-3 p-4" testID="security-change-password">
      <Text className="font-headline-md text-headline-md text-on-surface">Change password</Text>
      <Text className="mt-1 font-body-md text-body-md text-on-surface-variant">
        Changing your password ends existing sign-ins. You will need to sign in again and set up
        biometric sign-in again if you use it.
      </Text>

      {state.kind === "failed" ? (
        <View className="mt-4" accessibilityRole="alert">
          <InfoCallout tone="error" testID="security-password-error">
            {state.message}
          </InfoCallout>
        </View>
      ) : null}

      <View className="mt-4 gap-4">
        <SecretField
          label="Current password"
          editable={state.kind !== "saving"}
          value={draft.currentPassword}
          onChangeText={(value) => set("currentPassword", value)}
          error={shown.currentPassword}
          testID="security-current-password"
        />
        <SecretField
          label="New password"
          editable={state.kind !== "saving"}
          value={draft.newPassword}
          onChangeText={(value) => set("newPassword", value)}
          error={shown.newPassword}
          testID="security-new-password"
        />
        <SecretField
          label="Confirm new password"
          editable={state.kind !== "saving"}
          value={draft.confirmPassword}
          onChangeText={(value) => set("confirmPassword", value)}
          error={shown.confirmPassword}
          testID="security-confirm-password"
        />
      </View>

      <View className="mt-5">
        <Button
          label={state.kind === "saving" ? "Changing…" : "Change password"}
          onPress={() => void submit()}
          disabled={state.kind === "saving"}
          testID="security-submit-password"
        />
      </View>
    </Card>
  );
}

/** Label + secure input + error, so three fields cannot drift on spacing. */
function SecretField({ label, error, ...input }: { label: string; error?: string } & InputProps) {
  return (
    <View className="gap-2">
      <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
      <Input
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        // `textContentType="password"` is deliberately NOT set. On iOS it invites
        // the keychain to autofill the SAVED password into whichever field is
        // focused, including "New password" — where the saved value is exactly
        // what must not be reused.
        hasError={error !== undefined}
        {...input}
      />
      {error ? (
        <Text className="font-label-sm text-label-sm text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The frame's remaining sections, named once rather than drawn as dead controls.
 *
 * Listing them is deliberate: the patient came here looking for 2FA or a session
 * list, and silence would read as "this app has no such feature and never
 * discusses it". Saying "not available yet" is honest and answers the question
 * they arrived with.
 */
const UNAVAILABLE = [
  {
    title: "Profile visibility",
    body: "Profile visibility controls are not available here yet. EHR sharing is managed above.",
  },
  {
    title: "Download your data",
    body: "A full export is not available yet. Individual records can be shared from the screen they appear on.",
  },
] as const;

function UnavailableControls() {
  return (
    <Card className="mt-2 p-4" testID="security-unavailable">
      {UNAVAILABLE.map((item, index) => (
        <View
          key={item.title}
          className={index === 0 ? "" : "mt-4 border-t border-outline-variant pt-4"}
        >
          <Text className="font-label-md text-label-md text-on-surface">{item.title}</Text>
          <Text className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {item.body}
          </Text>
        </View>
      ))}
    </Card>
  );
}
