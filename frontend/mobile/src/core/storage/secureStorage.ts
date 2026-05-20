import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "medapp.auth.token";
const REFRESH_KEY = "medapp.auth.refresh";

export const secureStorage = {
  async getToken() {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async setToken(token: string) {
    return SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clearToken() {
    return SecureStore.deleteItemAsync(TOKEN_KEY);
  },
  async getRefreshToken() {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async setRefreshToken(token: string) {
    return SecureStore.setItemAsync(REFRESH_KEY, token);
  },
  async clearRefreshToken() {
    return SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};
