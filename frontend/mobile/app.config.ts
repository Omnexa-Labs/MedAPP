import { ExpoConfig, ConfigContext } from "expo/config";
import * as fs from "fs";
import * as path from "path";

type AppEnv = "dev" | "preview" | "prod";

const APP_ENV = (process.env.APP_ENV ?? "dev") as AppEnv;
const USE_MOCK_API = parseBool(process.env.USE_MOCK_API, APP_ENV === "dev");
const API_BASE_URL = process.env.API_BASE_URL ?? defaultApiBaseUrl(APP_ENV);
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? "REPLACE_WITH_EAS_PROJECT_ID";

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

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: NAME_BY_ENV[APP_ENV],
  slug: "medapp",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  scheme: "medapp",
  ...assetConfig(),
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_BY_ENV[APP_ENV],
  },
  android: {
    package: BUNDLE_BY_ENV[APP_ENV],
    ...adaptiveIconConfig(),
  },
  web: {
    bundler: "metro",
    ...faviconConfig(),
  },
  plugins: ["expo-secure-store"],
  extra: {
    eas: { projectId: EAS_PROJECT_ID },
    appEnv: APP_ENV,
    apiBaseUrl: API_BASE_URL,
    useMockApi: USE_MOCK_API,
  },
});

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return /^(1|true|yes)$/i.test(value);
}

// Per-platform defaults so devs don't have to override for the common case.
// - Android emulator reaches the host via 10.0.2.2.
// - iOS simulator and web can use localhost.
// - For a physical device, set API_BASE_URL to your LAN IP.
function defaultApiBaseUrl(appEnv: AppEnv): string {
  if (appEnv === "prod") return "https://api.medapp.dev";
  if (appEnv === "preview") return "https://preview-api.medapp.dev";
  if (process.env.EAS_BUILD === "true") return "http://10.0.2.2:8000";
  return process.platform === "darwin" ? "http://localhost:8000" : "http://10.0.2.2:8000";
}

// Only reference asset files that actually exist on disk. Expo falls back to
// its built-in defaults for any key we omit, which keeps `expo start` and EAS
// builds working before the design team ships artwork.
function assetConfig() {
  const out: Partial<ExpoConfig> = {};
  if (assetExists("icon.png")) out.icon = "./assets/icon.png";
  if (assetExists("splash.png")) {
    out.splash = {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    };
  }
  return out;
}

function adaptiveIconConfig() {
  if (!assetExists("adaptive-icon.png")) return {};
  return {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
  };
}

function faviconConfig() {
  if (!assetExists("favicon.png")) return {};
  return { favicon: "./assets/favicon.png" };
}

function assetExists(name: string): boolean {
  return fs.existsSync(path.join(__dirname, "assets", name));
}
