import { useMutation } from "@tanstack/react-query";
import {
  authApi,
  type SignupOtpStartPayload,
  type SignupOtpVerifyPayload,
  type SignupOtpVerifyResult,
} from "@/features/auth/api";

// useMutation wrappers for the signup-time OTP endpoints. Kept separate
// from the passwordless-login OTP hooks because the wire shapes + error
// semantics differ (signup-start returns 409 on existing contact;
// login-start does not).

export function useSignupOtpStart() {
  return useMutation({
    mutationFn: (payload: SignupOtpStartPayload) => authApi.signupOtpStart(payload),
  });
}

export function useSignupOtpVerify() {
  return useMutation<SignupOtpVerifyResult, Error, SignupOtpVerifyPayload>({
    mutationFn: (payload) => authApi.signupOtpVerify(payload),
  });
}
