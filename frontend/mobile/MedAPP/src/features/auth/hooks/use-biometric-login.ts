import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useMutation } from "@tanstack/react-query";
import { BiometricStorageError, secureStorage } from "@/lib/storage/secure-storage";
import { AuthSessionChanged, useAuthStore } from "@/store/auth-store";
import { ApiError } from "@/types/api";

type BiometricKind = "face" | "fingerprint" | "iris";
export interface BiometricCapability {
  deviceCapable: boolean;
  hasEnrolledCredential: boolean;
  ownerId: string | null;
  kinds: BiometricKind[];
  ready: boolean;
  failed: boolean;
  refresh: () => Promise<void>;
}

// This probe reads enrollment metadata, never the protected key or a token.
export function useBiometricCapability(): BiometricCapability {
  const request = useRef(0);
  const [state, setState] = useState({
    deviceCapable: false,
    hasEnrolledCredential: false,
    ownerId: null as string | null,
    kinds: [] as BiometricKind[],
    ready: false,
    failed: false,
  });
  const refresh = useCallback(async () => {
    const current = ++request.current;
    try {
      const deviceCapable = secureStorage.canUseBiometrics();
      const [types, ownerId] = await Promise.all([
        deviceCapable
          ? LocalAuthentication.supportedAuthenticationTypesAsync()
          : Promise.resolve([]),
        secureStorage.biometricOwner(),
      ]);
      const kinds: BiometricKind[] = [];
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION))
        kinds.push("face");
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT))
        kinds.push("fingerprint");
      if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) kinds.push("iris");
      if (request.current === current)
        setState({
          deviceCapable,
          ownerId,
          hasEnrolledCredential: !!ownerId,
          kinds,
          ready: true,
          failed: false,
        });
    } catch {
      if (request.current === current)
        setState({
          deviceCapable: false,
          ownerId: null,
          hasEnrolledCredential: false,
          kinds: [],
          ready: true,
          failed: true,
        });
    }
  }, []);
  useEffect(() => {
    void refresh();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      request.current++;
      listener.remove();
    };
  }, [refresh]);
  return { ...state, refresh };
}

export type BiometricLoginError =
  "no_credentials" | "user_cancel" | "biometric_failed" | "refresh_failed" | "network_failed";
export class BiometricLoginAbort extends Error {
  constructor(public readonly kind: BiometricLoginError) {
    super(kind);
    this.name = "BiometricLoginAbort";
  }
}

export function useBiometricLogin() {
  const pending = useRef<Promise<void> | null>(null);
  return useMutation({
    mutationFn: (_kind: BiometricKind) => {
      if (pending.current) return pending.current;
      const operation = useAuthStore
        .getState()
        .biometricSignIn()
        .catch((error) => {
          if (error instanceof AuthSessionChanged) throw new BiometricLoginAbort("user_cancel");
          if (error instanceof BiometricStorageError) {
            throw new BiometricLoginAbort(
              error.kind === "missing"
                ? "no_credentials"
                : error.kind === "cancelled"
                  ? "user_cancel"
                  : "biometric_failed",
            );
          }
          if (error instanceof ApiError)
            throw new BiometricLoginAbort(
              error.isUnauthorized ? "refresh_failed" : "network_failed",
            );
          throw new BiometricLoginAbort("biometric_failed");
        })
        .finally(() => {
          pending.current = null;
        });
      pending.current = operation;
      return operation;
    },
  });
}
