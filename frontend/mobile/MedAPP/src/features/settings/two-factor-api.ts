import { client } from "@/lib/api/client";

export interface TwoFactorStatus {
  enabled: boolean;
  available: boolean;
  recovery_codes_remaining: number;
  sign_out_delay_seconds: number;
}
export interface TwoFactorSetup {
  setup_id: string;
  secret: string;
  provisioning_uri: string;
  recovery_codes: string[];
  expires_in: number;
}

export function twoFactorApi(isSessionCurrent: () => boolean) {
  const options = { isSessionCurrent };
  return {
    status: () => client.get<TwoFactorStatus>("/v1/me/two-factor", options),
    setup: (password: string) =>
      client.post<TwoFactorSetup>(
        "/v1/me/two-factor/setup",
        { current_password: password },
        options,
      ),
    confirm: (setupId: string, code: string) =>
      client.post<void>("/v1/me/two-factor/confirm", { setup_id: setupId, code }, options),
    disable: (password: string, code: string) =>
      client.post<void>("/v1/me/two-factor/disable", { current_password: password, code }, options),
    regenerate: (password: string, code: string) =>
      client.post<{ recovery_codes: string[] }>(
        "/v1/me/two-factor/recovery-codes",
        { current_password: password, code },
        options,
      ),
  };
}
