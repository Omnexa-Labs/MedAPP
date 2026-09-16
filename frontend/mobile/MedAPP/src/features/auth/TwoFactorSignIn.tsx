import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, InfoCallout, Input, KeyboardInset } from "@/components/ui";
import { authApi, type TwoFactorRequired } from "./api";
import { useAuthStore } from "@/store/auth-store";
import { ApiError } from "@/types/api";

export function TwoFactorSignIn({
  challenge,
  revision,
  onCancel,
  onSuccess,
}: {
  challenge: TwoFactorRequired;
  revision: number;
  onCancel: () => void;
  onSuccess?: () => void;
}) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => setExpired(true), challenge.expiresIn * 1000);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [challenge]);
  const current = () => mounted.current && useAuthStore.getState().revision === revision;

  async function submit() {
    const proof = code.trim();
    if (pending.current || expired || !current()) return;
    if (!(recovery ? /^[a-fA-F0-9 -]{20,32}$/.test(proof) : /^[0-9]{6}$/.test(proof))) {
      setError(
        recovery ? "Enter a full recovery code." : "Enter the six-digit authenticator code.",
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    let installingSession = false;
    try {
      const result = await authApi.completeTwoFactor(challenge.challengeToken, proof);
      if (!current()) {
        void authApi.signOut(result.refreshToken).catch(() => {});
        return;
      }
      installingSession = true;
      await useAuthStore.getState().signIn(result.accessToken, result.user, result.refreshToken);
      if (mounted.current) onSuccess?.();
    } catch (failure) {
      // signIn advances the revision before writing credentials. If that write
      // fails, its cleanup leaves us signed out and the factor is already spent.
      if (installingSession && mounted.current && !useAuthStore.getState().isAuthenticated) {
        setExpired(true);
        setError("Sign-in couldn't be saved on this device. Start again with your password.");
        return;
      }
      if (!current()) return;
      if (failure instanceof ApiError && (failure.status === 401 || failure.isNetwork)) {
        // A lost response may have consumed the proof. A fresh password challenge is safe.
        setExpired(true);
        setError(
          failure.isNetwork
            ? "Couldn't finish sign-in. Check your connection and start again with your password."
            : failure.message,
        );
      } else {
        setError(
          failure instanceof ApiError
            ? failure.message
            : "Couldn't finish sign-in. Start again with your password.",
        );
      }
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusy(false);
        setCode("");
      }
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardInset className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          <Card className="gap-4 p-6">
            <Text
              accessibilityRole="header"
              className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface"
            >
              Two-factor verification
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              {recovery
                ? "Use one of the recovery codes you saved during setup. Each code works once."
                : "Open your authenticator app and enter the current MedApp code. If you just used a code, wait for the next one."}
            </Text>
            {expired ? (
              <InfoCallout>
                Start again with your password to get a new sign-in challenge.
              </InfoCallout>
            ) : null}
            {error ? (
              <View accessibilityRole="alert">
                <InfoCallout tone="error">{error}</InfoCallout>
              </View>
            ) : null}
            <Input
              accessibilityLabel={recovery ? "Recovery code" : "Authenticator code"}
              value={code}
              onChangeText={setCode}
              keyboardType={recovery ? "default" : "number-pad"}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={recovery ? 32 : 6}
              editable={!busy && !expired}
              testID="two-factor-login-code"
            />
            <Button
              label={busy ? "Verifying…" : "Verify and sign in"}
              onPress={() => void submit()}
              disabled={busy || expired}
            />
            <Button
              label={recovery ? "Use authenticator code" : "Use a recovery code"}
              variant="outline"
              disabled={busy || expired}
              onPress={() => {
                setRecovery(!recovery);
                setCode("");
                setError(null);
              }}
            />
            <Button
              label="Back to password sign-in"
              variant="outline"
              disabled={busy}
              onPress={onCancel}
            />
          </Card>
        </ScrollView>
      </KeyboardInset>
    </SafeAreaView>
  );
}
