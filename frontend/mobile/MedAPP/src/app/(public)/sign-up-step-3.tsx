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

  return (
    <SignUpStep3Screen
      isSubmitting={signUp.isPending}
      errorMessage={errorMessage}
      onBack={() => router.back()}
      onSubmit={async (step3) => {
        setErrorMessage(null);
        try {
          await signUp.mutateAsync({
            firstName: draft.step1!.firstName,
            middleName: draft.step1!.middleName,
            lastName: draft.step1!.lastName,
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
            if (e.isNetwork) setErrorMessage("Network error. Check your connection.");
            else setErrorMessage(e.message);
          } else {
            setErrorMessage("Something went wrong. Please try again.");
          }
        }
      }}
    />
  );
}
