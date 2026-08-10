// The root layout renders NOTHING until both stores report `isHydrating: false`
// (`src/app/_layout.tsx`: `if (!ready) return null`). So a hydrate that never
// clears that flag is not a degraded app — it is a blank white screen with no
// error and no way forward.
//
// That happened on a real device: the OS cleared app data, `expo-secure-store`
// hit a damaged keystore (`keystore2: Error::Km(UNKNOWN_ERROR)`), and the app
// never painted. `welcome-store.hydrate` had no error handling at all.
//
// These cases lock the guarantee: WHATEVER the storage layer does, hydration
// finishes and the flag clears.

const mockPrefsGet = jest.fn();
jest.mock("@/lib/storage/prefs", () => ({
  prefs: {
    get: (...a: unknown[]) => mockPrefsGet(...a),
    set: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  },
}));

import { useWelcomeStore } from "../welcome-store";

describe("welcome-store hydration always completes", () => {
  beforeEach(() => {
    mockPrefsGet.mockReset();
    useWelcomeStore.setState({ hasSeenWelcome: false, isHydrating: true });
  });

  it("clears isHydrating on a normal read", async () => {
    mockPrefsGet.mockResolvedValue(true);
    await useWelcomeStore.getState().hydrate();
    expect(useWelcomeStore.getState().isHydrating).toBe(false);
    expect(useWelcomeStore.getState().hasSeenWelcome).toBe(true);
  });

  it("clears isHydrating when storage THROWS — the blank-screen case", async () => {
    // This is the exact device failure: a keystore fault surfacing as a throw.
    mockPrefsGet.mockRejectedValue(new Error("keystore2: UNKNOWN_ERROR"));
    await useWelcomeStore.getState().hydrate();
    expect(useWelcomeStore.getState().isHydrating).toBe(false);
  });

  it("defaults to NOT having seen welcome when the read fails", async () => {
    // Showing the intro again is a recoverable annoyance. Assuming the user has
    // seen it would skip the splash on the strength of a failed read.
    useWelcomeStore.setState({ hasSeenWelcome: true, isHydrating: true });
    mockPrefsGet.mockRejectedValue(new Error("nope"));
    await useWelcomeStore.getState().hydrate();
    expect(useWelcomeStore.getState().hasSeenWelcome).toBe(false);
  });

  it("treats a null read as not-seen rather than throwing", async () => {
    mockPrefsGet.mockResolvedValue(null);
    await useWelcomeStore.getState().hydrate();
    expect(useWelcomeStore.getState().isHydrating).toBe(false);
    expect(useWelcomeStore.getState().hasSeenWelcome).toBe(false);
  });

  it("does not reject — the caller in _layout does not await it", async () => {
    // `_layout.tsx` calls `hydrateWelcome()` without awaiting or catching. An
    // unhandled rejection there is a red screen in dev.
    mockPrefsGet.mockRejectedValue(new Error("boom"));
    await expect(useWelcomeStore.getState().hydrate()).resolves.toBeUndefined();
  });
});
