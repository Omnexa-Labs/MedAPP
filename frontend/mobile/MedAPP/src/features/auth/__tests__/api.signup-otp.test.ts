import { client } from "@/lib/api/client";
import { authApi } from "../api";

jest.mock("@/lib/api/client", () => ({ client: { post: jest.fn() } }));

const post = jest.mocked(client.post);
beforeEach(() => jest.clearAllMocks());

test("requests email delivery without authentication and preserves separate timer values", async () => {
  post.mockResolvedValue({ sent: true, expires_in: 120, resend_after_seconds: 17 });
  await expect(
    authApi.signupOtpStart({ channel: "email", recipient: "patient@example.com" }),
  ).resolves.toEqual({ expiresIn: 120, resendAfterSeconds: 17 });
  expect(post).toHaveBeenCalledWith(
    "/v1/auth/otp/signup-start",
    { channel: "email", email: "patient@example.com" },
    { withAuth: false },
  );
});

test("uses the existing 30-second cooldown when connected to an older backend", async () => {
  post.mockResolvedValue({ sent: true, expires_in: 300 });
  await expect(
    authApi.signupOtpStart({ channel: "email", recipient: "patient@example.com" }),
  ).resolves.toEqual({ expiresIn: 300, resendAfterSeconds: 30 });
});

test("exchanges an email code for signup proof without authentication", async () => {
  post.mockResolvedValue({ verification_token: "email-proof", expires_in: 900 });
  await expect(
    authApi.signupOtpVerify({ channel: "email", recipient: "patient@example.com", code: "123456" }),
  ).resolves.toEqual({ verificationToken: "email-proof", expiresIn: 900 });
  expect(post).toHaveBeenCalledWith(
    "/v1/auth/otp/signup-verify",
    { channel: "email", email: "patient@example.com", code: "123456" },
    { withAuth: false },
  );
});
