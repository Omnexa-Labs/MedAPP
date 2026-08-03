// Sign-up verify route — sits between Step 1 and Step 2.
//
// Reads Step 1 from the draft for the email pre-fill. If the draft is
// empty (deep link, app restart, Expo Go replaying its last URL), bounce back
// to Step 1 so the wizard never proceeds without context.
//
// The guard is a `<Redirect>`, not a `useEffect` + `router.replace`. Two
// reasons, both bugs that were live here:
//   - the effect fired AFTER the first paint, so the guarded screen flashed;
//   - a guard must only ever move the user FORWARD to a legal route. It must
//     never reach for `router.back()`, because a deep-linked / freshly launched
//     stack has nothing to pop and GO_BACK then throws in the user's face.
// See src/features/auth/signup-nav.ts.

import { Redirect, router } from "expo-router";
import { SignUpVerifyScreen } from "@/features/auth/SignUpVerifyScreen";
import { useSignUpDraft } from "@/features/auth/hooks/use-signup-draft";
import { goBackOr } from "@/features/auth/signup-nav";

export default function SignUpVerifyRoute() {
  const step1 = useSignUpDraft((s) => s.step1);
  const setVerification = useSignUpDraft((s) => s.setVerification);

  if (!step1) return <Redirect href="/(public)/sign-up" />;

  return (
    <SignUpVerifyScreen
      email={step1.email}
      // Step 1 is the screen before this one. On a normal push it is on the
      // stack; on a deep-link entry it is not, so we replace onto it.
      onBack={() => goBackOr("/(public)/sign-up")}
      onVerified={(verification) => {
        setVerification(verification);
        router.push("/(public)/sign-up-step-2");
      }}
    />
  );
}
