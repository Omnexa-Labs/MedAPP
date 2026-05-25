// Route file is thin — connects the screen component to the router outlet.

import { router } from "expo-router";
import { SignInScreen } from "@/features/auth/SignInScreen";

export default function SignInRoute() {
  return <SignInScreen onSuccess={() => router.replace("/(app)")} />;
}
