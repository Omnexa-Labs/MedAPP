import AsyncStorage from "@react-native-async-storage/async-storage";

// Thin wrapper over AsyncStorage for non-sensitive UI prefs:
// hasSeenWelcome, theme override, last-tab, feature flags.
//
// JSON-roundtrips values so callers can store booleans/objects without
// thinking about serialization.

export const prefs = {
  async get<T = string>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    const payload = typeof value === "string" ? value : JSON.stringify(value);
    await AsyncStorage.setItem(key, payload);
  },
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};
