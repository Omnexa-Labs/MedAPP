// Sign-up Step 2 route. Reads the in-memory draft. Requires:
//   - Step 1 values (else bounce to Step 1)
//   - Verification token (else bounce to the verify screen)
//
// The double-guard handles deep links + app restarts gracefully without
// letting the wizard end at the submit step with no verification token.
//
// THE DEFECT THIS FIXES. A cold start could land here — Expo Go replays the
// last URL it opened, and it keeps that outside the app sandbox, so clearing
// the app's data wipes the draft but not the pending link. `app/index.tsx`'s
// entry logic never runs, because index is not the route being opened. Two
// faults compounded:
//   1. the guard ran in a `useEffect`, i.e. after the first paint, so Step 2
//      rendered — a draftless form, briefly, on first launch;
//   2. the screen it painted wired its back chevron to a bare `router.back()`,
//      and a freshly launched stack has nothing to pop, so React Navigation
//      threw "The action 'GO_BACK' was not handled by any navigator" as a red
//      toast over the top of it.
// Now: the guard is a declarative `<Redirect>` (evaluated during render, so
// nothing paints and no GO_BACK is possible), and back goes through
// `goBackOr`, which replaces when the stack is empty. See
// src/features/auth/signup-nav.ts.

import { Redirect, router } from "expo-router";
import { SignUpStep2Screen } from "@/features/auth/SignUpStep2Screen";
import { useSignUpDraft } from "@/features/auth/hooks/use-signup-draft";
import { goBackOr } from "@/features/auth/signup-nav";

export default function SignUpStep2Route() {
  const step1 = useSignUpDraft((s) => s.step1);
  const verification = useSignUpDraft((s) => s.verification);
  const setStep2 = useSignUpDraft((s) => s.setStep2);

  // Ordered: the earliest missing prerequisite wins, so a draftless entry lands
  // on Step 1 rather than on a verify screen that would itself bounce.
  if (!step1) return <Redirect href="/(public)/sign-up" />;
  if (!verification) return <Redirect href="/(public)/sign-up-verify" />;

  return (
    <SignUpStep2Screen
      // Reaching this line means step1 AND verification exist, so the verify
      // screen is a legal destination even when it is not on the stack.
      onBack={() => goBackOr("/(public)/sign-up-verify")}
      onNext={(values) => {
        setStep2(values);
        router.push("/(public)/sign-up-step-3");
      }}
    />
  );
}
