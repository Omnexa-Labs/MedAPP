import { authApi, TwoFactorRequired } from "../api";
const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock("@/lib/api/client", () => ({
  client: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));
beforeEach(() => jest.clearAllMocks());

test("password challenge is never treated as an access token", async () => {
  mockPost.mockResolvedValue({ mfa_required: true, challenge_token: "challenge", expires_in: 300 });
  await expect(
    authApi.login({ email: "test@example.com", password: "Password123!" }),
  ).rejects.toBeInstanceOf(TwoFactorRequired);
  expect(mockGet).not.toHaveBeenCalled();
});
test("a verified factor retrieves the profile with the new access token", async () => {
  mockPost.mockResolvedValue({ access_token: "verified", refresh_token: "refresh" });
  mockGet.mockResolvedValue({ id: "patient", first_name: "Ama", last_name: "Mensah" });
  await expect(authApi.completeTwoFactor("challenge", "123456")).resolves.toMatchObject({
    accessToken: "verified",
    user: { id: "patient" },
  });
  expect(mockPost).toHaveBeenCalledWith(
    "/v1/auth/two-factor/verify",
    { challenge_token: "challenge", code: "123456" },
    { withAuth: false },
  );
  expect(mockGet).toHaveBeenCalledWith("/v1/me", {
    withAuth: false,
    headers: { Authorization: "Bearer verified" },
  });
});
test("failed profile lookup closes the newly issued session", async () => {
  mockPost.mockResolvedValue({ access_token: "verified", refresh_token: "refresh" });
  mockGet.mockRejectedValue(new Error("offline"));
  await expect(authApi.completeTwoFactor("challenge", "123456")).rejects.toThrow("offline");
  expect(mockPost).toHaveBeenCalledWith(
    "/v1/auth/logout",
    { refresh_token: "refresh" },
    { withAuth: false },
  );
});
