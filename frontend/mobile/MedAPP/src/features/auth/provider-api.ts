import { client, type RequestOptions } from "@/lib/api/client";
import { authApi, TwoFactorRequired } from "./api";

export type Provider = "google" | "apple";
export type ProviderDraft = {
  action: "signup_required" | "link_required";
  ticket: string;
  provider: Provider;
  email: string;
  display_name?: string;
  two_factor_required?: boolean;
  expires_in: number;
};
type Tokens = { access_token: string; refresh_token: string };
type ProofResult =
  | ProviderDraft
  | Tokens
  | {
      mfa_required: true;
      challenge_token: string;
      expires_in: number;
    };

async function resolve(result: ProofResult) {
  if ("action" in result) return result;
  if ("mfa_required" in result)
    throw new TwoFactorRequired(result.challenge_token, result.expires_in);
  return authApi.providerSession(result);
}

export const providerApi = {
  config: () =>
    client.get<Record<Provider, boolean>>("/v1/auth/providers/config", { withAuth: false }),
  begin: (provider: Provider) =>
    client.post<{ challenge_token: string; nonce: string; expires_in: number }>(
      "/v1/auth/providers/begin",
      { provider },
      { withAuth: false },
    ),
  async complete(challenge: string, identityToken: string) {
    return resolve(
      await client.post<ProofResult>(
        "/v1/auth/providers/complete",
        { challenge_token: challenge, identity_token: identityToken },
        { withAuth: false },
      ),
    );
  },
  async link(ticket: string, password: string, code: string) {
    const tokens = await client.post<Tokens>(
      "/v1/auth/providers/link",
      { ticket, current_password: password, code },
      { withAuth: false },
    );
    return authApi.providerSession(tokens);
  },
  connections: (options?: RequestOptions) =>
    client.get<{
      items: { provider: Provider; connected_at: string }[];
    }>("/v1/me/providers", options),
  disconnect: (provider: Provider, password: string, code: string, options?: RequestOptions) =>
    client.post<void>(
      `/v1/me/providers/${provider}/disconnect`,
      { current_password: password, code },
      options,
    ),
};
