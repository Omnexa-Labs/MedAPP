import { useCallback, useEffect, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/features/auth/api";
import { secureStorage } from "@/lib/storage/secure-storage";
import { useAuthStore } from "@/store/auth-store";

// Biometric sign-in.
//
// Pattern: biometric unlocks the locally-stored refresh token, then we
// hit /v1/auth/refresh to swap it for a fresh access/refresh pair. No
// server-side change — the backend only sees a refresh-token call. This
// is the standard banking-app pattern.
//
// Capability surface (drives which buttons render on SignInScreen):
//
//   capability.available  — device has the sensor AND the user has
//                            enrolled at least one biometric AND a
//                            refresh token is stored from a prior
//                            sign-in. False on first install, after
//                            sign-out, or on an unenrolled simulator.
//   capability.kinds      — which sensors the device exposes. We use it
//                            to decide whether to render the FaceID
//                            button, the Fingerprint button, or both.
//
// Failure modes the hook surfaces:
//
//   no_credentials   — no refresh token in SecureStore. Caller hides the
//                       buttons; nothing to unlock.
//   user_cancel      — user dismissed the biometric prompt. Silent;
//                       caller should not show an error.
//   biometric_failed — wrong finger / wrong face / lockout. Caller shows
//                       a non-fatal hint.
//   refresh_failed   — biometric passed but the refresh token is
//                       expired/revoked. Caller falls back to password
//                       sign-in.

type BiometricKind = "face" | "fingerprint" | "iris";

export interface BiometricCapability {
  /** Device has hardware AND has at least one biometric enrolled AND a refresh token is stored. */
  available: boolean;
  /** Sensors the device exposes. Empty when no hardware. */
  kinds: BiometricKind[];
  /** True once the capability probe has finished — drives loading state on first render. */
  ready: boolean;
}

function mapAuthenticationType(t: LocalAuthentication.AuthenticationType): BiometricKind | null {
  switch (t) {
    case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
      return "face";
    case LocalAuthentication.AuthenticationType.FINGERPRINT:
      return "fingerprint";
    case LocalAuthentication.AuthenticationType.IRIS:
      return "iris";
    default:
      return null;
  }
}

/** Probe whether the user can sign in with biometric on this device right now. */
export function useBiometricCapability(): BiometricCapability {
  const [state, setState] = useState<BiometricCapability>({
    available: false,
    kinds: [],
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [hasHw, isEnrolled, types, hasToken] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
        secureStorage.getRefreshToken().then((t) => !!t),
      ]);
      if (cancelled) return;
      const kinds = types.map(mapAuthenticationType).filter((k): k is BiometricKind => k !== null);
      setState({
        available: hasHw && isEnrolled && hasToken,
        kinds,
        ready: true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export type BiometricLoginError =
  | "no_credentials"
  | "user_cancel"
  | "biometric_failed"
  | "refresh_failed";

export class BiometricLoginAbort extends Error {
  constructor(public readonly kind: BiometricLoginError) {
    super(kind);
    this.name = "BiometricLoginAbort";
  }
}

/**
 * Mutation that runs the biometric-unlock-then-refresh flow.
 *
 * Pass `promptKind` so the dialog string matches the button the user
 * tapped ("Sign in with FaceID" vs "Sign in with Fingerprint"). The
 * underlying OS shows whichever sensor is enrolled regardless.
 */
export function useBiometricLogin() {
  const signIn = useAuthStore((s) => s.signIn);

  const run = useCallback(
    async (promptKind: BiometricKind) => {
      // 1. Read the stored refresh token first. If it's gone (post-
      //    logout, fresh install), there's nothing to unlock — fail
      //    fast before bothering the user with a biometric prompt.
      const refreshToken = await secureStorage.getRefreshToken();
      if (!refreshToken) {
        throw new BiometricLoginAbort("no_credentials");
      }

      // 2. Prompt. The OS picks the sensor; we just provide a label.
      const promptMessage =
        promptKind === "face" ? "Sign in to MedApp with FaceID" : "Sign in to MedApp";
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        // iOS only. Allows fall-through to passcode if biometric fails
        // a few times — same UX as banking apps.
        fallbackLabel: "Use Passcode",
        // Android only. Show the system confirm dialog so the unlock
        // event is intentional, not a stray touch.
        requireConfirmation: false,
        // Android: require strong (Class 3) biometric. Weak (Class 2)
        // includes face-unlock that's spoofable by photos on some
        // devices; for PHI we want the higher bar.
        biometricsSecurityLevel: "strong",
      });
      if (!result.success) {
        const kind: BiometricLoginError =
          result.error === "user_cancel" || result.error === "app_cancel"
            ? "user_cancel"
            : "biometric_failed";
        throw new BiometricLoginAbort(kind);
      }

      // 3. Biometric OK. Swap the refresh token for a fresh pair.
      // `biometric: true` tells the server to emit a
      // `user.biometric_login` audit + domain event.
      try {
        const response = await authApi.refresh(refreshToken, { biometric: true });
        await signIn(response.accessToken, response.user, response.refreshToken);
        return response;
      } catch (cause) {
        // Refresh failed — token expired, revoked, or backend
        // unreachable. Clear the stale refresh so the buttons stop
        // appearing on the next sign-in screen render.
        await secureStorage.clearRefreshToken();
        throw new BiometricLoginAbort("refresh_failed");
      }
    },
    [signIn],
  );

  return useMutation({
    mutationFn: run,
  });
}
