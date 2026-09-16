import { useRef, useState } from "react";
import { Modal, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { Badge, Button, Card, InfoCallout } from "@/components/ui";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useBiometricCapability } from "@/features/auth/hooks/use-biometric-login";
import { AuthSessionChanged, useAuthStore } from "@/store/auth-store";
import { BiometricStorageError } from "@/lib/storage/secure-storage";
import { useTokenColor } from "@/lib/tokens";

export function BiometricSettingsCard() {
  const capability = useBiometricCapability();
  const user = useCurrentUser();
  const enabled = !!user && capability.ownerId === user.id;
  const [action, setAction] = useState<"enable" | "disable" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submitting = useRef(false);
  const scrim = useTokenColor("scrim", 0.4);

  async function confirm() {
    if (!action || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const chosen = action;
    try {
      const auth = useAuthStore.getState();
      if (chosen === "enable") await auth.enableBiometrics();
      else await auth.disableBiometrics();
      await capability.refresh();
      setAction(null);
      setNotice(
        chosen === "enable"
          ? "Biometric sign-in is enabled on this device."
          : "Biometric sign-in is turned off on this device.",
      );
    } catch (failure) {
      if (failure instanceof AuthSessionChanged) return;
      if (failure instanceof BiometricStorageError && failure.kind === "cancelled") return;
      setError(
        "Couldn't change biometric sign-in. Try again, or sign in with your password and retry setup.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function lock() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await useAuthStore.getState().lock();
      if (!useAuthStore.getState().isAuthenticated) router.replace("/(public)/sign-in" as Href);
    } catch {
      setError("Couldn't lock MedApp. Try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Card className="mt-2 gap-3 p-4" testID="security-biometric">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-headline-md text-headline-md text-on-surface">Biometric sign-in</Text>
        <Badge
          label={
            !capability.ready
              ? "Checking"
              : capability.failed
                ? "Couldn't check"
                : enabled
                  ? "Enabled"
                  : "Off"
          }
          tone={enabled ? "success" : "neutral"}
        />
      </View>
      <Text className="font-body-md text-body-md text-on-surface-variant">
        Use your device's biometrics after an app restart or when you lock MedApp. Signing out
        removes this device's enrollment.
      </Text>
      {capability.ready && !capability.failed && !capability.deviceCapable ? (
        <InfoCallout>
          Biometric sign-in isn't available on this device. You can use your password. If you have
          changed the enrolled biometrics, sign in with your password and set it up again.
        </InfoCallout>
      ) : null}
      {capability.failed ? (
        <Button
          label="Check biometrics again"
          variant="outline"
          onPress={() => void capability.refresh()}
        />
      ) : null}
      {capability.ready && !capability.failed && (capability.deviceCapable || enabled) ? (
        <Button
          label={enabled ? "Turn off biometric sign-in" : "Enable biometric sign-in"}
          variant="outline"
          pill={false}
          shadow={false}
          disabled={busy}
          onPress={() => {
            setError(null);
            setNotice(null);
            setAction(enabled ? "disable" : "enable");
          }}
        />
      ) : null}
      {enabled ? (
        <Button label="Lock MedApp" variant="ghost" disabled={busy} onPress={() => void lock()} />
      ) : null}
      {notice ? (
        <View accessibilityLiveRegion="polite">
          <InfoCallout>{notice}</InfoCallout>
        </View>
      ) : null}
      {error && !action ? <InfoCallout tone="error">{error}</InfoCallout> : null}
      <Modal
        visible={action !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) setAction(null);
        }}
      >
        <View className="flex-1 justify-center p-md" style={{ backgroundColor: scrim }}>
          <Card className="gap-md" accessibilityViewIsModal>
            <Text
              accessibilityRole="header"
              className="font-headline-md text-headline-md text-on-surface"
            >
              {action === "enable" ? "Enable biometric sign-in?" : "Turn off biometric sign-in?"}
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              {action === "enable"
                ? "Anyone enrolled in this device's biometrics can unlock this account. Your password remains available. Confirm using the device prompt to finish setup."
                : "Confirm with your device's biometrics. Your current session will stay signed in, and future app restarts will use the usual saved-session behavior."}
            </Text>
            {error ? <InfoCallout tone="error">{error}</InfoCallout> : null}
            <Button
              label="Cancel"
              variant="outline"
              disabled={busy}
              onPress={() => setAction(null)}
            />
            <Button
              label={action === "enable" ? "Confirm enable" : "Confirm turn off"}
              loading={busy}
              disabled={busy}
              onPress={() => void confirm()}
            />
          </Card>
        </View>
      </Modal>
    </Card>
  );
}
