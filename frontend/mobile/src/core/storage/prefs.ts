import AsyncStorage from "@react-native-async-storage/async-storage";

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
  async set(key: string, value: unknown) {
    const payload = typeof value === "string" ? value : JSON.stringify(value);
    return AsyncStorage.setItem(key, payload);
  },
  async remove(key: string) {
    return AsyncStorage.removeItem(key);
  },
};
