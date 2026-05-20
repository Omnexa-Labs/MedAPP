import Constants from "expo-constants";
import { Platform } from "react-native";

type AppEnv = "dev" | "preview" | "prod";

type Extra = {
  apiBaseUrl?: string;
  useMockApi?: boolean;
  appEnv?: AppEnv;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const appEnv: AppEnv = extra.appEnv ?? "dev";
const fallbackBaseUrl =
  Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";

export const env = {
  appEnv,
  apiBaseUrl: extra.apiBaseUrl ?? fallbackBaseUrl,
  useMockApi: extra.useMockApi ?? appEnv === "dev",
  get isProd() {
    return this.appEnv === "prod";
  },
};
