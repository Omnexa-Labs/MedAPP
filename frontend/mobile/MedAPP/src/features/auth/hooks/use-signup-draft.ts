// In-memory draft store for the 3-step sign-up flow.
//
// Why in-memory (no persistence):
//   The draft holds password + DOB before the user has consented to creation.
//   Persisting that to disk widens the attack surface for no real UX gain — if
//   the user backgrounds the app mid-flow they restart sign-up, which is the
//   safer default.

import { create } from "zustand";
import type { SignUpStep1Values, SignUpStep2Values } from "@/features/auth/schema";

/**
 * Verified contact captured between Step 1 and Step 2.
 *
 * `channel` is which one the user chose to verify; `recipient` is the
 * email or E.164 phone they verified; `token` is the short-lived JWT
 * the backend returned. The final signup submit sends the token; the
 * backend then sets `email_verified=true` or `phone_verified=true`
 * accordingly.
 */
export interface SignUpVerification {
  channel: "sms" | "email";
  recipient: string;
  token: string;
}

interface SignUpDraftState {
  step1: SignUpStep1Values | null;
  step2: SignUpStep2Values | null;
  verification: SignUpVerification | null;
  setStep1: (values: SignUpStep1Values) => void;
  setStep2: (values: SignUpStep2Values) => void;
  setVerification: (verification: SignUpVerification) => void;
  reset: () => void;
}

export const useSignUpDraft = create<SignUpDraftState>((set) => ({
  step1: null,
  step2: null,
  verification: null,
  setStep1: (values) => set({ step1: values }),
  setStep2: (values) => set({ step2: values }),
  setVerification: (verification) => set({ verification }),
  reset: () => set({ step1: null, step2: null, verification: null }),
}));
