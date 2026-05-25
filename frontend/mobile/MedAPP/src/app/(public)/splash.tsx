// Route file is thin — it just connects the screen component to the router
// outlet and forwards the "next" action.

import { router } from "expo-router";
import { SplashScreen } from "@/features/welcome/SplashScreen";

export default function SplashRoute() {
  return <SplashScreen onGetStarted={() => router.replace("/(public)/sign-in")} />;
}
