// Sign-up verify route — sits between Step 1 and Step 2.
//
// Reads Step 1 from the draft for the email pre-fill. If the draft is
// empty (deep link, app restart), bounce back to Step 1 so the wizard
// never proceeds without context.

import { useEffect } from "react";
import { router } from "expo-router";
import { SignUpVerifyScreen } from "@/features/auth/SignUpVerifyScreen";
import { useSignUpDraft } from "@/features/auth/hooks/use-signup-draft";

export default function SignUpVerifyRoute() {
  const step1 = useSignUpDraft((s) => s.step1);
  const setVerification = useSignUpDraft((s) => s.setVerification);

  useEffect(() => {
    if (!step1) router.replace("/(public)/sign-up");
  }, [step1]);

  if (!step1) return null;

  return (
    <SignUpVerifyScreen
      email={step1.email}
      onBack={() => router.back()}
      onVerified={(verification) => {
        setVerification(verification);
        router.push("/(public)/sign-up-step-2");
      }}
    />
  );
}
