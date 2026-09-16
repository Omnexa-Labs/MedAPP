// Sign-up route — Step 1 of a 3-step flow.
// Step 1 values land in the in-memory draft store; the route pushes to the
// OTP verify screen, then onward to Step 2.

import { router } from "expo-router";
import { useState } from "react";
import { SignUpStep1Screen } from "@/features/auth/SignUpStep1Screen";
import { useSignUpDraft } from "@/features/auth/hooks/use-signup-draft";

export default function SignUpRoute() {
  const setStep1 = useSignUpDraft((s) => s.setStep1);
  const provider = useSignUpDraft((s) => s.provider);
  const [expired, setExpired] = useState(false);

  return (
    <SignUpStep1Screen
      initialName={provider?.fullName}
      initialEmail={provider?.email}
      providerMessage={
        provider
          ? expired
            ? "Provider verification expired. Start provider sign-in again or continue with email only."
            : "Complete signup with this email to connect your provider. Changing the email continues without connecting it."
          : undefined
      }
      onEmailOnly={() => {
        useSignUpDraft.getState().setProvider(null);
        setExpired(false);
      }}
      onNext={(values) => {
        if (
          provider &&
          provider.email.toLowerCase() === values.email.toLowerCase() &&
          provider.expiresAt <= Date.now()
        ) {
          setExpired(true);
          return;
        }
        setStep1(values);
        // Step 1 → contact verification → Step 2. The verify screen
        // verifies the account email and stores the proof token
        // consumed by the final signup request.
        router.push("/(public)/sign-up-verify");
      }}
    />
  );
}
