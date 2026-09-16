import Constants from "expo-constants";
import { Platform } from "react-native";

// Typed reader over the `extra` block in app.config.ts.
//
// We resolve once at module load and throw if a required value is missing — a
// missing apiBaseUrl is a misconfiguration, not a runtime condition to handle.

export type AppEnv = "dev" | "preview" | "prod";

export interface AppConfig {
  appEnv: AppEnv;
  apiBaseUrl: string;
  partnerOnboardingUrl: string;
  hospitalPortalUrl: string;
}

function readExtra(): AppConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as Partial<AppConfig>;
  const appEnv = extra.appEnv;
  let apiBaseUrl = extra.apiBaseUrl;
  let partnerOnboardingUrl = extra.partnerOnboardingUrl;
  let hospitalPortalUrl = extra.hospitalPortalUrl || "";

  if (!appEnv || !apiBaseUrl || !partnerOnboardingUrl) {
    throw new Error(
      `app.config.ts is missing required extras: ${JSON.stringify({
        appEnv,
        apiBaseUrl,
        partnerOnboardingUrl,
      })}`,
    );
  }

  // app.config.ts defaults non-macOS dev builds to http://10.0.2.2:8000 (the
  // Android emulator's loopback to the host). Browsers cannot reach that
  // address — replace it with localhost when running as a web app.
  if (Platform.OS === "web" && apiBaseUrl.includes("10.0.2.2")) {
    apiBaseUrl = apiBaseUrl.replace("10.0.2.2", "localhost");
  }
  if (Platform.OS === "web")
    partnerOnboardingUrl = partnerOnboardingUrl.replace("10.0.2.2", "localhost");
  if (Platform.OS === "web") hospitalPortalUrl = hospitalPortalUrl.replace("10.0.2.2", "localhost");

  return { appEnv, apiBaseUrl, partnerOnboardingUrl, hospitalPortalUrl };
}

export const config: AppConfig = readExtra();
