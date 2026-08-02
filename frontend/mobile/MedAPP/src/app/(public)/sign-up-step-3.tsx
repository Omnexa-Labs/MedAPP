// Sign-up Step 3 route — final step. Composes the full payload from the
// in-memory draft and fires the sign-up mutation. On success the auth-store
// flips isAuthenticated and the root layout swaps into the (app) group; the
// draft is reset so a re-entry starts clean.

import { useEffect, useState } from "react";
import { router } from "expo-router";
import { SignUpStep3Screen } from "@/features/auth/SignUpStep3Screen";
import { useSignUpDraft } from "@/features/auth/hooks/use-signup-draft";
import { useSignUp } from "@/features/auth/hooks/use-signup";
import { ApiError } from "@/types/api";
import type { SignUpStep3Values } from "@/features/auth/schema";

// Skip defaults — biometric + data-sharing on, 2FA off, mirroring the form's
// own defaultValues. "Skip for now" completes the account with these rather
// than hard-gating onboarding on the security step (design brief Deviation 1).
const SKIP_DEFAULTS: SignUpStep3Values = {
  enableBiometric: true,
  enableTwoFactor: false,
  shareAnonymousData: true,
};

export default function SignUpStep3Route() {
  const draft = useSignUpDraft();
  const signUp = useSignUp();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Deep-link / restart guard: bounce back to whichever step is missing.
  useEffect(() => {
    if (!draft.step1) router.replace("/(public)/sign-up");
    else if (!draft.verification) router.replace("/(public)/sign-up-verify");
    else if (!draft.step2) router.replace("/(public)/sign-up-step-2");
  }, [draft.step1, draft.verification, draft.step2]);

  if (!draft.step1 || !draft.verification || !draft.step2) return null;

  const completeSetup = async (step3: SignUpStep3Values) => {
    setErrorMessage(null);
    try {
      await signUp.mutateAsync({
        fullName: draft.step1!.fullName,
        email: draft.step1!.email,
        password: draft.step1!.password,
        dateOfBirth: draft.step2!.dateOfBirth,
        bloodType: draft.step2!.bloodType,
        gender: draft.step2!.gender,
        primaryGoal: draft.step2!.primaryGoal,
        verification: draft.verification!,
        ...step3,
      });
      draft.reset();
      router.replace("/(app)");
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.isNetwork) {
          setErrorMessage("Network error. Check your connection.");
        } else if (e.status === 409) {
          // user_service surfaces conflicts as
          // {"detail": "Email already exists"} / "Phone already exists".
          // Forward that wording verbatim so the user knows whether to
          // change the email or the phone. Fall back to a generic
          // hint when the backend didn't send a usable detail.
          const lower = e.message.toLowerCase();
          if (lower.includes("email")) {
            setErrorMessage(
              "That email is already registered. Try signing in or use a different email.",
            );
          } else if (lower.includes("phone")) {
            setErrorMessage("That phone number is already registered. Use a different number.");
          } else {
            setErrorMessage(
              "An account with these details already exists. Try signing in instead.",
            );
          }
        } else {
          setErrorMessage(e.message);
        }
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <SignUpStep3Screen
      isSubmitting={signUp.isPending}
      errorMessage={errorMessage}
      onBack={() => router.back()}
      onSubmit={completeSetup}
      onSkip={() => completeSetup(SKIP_DEFAULTS)}
    />
  );
}
