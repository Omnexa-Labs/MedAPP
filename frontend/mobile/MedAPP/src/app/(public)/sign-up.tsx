// Sign-up route — Step 1 of a 3-step flow.
// Step 1 values land in the in-memory draft store; the route pushes to Step 2.

import { router } from "expo-router";
import { SignUpStep1Screen } from "@/features/auth/SignUpStep1Screen";
import { useSignUpDraft } from "@/features/auth/hooks/use-signup-draft";

export default function SignUpRoute() {
  const setStep1 = useSignUpDraft((s) => s.setStep1);

  return (
    <SignUpStep1Screen
      onNext={(values) => {
        setStep1(values);
        router.push("/(public)/sign-up-step-2");
      }}
    />
  );
}
