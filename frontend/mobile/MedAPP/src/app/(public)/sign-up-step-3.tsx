// Sign-up Step 3 route — final step. Composes the full payload from the
// in-memory draft and fires the sign-up mutation. On success the auth-store
// flips isAuthenticated and the root layout swaps into the (app) group; the
// draft is reset so a re-entry starts clean.

import { useRef, useState } from "react";
import { Redirect, router, type Href } from "expo-router";
import { SignUpStep3Screen } from "@/features/auth/SignUpStep3Screen";
import { useSignUpDraft } from "@/features/auth/hooks/use-signup-draft";
import { goBackOr } from "@/features/auth/signup-nav";
import { useSignUp } from "@/features/auth/hooks/use-signup";
import { ApiError } from "@/types/api";
import { SignupSignInError } from "@/features/auth/api";

export default function SignUpStep3Route() {
  const draft = useSignUpDraft();
  const signUp = useSignUp();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const inFlight = useRef(false);

  // Deep-link / restart guard: bounce to whichever step is missing, earliest
  // first. Declarative `<Redirect>` rather than a `useEffect` + `replace`, so
  // the guarded screen never paints before bouncing — and so the guard can
  // never dispatch GO_BACK on a stack that has nothing to pop (a cold start via
  // Expo Go's replayed URL is exactly that stack). See
  // src/features/auth/signup-nav.ts.
  if (!draft.step1) return <Redirect href="/(public)/sign-up" />;
  if (!draft.verification) return <Redirect href="/(public)/sign-up-verify" />;
  if (!draft.step2) return <Redirect href="/(public)/sign-up-step-2" />;

  const completeSetup = async () => {
    if (inFlight.current || accountCreated) return;
    inFlight.current = true;
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
        providerTicket: draft.provider?.ticket,
      });
      draft.reset();
      router.replace("/(app)");
    } catch (e) {
      if (e instanceof SignupSignInError) {
        setAccountCreated(true);
        setErrorMessage(e.message);
      } else if (e instanceof ApiError) {
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
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <SignUpStep3Screen
      isSubmitting={signUp.isPending}
      errorMessage={errorMessage}
      accountCreated={accountCreated}
      onRestartProvider={
        draft.provider
          ? () => {
              draft.reset();
              router.replace("/(public)/provider-sign-in" as Href);
            }
          : undefined
      }
      onSignIn={() => {
        draft.reset();
        router.replace("/(public)/sign-in");
      }}
      // Every guard above has passed, so Step 2 is a legal destination even
      // when this screen was deep-linked and there is no stack to pop.
      onBack={() => goBackOr("/(public)/sign-up-step-2")}
      onSubmit={completeSetup}
      onSkip={completeSetup}
    />
  );
}
