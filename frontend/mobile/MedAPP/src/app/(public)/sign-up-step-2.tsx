// Sign-up Step 2 route. Reads the in-memory draft (Step 1 must already be
// filled) and persists Step 2 values back into the draft before pushing to
// Step 3. If the draft is empty (deep link, app restart) we bounce back to
// Step 1 so we don't end up creating a half-formed account.

import { useEffect } from "react";
import { router } from "expo-router";
import { SignUpStep2Screen } from "@/features/auth/SignUpStep2Screen";
import { useSignUpDraft } from "@/features/auth/hooks/use-signup-draft";

export default function SignUpStep2Route() {
  const step1 = useSignUpDraft((s) => s.step1);
  const setStep2 = useSignUpDraft((s) => s.setStep2);

  useEffect(() => {
    if (!step1) router.replace("/(public)/sign-up");
  }, [step1]);

  return (
    <SignUpStep2Screen
      onBack={() => router.back()}
      onNext={(values) => {
        setStep2(values);
        router.push("/(public)/sign-up-step-3");
      }}
    />
  );
}
