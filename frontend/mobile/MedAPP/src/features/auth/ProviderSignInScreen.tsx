import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Button, Card, InfoCallout, Input, KeyboardInset } from "@/components/ui";
import { useResolvedScheme } from "@/lib/theme";
import { useAuthStore } from "@/store/auth-store";
import { ApiError } from "@/types/api";
import { authApi, TwoFactorRequired } from "./api";
import { TwoFactorSignIn } from "./TwoFactorSignIn";
import { useSignUpDraft } from "./hooks/use-signup-draft";
import { loadNativeProviders, ProviderCancelled, type NativeProviders } from "./native-providers";
import { providerApi, type Provider, type ProviderDraft } from "./provider-api";

export function ProviderSignInScreen() {
  const { scheme } = useResolvedScheme();
  const [native, setNative] = useState<NativeProviders>({});
  const [available, setAvailable] = useState<Record<Provider, boolean>>({
    google: false,
    apple: false,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProviderDraft | null>(null);
  const proofExpiresAt = useRef(0);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factor, setFactor] = useState<TwoFactorRequired | null>(null);
  const revision = useRef(useAuthStore.getState().revision).current;
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const current = () => mounted.current && useAuthStore.getState().revision === revision;
  const [reload, setReload] = useState(0);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    setLoading(true);
    Promise.all([loadNativeProviders(), providerApi.config()])
      .then(([modules, config]) => {
        if (!cancelled && current()) {
          setNative(modules);
          setAvailable(config);
        }
      })
      .catch(() => {
        if (!cancelled && current())
          setError("Couldn't check sign-in options. Check your connection and retry.");
      })
      .finally(() => {
        if (!cancelled && current()) setLoading(false);
      });
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [reload]);
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => {
      setDraft(null);
      setPassword("");
      setCode("");
      setError("Your provider proof expired. Choose a provider to start again.");
    }, draft.expires_in * 1000);
    return () => clearTimeout(timer);
  }, [draft]);

  async function saveSession(result: Awaited<ReturnType<typeof providerApi.link>>) {
    if (!current()) {
      void authApi.signOut(result.refreshToken).catch(() => {});
      return;
    }
    await useAuthStore.getState().signIn(result.accessToken, result.user, result.refreshToken);
    if (mounted.current) router.replace("/(app)");
  }

  async function run(provider?: Provider) {
    if (inFlight.current || !current()) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (provider) {
        const adapter = native[provider];
        if (!adapter || !available[provider]) return;
        setDraft(null);
        const challenge = await providerApi.begin(provider);
        if (!current()) return;
        const token = await adapter.authenticate(challenge.nonce);
        if (!current()) return;
        const result = await providerApi.complete(challenge.challenge_token, token);
        if ("action" in result) {
          if (current()) {
            proofExpiresAt.current = Date.now() + result.expires_in * 1000;
            setDraft(result);
          }
        } else await saveSession(result);
      } else if (draft?.action === "link_required") {
        if (!password) {
          setError("Enter your MedApp password.");
          return;
        }
        await saveSession(await providerApi.link(draft.ticket, password, code.trim()));
      }
    } catch (failure) {
      if (failure instanceof ProviderCancelled) return;
      if (!current()) {
        if (mounted.current && !useAuthStore.getState().isAuthenticated)
          setError("Sign-in couldn't be saved. Return to email sign-in and start again.");
        return;
      }
      if (failure instanceof TwoFactorRequired) {
        setDraft(null);
        setFactor(failure);
      } else {
        if (
          failure instanceof ApiError &&
          (failure.isNetwork || [401, 409].includes(failure.status))
        )
          setDraft(null);
        setError(
          failure instanceof ApiError
            ? failure.message
            : "Provider sign-in couldn't finish. Try again or use email sign-in.",
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        setPassword("");
        setCode("");
      }
    }
  }

  if (factor)
    return (
      <TwoFactorSignIn
        challenge={factor}
        revision={revision}
        onCancel={() => setFactor(null)}
        onSuccess={() => router.replace("/(app)")}
      />
    );
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardInset className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          <Card className="gap-4 p-6">
            <Text
              accessibilityRole="header"
              className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface"
            >
              Continue with an account
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Choose your sign-in provider. MedApp will ask before connecting it to an existing
              account.
            </Text>
            {error ? (
              <View accessibilityRole="alert">
                <InfoCallout tone="error">{error}</InfoCallout>
              </View>
            ) : null}
            {loading ? (
              <Text
                accessibilityRole="progressbar"
                className="font-body-md text-body-md text-on-surface-variant"
              >
                Checking sign-in options…
              </Text>
            ) : null}
            {!loading && !draft
              ? (Object.keys(available) as Provider[]).map((provider) => {
                  const NativeButton = native[provider]?.Button;
                  return available[provider] && NativeButton ? (
                    <NativeButton
                      key={provider}
                      onPress={() => void run(provider)}
                      disabled={busy}
                      dark={scheme === "dark"}
                    />
                  ) : (
                    <Text
                      key={provider}
                      className="font-body-md text-body-md text-on-surface-variant"
                    >
                      {provider === "google" ? "Google" : "Apple"} sign-in isn't available in this
                      app yet. Use email and password.
                    </Text>
                  );
                })
              : null}
            {draft?.action === "signup_required" ? (
              <>
                <InfoCallout>
                  Create your MedApp account with {draft.email}. You'll choose a password, verify
                  this email and complete your personal details.
                </InfoCallout>
                <Button
                  label="Continue to account setup"
                  disabled={busy}
                  onPress={() => {
                    if (!current()) return;
                    useSignUpDraft.getState().reset();
                    useSignUpDraft.getState().setProvider({
                      ticket: draft.ticket,
                      email: draft.email,
                      fullName: draft.display_name ?? "",
                      expiresAt: proofExpiresAt.current,
                    });
                    setDraft(null);
                    router.replace("/(public)/sign-up");
                  }}
                />
              </>
            ) : null}
            {draft?.action === "link_required" ? (
              <>
                <InfoCallout>
                  Connect {draft.provider === "google" ? "Google" : "Apple"} to your MedApp account,{" "}
                  {draft.email}. Confirm your MedApp password
                  {draft.two_factor_required ? " and authenticator or recovery code" : ""} to
                  connect and sign in.
                </InfoCallout>
                <Input
                  accessibilityLabel="MedApp password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!busy}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {draft.two_factor_required ? (
                  <Input
                    accessibilityLabel="Authenticator or recovery code"
                    value={code}
                    onChangeText={setCode}
                    editable={!busy}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={32}
                  />
                ) : null}
                <Button
                  label="Connect account and sign in"
                  loading={busy}
                  disabled={busy}
                  onPress={() => void run()}
                />
              </>
            ) : null}
            {draft ? (
              <Button
                label="Cancel"
                variant="outline"
                disabled={busy}
                onPress={() => {
                  setDraft(null);
                  setPassword("");
                  setCode("");
                }}
              />
            ) : null}
            {!loading && !draft && error ? (
              <Button
                label="Retry sign-in options"
                variant="outline"
                disabled={busy}
                onPress={() => {
                  setError(null);
                  setReload((value) => value + 1);
                }}
              />
            ) : null}
            {busy ? (
              <Text
                accessibilityLiveRegion="polite"
                className="font-body-md text-body-md text-on-surface-variant"
              >
                Completing sign-in…
              </Text>
            ) : null}
            <Button
              label="Use email sign-in"
              variant="outline"
              disabled={busy}
              onPress={() => router.replace("/(public)/sign-in")}
            />
          </Card>
        </ScrollView>
      </KeyboardInset>
    </SafeAreaView>
  );
}
