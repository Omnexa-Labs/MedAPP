// Sign-up Step 2 route. Reads the in-memory draft. Requires:
//   - Step 1 values (else bounce to Step 1)
//   - Verification token (else bounce to the verify screen)
//
// The double-guard handles deep links + app restarts gracefully without
// letting the wizard end at the submit step with no verification token.

import { useEffect } from "react";
import { router } from "expo-router";
import { SignUpStep2Screen } from "@/features/auth/SignUpStep2Screen";
import { useSignUpDraft } from "@/features/auth/hooks/use-signup-draft";

export default function SignUpStep2Route() {
  const step1 = useSignUpDraft((s) => s.step1);
  const verification = useSignUpDraft((s) => s.verification);
  const setStep2 = useSignUpDraft((s) => s.setStep2);

  useEffect(() => {
    if (!step1) {
      router.replace("/(public)/sign-up");
    } else if (!verification) {
      router.replace("/(public)/sign-up-verify");
    }
  }, [step1, verification]);

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
