// Route file is thin — it just connects the screen component to the router
// outlet and forwards the two navigation actions.
//
// The approved frame (50:105) shows both a "Get Started" CTA and a separate
// "Already have an account? Sign In" link, so the CTA now leads to sign-up and
// the link keeps the previous sign-in destination.

import { router } from "expo-router";
import { SplashScreen } from "@/features/welcome/SplashScreen";

export default function SplashRoute() {
  return (
    <SplashScreen
      onGetStarted={() => router.replace("/(public)/sign-up")}
      onSignIn={() => router.replace("/(public)/sign-in")}
    />
  );
}
