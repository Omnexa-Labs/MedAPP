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
    const seen = await prefs.get<boolean>(HAS_SEEN_WELCOME_KEY);
    set({ hasSeenWelcome: seen === true, isHydrating: false });
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
