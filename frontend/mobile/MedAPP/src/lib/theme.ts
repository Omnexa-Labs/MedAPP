// Appearance (light / dark / system) — single source of truth for theming.
//
// Three-way rather than a binary switch: "system" is the default because both
// Material and HIG expect an app to follow the OS setting unless the user has
// deliberately overridden it. A binary toggle silently opts users out of that.
//
// The choice is persisted so it survives restarts, and applied by handing the
// resolved scheme to NativeWind, which toggles the `.dark` class that
// global.css keys its colour variables off.

import { useEffect } from "react";
import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export type Appearance = "system" | "light" | "dark";
export const APPEARANCE_OPTIONS: Appearance[] = ["system", "light", "dark"];

const STORAGE_KEY = "medapp.appearance";

interface AppearanceState {
  /** What the user picked. "system" means "follow the OS". */
  appearance: Appearance;
  /** False until the persisted value has been read, to avoid a flash of the wrong theme. */
  hydrated: boolean;
  setAppearance: (next: Appearance) => void;
  hydrate: () => Promise<void>;
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
  appearance: "system",
  hydrated: false,
  setAppearance: (next) => {
    set({ appearance: next });
    // Fire-and-forget: a failed write shouldn't block the UI from re-theming.
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  },
  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        set({ appearance: stored });
      }
    } catch {
      // Ignore: fall back to "system".
    } finally {
      set({ hydrated: true });
    }
  },
}));

/**
 * Mount once, high in the tree (root layout). Loads the persisted preference
 * and keeps NativeWind's colour scheme in sync with it.
 */
export function useAppearanceSync() {
  const { setColorScheme } = useNativeWindColorScheme();
  const appearance = useAppearanceStore((s) => s.appearance);
  const hydrated = useAppearanceStore((s) => s.hydrated);
  const hydrate = useAppearanceStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    // NativeWind accepts "system" directly and tracks OS changes itself.
    setColorScheme(appearance);
  }, [appearance, setColorScheme]);

  return { appearance, hydrated };
}

/**
 * The scheme actually being rendered ("light" | "dark"), with `appearance`
 * being the user's raw preference.
 *
 * For a real colour value in JS (a shadow tint, an icon `color`, a pressed
 * background) do NOT pair this with a literal hex — use `useTokenColor()` /
 * `tokenColor()` from ./tokens, which resolve a token name against the
 * generated palette for the current mode.
 */
export function useResolvedScheme() {
  const { colorScheme } = useNativeWindColorScheme();
  const appearance = useAppearanceStore((s) => s.appearance);
  return { scheme: colorScheme === "dark" ? "dark" : "light", appearance } as const;
}
