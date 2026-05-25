// Authenticated route group. Tabs land here once the auth feature is wired.
// For now a plain stack so the placeholder home route renders.

import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/store/auth-store";

export default function AppLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Redirect href="/(public)/sign-in" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
