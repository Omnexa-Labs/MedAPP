import type { ConfigContext, ExpoConfig } from "expo/config";

// Per-environment config for MedApp mobile.
//
// Set APP_ENV=dev|preview|prod when running expo/eas. Defaults to "dev" locally.
// API_BASE_URL and PARTNER_ONBOARDING_URL can be overridden via env vars; the
// per-env defaults below cover the common case so devs don't need a .env file
// for the happy path.

type AppEnv = "dev" | "preview" | "prod";

const APP_ENV = (process.env.APP_ENV ?? "dev") as AppEnv;

const NAME_BY_ENV: Record<AppEnv, string> = {
  dev: "MedApp (Dev)",
  preview: "MedApp (Preview)",
  prod: "MedApp",
};

const BUNDLE_BY_ENV: Record<AppEnv, string> = {
  dev: "com.amalitech.medapp.dev",
  preview: "com.amalitech.medapp.preview",
  prod: "com.amalitech.medapp",
};

// Android emulator reaches the host at 10.0.2.2; iOS simulator at localhost.
// Physical devices need an explicit API_BASE_URL via env var.
function defaultApiBaseUrl(env: AppEnv): string {
  if (env === "prod") return "https://api.medapp.dev";
  if (env === "preview") return "https://preview-api.medapp.dev";
  if (process.env.EAS_BUILD === "true") return "http://10.0.2.2:8000";
  return process.platform === "darwin" ? "http://localhost:8000" : "http://10.0.2.2:8000";
}

function defaultPartnerOnboardingUrl(env: AppEnv): string {
  if (env === "prod") return "https://partners.medapp.dev/onboarding";
  if (env === "preview") return "https://preview-partners.medapp.dev/onboarding";
  return "http://localhost:3000/onboarding";
}

const API_BASE_URL = process.env.API_BASE_URL ?? defaultApiBaseUrl(APP_ENV);
const PARTNER_ONBOARDING_URL =
  process.env.PARTNER_ONBOARDING_URL ?? defaultPartnerOnboardingUrl(APP_ENV);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: NAME_BY_ENV[APP_ENV],
  slug: "MedAPP",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "medapp",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: BUNDLE_BY_ENV[APP_ENV],
    icon: "./assets/expo.icon",
  },
  android: {
    package: BUNDLE_BY_ENV[APP_ENV],
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        android: {
          image: "./assets/images/splash-icon.png",
          imageWidth: 76,
        },
      },
    ],
    "expo-font",
    "expo-secure-store",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    appEnv: APP_ENV,
    apiBaseUrl: API_BASE_URL,
    partnerOnboardingUrl: PARTNER_ONBOARDING_URL,
  },
});
