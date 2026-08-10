import { create } from "zustand";
import { prefs } from "@/lib/storage/prefs";

// Tracks whether the user has seen the first-launch welcome flow. Read by the
// root layout to decide between the welcome tree and the auth/app tree.
//
// This is NOT partner onboarding — that lives on the web. See
// `features/welcome/` for the screens this flag gates.

const HAS_SEEN_WELCOME_KEY = "medapp.welcome.hasSeen";

interface WelcomeState {
  hasSeenWelcome: boolean;
  isHydrating: boolean;
  hydrate: () => Promise<void>;
  completeWelcome: () => Promise<void>;
  reset: () => Promise<void>;
}

export const useWelcomeStore = create<WelcomeState>((set) => ({
  hasSeenWelcome: false,
  isHydrating: true,

  hydrate: async () => {
    // try/FINALLY, not try/catch, and this is load-bearing.
    //
    // `src/app/_layout.tsx` renders NOTHING until `isHydrating` is false on
    // both stores. This function had no error handling at all, so a throwing
    // `prefs.get` left the flag stuck true and the app showed a permanently
    // blank white screen — no error, no splash, no way forward.
    //
    // Observed on device: after the OS cleared app data, `keystore2` returned
    // UNKNOWN_ERROR and the app never painted. Any keystore fault does it — a
    // restored backup, an OS upgrade, a user clearing storage.
    //
    // Failing to read "has the user seen welcome" is not fatal: the honest
    // default is FALSE, which routes to the splash. Showing the intro again is
    // a far better outcome than showing nothing.
    try {
      const seen = await prefs.get<boolean>(HAS_SEEN_WELCOME_KEY);
      set({ hasSeenWelcome: seen === true });
    } catch {
      set({ hasSeenWelcome: false });
    } finally {
      set({ isHydrating: false });
    }
  },

  completeWelcome: async () => {
    await prefs.set(HAS_SEEN_WELCOME_KEY, true);
    set({ hasSeenWelcome: true });
  },

  reset: async () => {
    await prefs.remove(HAS_SEEN_WELCOME_KEY);
    set({ hasSeenWelcome: false });
  },
}));
