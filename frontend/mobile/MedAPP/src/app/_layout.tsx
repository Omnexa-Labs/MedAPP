// Root layout: providers + font loading + store hydration.
//
// Holds the native splash until fonts and stores are ready, then renders the
// Expo Router stack. Children route groups (`(public)`, `(app)`) own their
// own headers/animations.

import "../../global.css";

import { useEffect, useState } from "react";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { QueryClientProvider } from "@tanstack/react-query";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";

import { queryClient } from "@/lib/api/query-client";
import { useAppearanceSync, useResolvedScheme } from "@/lib/theme";
import { useAuthStore } from "@/store/auth-store";
import { useWelcomeStore } from "@/store/welcome-store";
import { ReminderDeviceBridge } from "@/features/medications/ReminderDeviceBridge";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Loads the persisted Light/Dark/System preference and pushes it into
  // NativeWind, which toggles the `.dark` class global.css keys its colour
  // variables off. Must run before first paint to avoid a theme flash.
  const { hydrated: appearanceHydrated } = useAppearanceSync();
  const { scheme } = useResolvedScheme();

  const [fontsLoaded, fontsError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateWelcome = useWelcomeStore((s) => s.hydrate);
  const isAuthHydrating = useAuthStore((s) => s.isHydrating);
  const isWelcomeHydrating = useWelcomeStore((s) => s.isHydrating);

  useEffect(() => {
    hydrateAuth();
    hydrateWelcome();
  }, [hydrateAuth, hydrateWelcome]);

  const fontsReady = fontsLoaded || !!fontsError;
  const storesReady = !isAuthHydrating && !isWelcomeHydrating;

  // WATCHDOG. The stores now clear `isHydrating` in a `finally`, so a THROWN
  // error can no longer strand this gate — but a native call that never settles
  // still can, and `finally` does not run for a promise that never resolves.
  //
  // That is not hypothetical: on device, `expo-secure-store` sat on a damaged
  // keystore (`keystore2: Error::Km(UNKNOWN_ERROR)`) and the app rendered a
  // blank white screen indefinitely. `return null` below means a stuck flag is
  // not a degraded app, it is NO app.
  //
  // After the timeout we render anyway. The consequence is understood and
  // acceptable: an unresolved auth store reports `isAuthenticated: false`, so
  // `index.tsx` routes to sign-in. A user who has to log in again is a far
  // better outcome than a user staring at nothing.
  //
  // 4s is longer than a healthy hydrate by an order of magnitude (it is two
  // local reads) and short enough not to read as a hang.
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);
  useEffect(() => {
    if (storesReady && appearanceHydrated) return;
    const timer = setTimeout(() => setHydrationTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, [storesReady, appearanceHydrated]);

  // Fonts are deliberately NOT covered by the watchdog: `useFonts` already
  // reports `fontsError`, which `fontsReady` treats as ready, so that path has
  // its own escape and rendering without them is a real visual regression.
  // Hydration is ready when it genuinely finished, OR when we gave up waiting.
  const hydrationReady = (storesReady && appearanceHydrated) || hydrationTimedOut;
  const ready = fontsReady && hydrationReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ReminderDeviceBridge />
      {/* Resolved scheme, not the raw OS one — so an explicit Light/Dark
          override also themes the navigation chrome, not just our own views. */}
      <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(public)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
