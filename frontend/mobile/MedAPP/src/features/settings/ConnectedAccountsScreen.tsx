import { useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Button, Card, InfoCallout, Input, KeyboardInset } from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { useAuthStore } from "@/store/auth-store";
import { providerApi, type Provider } from "@/features/auth/provider-api";
import { ApiError } from "@/types/api";

export function ConnectedAccountsScreen() {
  const scope = useSessionScope();
  return <Accounts key={`${scope.owner}:${scope.revision}`} scope={scope} />;
}

function Accounts({ scope }: { scope: ReturnType<typeof useSessionScope> }) {
  const [selected, setSelected] = useState<Provider | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const query = useQuery({
    queryKey: ["providers", scope.owner, scope.revision],
    gcTime: 0,
    enabled: !!scope.owner,
    queryFn: ({ signal }) => providerApi.connections({ signal, isSessionCurrent: scope.isCurrent }),
  });

  async function disconnect() {
    if (!selected || pending.current || !scope.isCurrent()) return;
    if (!password) {
      setError("Enter your current MedApp password.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await providerApi.disconnect(selected, password, code.trim(), {
        isSessionCurrent: scope.isCurrent,
      });
      if (!scope.isCurrent()) return;
      await useAuthStore.getState().signOut();
      if (!useAuthStore.getState().isAuthenticated) router.replace("/(public)/sign-in");
    } catch (failure) {
      if (scope.isCurrent()) {
        setError(
          failure instanceof ApiError && failure.isNetwork
            ? "Couldn't confirm disconnection. Sign out and use email sign-in, then check connected accounts."
            : failure instanceof ApiError
              ? failure.message
              : "Couldn't disconnect this account. Try again.",
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
      setPassword("");
      setCode("");
    }
  }

  return (
    <DetailShell
      title="Connected accounts"
      onBack={() =>
        router.canGoBack() ? router.back() : router.replace("/(app)/security-privacy")
      }
    >
      <KeyboardInset>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
          <Card className="gap-4 p-4">
            <Text className="font-body-md text-body-md text-on-surface-variant">
              These accounts can sign you in to MedApp. To connect one, sign out and choose Google
              or Apple sign-in, then confirm your MedApp password.
            </Text>
            {query.isPending ? (
              <Text
                accessibilityRole="progressbar"
                className="font-body-md text-body-md text-on-surface-variant"
              >
                Loading connected accounts…
              </Text>
            ) : null}
            {query.isError ? (
              <>
                <InfoCallout tone="error">Couldn't load connected accounts.</InfoCallout>
                <Button label="Retry" onPress={() => void query.refetch()} />
              </>
            ) : null}
            {query.isSuccess && query.data.items.length === 0 ? (
              <InfoCallout>
                No provider accounts are connected. You can sign in with email and password.
              </InfoCallout>
            ) : null}
            {query.data?.items.map((item) => (
              <View key={item.provider} className="gap-2">
                <Text className="font-headline-md text-headline-md text-on-surface">
                  {item.provider === "google" ? "Google" : "Apple"}
                </Text>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  Connected {new Date(item.connected_at).toLocaleDateString()}
                </Text>
                <Button
                  label={`Disconnect ${item.provider === "google" ? "Google" : "Apple"}`}
                  variant="outline"
                  disabled={busy}
                  onPress={() => {
                    setSelected(item.provider);
                    setError(null);
                    setPassword("");
                    setCode("");
                  }}
                />
              </View>
            ))}
            {selected ? (
              <>
                <InfoCallout>
                  Disconnecting removes this sign-in method and ends your refresh sessions. You'll
                  sign in again with your MedApp email and password. Other devices may retain access
                  for up to 15 minutes. This does not delete your MedApp or provider account.
                </InfoCallout>
                <Input
                  accessibilityLabel="Current MedApp password"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  editable={!busy}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  If two-factor authentication is on, enter an authenticator or recovery code.
                </Text>
                <Input
                  accessibilityLabel="Authenticator or recovery code"
                  value={code}
                  onChangeText={setCode}
                  editable={!busy}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={32}
                />
                <Button
                  label="Confirm disconnection"
                  loading={busy}
                  disabled={busy}
                  onPress={() => void disconnect()}
                />
                <Button
                  label="Cancel"
                  variant="outline"
                  disabled={busy}
                  onPress={() => {
                    setSelected(null);
                    setPassword("");
                    setCode("");
                    setError(null);
                  }}
                />
              </>
            ) : null}
            {error ? (
              <View accessibilityRole="alert">
                <InfoCallout tone="error">{error}</InfoCallout>
              </View>
            ) : null}
          </Card>
        </ScrollView>
      </KeyboardInset>
    </DetailShell>
  );
}
