import { client } from "@/lib/api/client";
import { providerApi } from "../provider-api";
import { authApi, TwoFactorRequired } from "../api";
import { useSignUpDraft } from "../hooks/use-signup-draft";
jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn(), post: jest.fn() } }));
const post = jest.mocked(client.post);
const get = jest.mocked(client.get);
beforeEach(() => {
  jest.resetAllMocks();
  useSignUpDraft.getState().reset();
});

test("public provider requests do not attach a stale MedApp bearer", async () => {
  post.mockResolvedValueOnce({ challenge_token: "nonce-proof", nonce: "nonce", expires_in: 300 });
  await providerApi.begin("apple");
  expect(post).toHaveBeenCalledWith(
    "/v1/auth/providers/begin",
    { provider: "apple" },
    { withAuth: false },
  );
  post.mockResolvedValue({
    action: "signup_required",
    ticket: "proof",
    email: "patient@example.com",
  });
  await providerApi.complete("nonce-proof", "id-token");
  expect(post).toHaveBeenLastCalledWith(
    "/v1/auth/providers/complete",
    { challenge_token: "nonce-proof", identity_token: "id-token" },
    { withAuth: false },
  );
});
test("provider MFA never requests a profile or treats a challenge as an access token", async () => {
  post.mockResolvedValue({ mfa_required: true, challenge_token: "factor", expires_in: 300 });
  await expect(providerApi.complete("proof", "id-token")).rejects.toBeInstanceOf(TwoFactorRequired);
  expect(get).not.toHaveBeenCalled();
});
test("a failed profile lookup closes the orphan provider session", async () => {
  post.mockResolvedValue(undefined);
  get.mockRejectedValue(new Error("offline"));
  await expect(
    authApi.providerSession({ access_token: "access", refresh_token: "refresh" }),
  ).rejects.toThrow("offline");
  expect(get).toHaveBeenCalledWith("/v1/me", {
    withAuth: false,
    headers: { Authorization: "Bearer access" },
  });
  expect(post).toHaveBeenCalledWith(
    "/v1/auth/logout",
    { refresh_token: "refresh" },
    { withAuth: false },
  );
});
test("editing the signup email or resetting the draft drops the provider proof", () => {
  const store = useSignUpDraft.getState();
  store.setProvider({
    email: "patient@example.com",
    fullName: "Ama",
    ticket: "ticket",
    expiresAt: 1,
  });
  store.setStep1({
    email: "different@example.com",
    fullName: "Ama Mensah",
    password: "password123",
    confirmPassword: "password123",
    agreeToTerms: true,
  });
  expect(useSignUpDraft.getState().provider).toBeNull();
  store.setProvider({
    email: "patient@example.com",
    fullName: "Ama",
    ticket: "ticket",
    expiresAt: 1,
  });
  store.reset();
  expect(useSignUpDraft.getState().provider).toBeNull();
});
