// Root layout: providers + font loading + store hydration.
//
// Holds the native splash until fonts and stores are ready, then renders the
// Expo Router stack. Children route groups (`(public)`, `(app)`) own their
// own headers/animations.

import "../../global.css";

import { useEffect } from "react";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";

import { queryClient } from "@/lib/api/query-client";
import { useAuthStore } from "@/store/auth-store";
import { useWelcomeStore } from "@/store/welcome-store";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const colorScheme = useColorScheme();

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
  const ready = fontsReady && storesReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(public)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
