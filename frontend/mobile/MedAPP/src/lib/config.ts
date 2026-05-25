import Constants from "expo-constants";

// Typed reader over the `extra` block in app.config.ts.
//
// We resolve once at module load and throw if a required value is missing — a
// missing apiBaseUrl is a misconfiguration, not a runtime condition to handle.

export type AppEnv = "dev" | "preview" | "prod";

export interface AppConfig {
  appEnv: AppEnv;
  apiBaseUrl: string;
  partnerOnboardingUrl: string;
}

function readExtra(): AppConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as Partial<AppConfig>;
  const appEnv = extra.appEnv;
  const apiBaseUrl = extra.apiBaseUrl;
  const partnerOnboardingUrl = extra.partnerOnboardingUrl;

  if (!appEnv || !apiBaseUrl || !partnerOnboardingUrl) {
    throw new Error(
      `app.config.ts is missing required extras: ${JSON.stringify({
        appEnv,
        apiBaseUrl,
        partnerOnboardingUrl,
      })}`,
    );
  }

  return { appEnv, apiBaseUrl, partnerOnboardingUrl };
}

export const config: AppConfig = readExtra();
