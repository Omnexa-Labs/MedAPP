import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell/DetailShell";
import {
  Badge,
  Button,
  Card,
  ConsentRow,
  InfoCallout,
  Input,
  KeyboardInset,
} from "@/components/ui";
import { useAuthStore } from "@/store/auth-store";
import { ApiError } from "@/types/api";
import { twoFactorApi, type TwoFactorSetup, type TwoFactorStatus } from "./two-factor-api";

type Action = "enable" | "disable" | "regenerate" | null;

export function TwoFactorSettingsScreen() {
  const revision = useAuthStore((s) => s.revision);
  // Keyed content clears all local secrets immediately when identity changes.
  return <TwoFactorSettingsContent key={revision} revision={revision} />;
}

function TwoFactorSettingsContent({ revision }: { revision: number }) {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [replacementCodes, setReplacementCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uncertain, setUncertain] = useState(false);
  const [expired, setExpired] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(false);
  const isCurrent = useCallback(
    () =>
      mounted.current &&
      useAuthStore.getState().revision === revision &&
      useAuthStore.getState().isAuthenticated,
    [revision],
  );
  const api = twoFactorApi(isCurrent);

  useEffect(() => {
    mounted.current = true;
    void loadStatus();
    return () => {
      mounted.current = false;
    };
    // This content remounts on revision; secrets never enter a query cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
  useEffect(() => {
    if (!setup) return;
    setExpired(false);
    const timer = setTimeout(() => setExpired(true), setup.expires_in * 1000);
    return () => clearTimeout(timer);
  }, [setup]);

  function clear() {
    setAction(null);
    setSetup(null);
    setPassword("");
    setCode("");
    setSaved(false);
    setError(null);
    setExpired(false);
    setUncertain(false);
  }
  async function loadStatus() {
    if (pending.current || !isCurrent()) return;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      const next = await api.status();
      if (!isCurrent()) return;
      setStatus(next);
      if (
        uncertain &&
        ((action === "enable" && next.enabled) || (action === "disable" && !next.enabled))
      ) {
        await signOut();
      } else setUncertain(false);
    } catch (failure) {
      if (isCurrent())
        setError(
          failure instanceof ApiError
            ? failure.message
            : "Couldn't check two-factor settings. Try again.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  }
  async function signOut() {
    if (!isCurrent()) return;
    await useAuthStore.getState().signOut();
    if (!useAuthStore.getState().isAuthenticated) router.replace("/(public)/sign-in" as Href);
  }
  async function submit() {
    if (pending.current || !action || !isCurrent()) return;
    if ((!setup && !password) || (setup && (!saved || expired))) return;
    if (
      (setup || action !== "enable") &&
      !(setup ? /^[0-9]{6}$/.test(code.trim()) : code.trim().length >= 6)
    ) {
      setError("Enter your authenticator code or a saved recovery code.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "enable" && !setup) {
        const draft = await api.setup(password);
        if (!isCurrent()) return;
        setSetup(draft);
        setPassword("");
        setSaved(false);
      } else if (action === "enable" && setup) {
        await api.confirm(setup.setup_id, code.trim());
        await signOut();
      } else if (action === "disable") {
        await api.disable(password, code.trim());
        await signOut();
      } else {
        const result = await api.regenerate(password, code.trim());
        if (!isCurrent()) return;
        setReplacementCodes(result.recovery_codes);
        setPassword("");
        setCode("");
        setSaved(false);
      }
    } catch (failure) {
      if (!isCurrent()) return;
      setError(
        failure instanceof ApiError ? failure.message : "Couldn't complete this change. Try again.",
      );
      if (failure instanceof ApiError && (failure.isNetwork || failure.status >= 500))
        setUncertain(true);
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusy(false);
        setCode("");
      }
    }
  }
  function back() {
    if (pending.current) return;
    if (setup || replacementCodes) {
      Alert.alert(
        "Leave two-factor setup?",
        replacementCodes
          ? "Save your new recovery codes before leaving. The old codes have already been replaced."
          : "Two-factor authentication stays off until you confirm a code. Unsaved setup details will be cleared.",
        [
          { text: "Stay", style: "cancel" },
          {
            text: "Leave",
            onPress: () => {
              if (replacementCodes) void signOut();
              else {
                clear();
                router.back();
              }
            },
          },
        ],
      );
    } else if (router.canGoBack()) router.back();
    else router.replace("/(app)/security-privacy" as Href);
  }

  const delay = Math.ceil((status?.sign_out_delay_seconds ?? 900) / 60);
  return (
    <DetailShell title="Two-factor authentication" onBack={back}>
      <KeyboardInset>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Card className="gap-4 p-4">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="font-headline-md text-headline-md text-on-surface">
                Authenticator app
              </Text>
              <Badge
                label={
                  loading ? "Checking" : status ? (status.enabled ? "On" : "Off") : "Unavailable"
                }
                tone={status?.enabled ? "success" : "neutral"}
              />
            </View>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Add an authenticator code to password sign-in. Save recovery codes so you can sign in
              if you lose your authenticator.
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Security changes below end existing sign-ins and sign you out. Other devices can
              retain access for up to {delay} minutes. Biometric sign-in will need to be set up
              again.
            </Text>
            {loading ? (
              <ActivityIndicator accessibilityLabel="Loading two-factor settings" />
            ) : null}
            {error ? (
              <View accessibilityRole="alert">
                <InfoCallout tone="error">{error}</InfoCallout>
              </View>
            ) : null}
            {(!status || uncertain) && !loading ? (
              <Button
                label="Check status again"
                onPress={() => void loadStatus()}
                disabled={busy}
              />
            ) : null}
            {status && !action && !replacementCodes ? (
              <>
                {status.enabled ? (
                  <>
                    <Text className="font-body-md text-body-md text-on-surface">
                      {status.recovery_codes_remaining} recovery codes remaining.
                    </Text>
                    <Button
                      label="Replace recovery codes"
                      variant="outline"
                      onPress={() => setAction("regenerate")}
                    />
                    <Button
                      label="Turn off two-factor authentication"
                      variant="outline"
                      onPress={() => setAction("disable")}
                    />
                  </>
                ) : (
                  <>
                    {!status.available ? (
                      <InfoCallout>
                        Authenticator setup is temporarily unavailable. Try again later.
                      </InfoCallout>
                    ) : null}
                    <Button
                      label="Set up authenticator"
                      disabled={!status.available}
                      onPress={() => setAction("enable")}
                    />
                  </>
                )}
              </>
            ) : null}
            {action && !setup && !replacementCodes ? (
              <>
                <Text className="font-headline-md text-headline-md text-on-surface">
                  {action === "enable"
                    ? "Confirm your password"
                    : action === "disable"
                      ? "Confirm turning off protection"
                      : "Replace your recovery codes"}
                </Text>
                {action !== "enable" ? (
                  <InfoCallout>
                    {action === "disable"
                      ? "Password sign-in will no longer ask for a second factor."
                      : "Your old recovery codes will stop working. Save the new set before leaving."}
                  </InfoCallout>
                ) : null}
                <Input
                  accessibilityLabel="Current password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={password}
                  onChangeText={setPassword}
                  editable={!busy}
                />
                {action !== "enable" ? (
                  <Input
                    accessibilityLabel="Authenticator or recovery code"
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={32}
                    editable={!busy}
                  />
                ) : null}
                <Button
                  label={
                    busy
                      ? "Working…"
                      : action === "enable"
                        ? "Continue setup"
                        : action === "disable"
                          ? "Confirm turn off"
                          : "Confirm replacement"
                  }
                  disabled={busy || !password || uncertain}
                  onPress={() => void submit()}
                />
                <Button label="Cancel" variant="outline" disabled={busy} onPress={clear} />
              </>
            ) : null}
            {setup ? (
              <>
                <Text className="font-headline-md text-headline-md text-on-surface">
                  1. Add MedApp to your authenticator
                </Text>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  Use the button below, or enter this setup key in your authenticator with
                  time-based codes, six digits and a 30-second interval.
                </Text>
                <Text
                  selectable
                  testID="two-factor-setup-secret"
                  className="font-body-md text-body-md text-on-surface"
                >
                  {setup.secret}
                </Text>
                <Button
                  label="Open authenticator app"
                  variant="outline"
                  disabled={busy}
                  onPress={() => {
                    void Linking.openURL(setup.provisioning_uri).catch(() => {
                      if (isCurrent())
                        setError(
                          "No compatible authenticator opened. Add the setup key manually in your authenticator app.",
                        );
                    });
                  }}
                />
                <Text className="font-headline-md text-headline-md text-on-surface">
                  2. Save your recovery codes
                </Text>
                <RecoveryCodes codes={setup.recovery_codes} />
                <ConsentRow
                  accessibilityLabel="I have saved my recovery codes somewhere safe"
                  checked={saved}
                  onChange={(value) => {
                    if (!busy) setSaved(value);
                  }}
                  labelPressable
                >
                  I have saved my recovery codes somewhere safe
                </ConsentRow>
                <Text className="font-headline-md text-headline-md text-on-surface">
                  3. Verify your authenticator
                </Text>
                <Input
                  accessibilityLabel="Six-digit authenticator code"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={code}
                  onChangeText={setCode}
                  editable={!busy && !expired}
                />
                {expired ? <InfoCallout>Setup expired. Cancel and start again.</InfoCallout> : null}
                <Button
                  label={busy ? "Enabling…" : "Enable and sign out"}
                  disabled={busy || !saved || expired || uncertain}
                  onPress={() => void submit()}
                />
                <Button label="Cancel setup" variant="outline" disabled={busy} onPress={clear} />
              </>
            ) : null}
            {replacementCodes ? (
              <>
                <Text className="font-headline-md text-headline-md text-on-surface">
                  Save your new recovery codes
                </Text>
                <RecoveryCodes codes={replacementCodes} />
                <ConsentRow
                  accessibilityLabel="I have saved my recovery codes somewhere safe"
                  checked={saved}
                  onChange={setSaved}
                  labelPressable
                >
                  I have saved my recovery codes somewhere safe
                </ConsentRow>
                <Button label="Sign in again" disabled={!saved} onPress={() => void signOut()} />
              </>
            ) : null}
          </Card>
        </ScrollView>
      </KeyboardInset>
    </DetailShell>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <View className="gap-2">
      <Text className="font-body-md text-body-md text-on-surface-variant">
        Each code works once. Keep them in a safe place separate from your phone. These codes are
        shown only here.
      </Text>
      <Text
        selectable
        testID="two-factor-recovery-codes"
        className="font-body-md text-body-md text-on-surface"
      >
        {codes.join("\n")}
      </Text>
    </View>
  );
}
