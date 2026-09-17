import type { ConfigContext, ExpoConfig } from "expo/config";

// Per-environment config for MedApp mobile.
//
// Set APP_ENV=dev|preview|prod when running expo/eas. Defaults to "dev" locally.
// API_BASE_URL and PARTNER_ONBOARDING_URL can be overridden via env vars; the
// per-env defaults below cover the common case so devs don't need a .env file
// for the happy path.

type AppEnv = "dev" | "preview" | "prod";

const requestedEnv = process.env.APP_ENV ?? "dev";
if (!["dev", "preview", "prod"].includes(requestedEnv)) {
  throw new Error("APP_ENV must be dev, preview or prod.");
}
const APP_ENV = requestedEnv as AppEnv;

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
  if (env === "prod") return "https://partners.medapp.dev";
  if (env === "preview") return "https://preview-partners.medapp.dev";
  return process.platform === "darwin" ? "http://localhost:3003" : "http://10.0.2.2:3003";
}

const API_BASE_URL = process.env.API_BASE_URL ?? defaultApiBaseUrl(APP_ENV);
const PARTNER_ONBOARDING_URL =
  process.env.PARTNER_ONBOARDING_URL ?? defaultPartnerOnboardingUrl(APP_ENV);
const HMS_WEB_URL =
  process.env.HMS_WEB_URL ??
  (APP_ENV === "dev"
    ? process.platform === "darwin"
      ? "http://localhost:3001"
      : "http://10.0.2.2:3001"
    : "");
const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID ?? "";
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID ?? "";
const APPLE_SIGN_IN_ENABLED = process.env.APPLE_SIGN_IN_ENABLED === "true";
const GOOGLE_READY = !!(GOOGLE_WEB_CLIENT_ID && GOOGLE_IOS_CLIENT_ID);

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
    usesAppleSignIn: APPLE_SIGN_IN_ENABLED,
    icon: "./assets/expo.icon",
  },
  android: {
    ...(process.env.ANDROID_GOOGLE_SERVICES_FILE
      ? { googleServicesFile: process.env.ANDROID_GOOGLE_SERVICES_FILE }
      : {}),
    package: BUNDLE_BY_ENV[APP_ENV],
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    // Reported from the device: "when a bottom input like the chat input is
    // active the keyboard overlays it" — on EVERY screen with a bottom-anchored
    // input, not one, which is what rules out any individual composer.
    //
    // This maps to `android:windowSoftInputMode` in the generated manifest.
    // Thirteen files already use `KeyboardAvoidingView`, so the screens ARE
    // trying to get out of the keyboard's way; under SDK 55's default Android
    // edge-to-edge the window is no longer resized when the keyboard opens, so a
    // `behavior="padding"` KAV has nothing to react to and the input stays put.
    //
    // "resize" asks Android for the old behaviour back. FLAGGED as unproven: on
    // Android 15 with edge-to-edge this is known to be unreliable, and the
    // current recommended fix is `react-native-keyboard-controller`, which reads
    // the IME inset directly. Trying the one-line change first because it is
    // cheap and reversible, and because a new dependency plus rewriting thirteen
    // call sites is not something to do on a guess.
    //
    // NOT TESTABLE IN EXPO GO. This is native configuration: Expo Go runs its own
    // AndroidManifest, so the setting only takes effect in a development build.
    softwareKeyboardLayoutMode: "resize",
    // "Add to Calendar" on the booking confirmation (expo-calendar, SDK 55).
    // Declared here rather than in a raw AndroidManifest so the string lives in
    // version control. READ is required alongside WRITE because the flow has to
    // enumerate calendars to find a writable one — Android has no notion of a
    // default calendar the way iOS does.
    permissions: ["android.permission.READ_CALENDAR", "android.permission.WRITE_CALENDAR"],
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-notifications",
    "expo-router",
    ...(APPLE_SIGN_IN_ENABLED ? ["expo-apple-authentication"] : []),
    ...(GOOGLE_READY
      ? [
          [
            "react-native-nitro-google-signin",
            {
              iosUrlScheme: GOOGLE_IOS_CLIENT_ID.split(".").reverse().join("."),
            },
          ] as [string, Record<string, string>],
        ]
      : []),
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
    [
      "expo-secure-store",
      { faceIDPermission: "Allow MedApp to use Face ID to protect your sign-in on this device." },
    ],
    // Voice input in the AI assistant / chat composer. The permission STRING is
    // the point of registering the plugin: iOS refuses to prompt for the mic
    // without NSMicrophoneUsageDescription, and a health app asking for a
    // microphone with no stated reason is the kind of prompt users decline.
    // Android's RECORD_AUDIO is merged in by the package itself.
    [
      "expo-audio",
      {
        microphonePermission:
          "MedApp uses the microphone only while you hold the mic button to dictate a message.",
      },
    ],
    // Sharing and saving records (prescriptions, medication lists, reports).
    "expo-sharing",
    // Prescription label capture in the "Add medication" flow (SDK 55
    // `CameraView`). The permission STRING is the reason this is registered as a
    // plugin rather than left to the package default: iOS will not prompt without
    // NSCameraUsageDescription, and the default copy ("Allow MedApp to access
    // your camera") states no purpose — on a health app that is the prompt users
    // decline.
    //
    // Both optional native features are turned OFF deliberately:
    //
    //   recordAudioAndroid  The flow captures STILLS only. Left at its `true`
    //                       default this adds RECORD_AUDIO to the Android
    //                       manifest, so the app would request the microphone
    //                       twice for two unrelated reasons — and app.config's
    //                       expo-audio note already sets the standard here: "a
    //                       health app asking for a microphone with no stated
    //                       reason is the kind of prompt users decline."
    //   barcodeScannerEnabled  Nothing calls `onBarcodeScanned`. A prescription
    //                       label is read as text, not as a barcode, so this
    //                       would ship a native scanning module no code uses.
    //
    // NOT TESTABLE IN EXPO GO — this is a native module, and Expo Go bundles its
    // own set. Verifying the viewfinder needs a development build, the same
    // caveat already recorded for softwareKeyboardLayoutMode above.
    [
      "expo-camera",
      {
        cameraPermission:
          "MedApp uses the camera only when you choose to photograph a prescription label, so the details can be filled in for you.",
        recordAudioAndroid: false,
        barcodeScannerEnabled: false,
      },
    ],
    // Biometric sign-in. iOS requires NSFaceIDUsageDescription before
    // FaceID can be prompted; the config plugin sets it so the string
    // lives in version control rather than in raw Info.plist. Android
    // needs no extra config — USE_BIOMETRIC + USE_FINGERPRINT are
    // added automatically by the package's AndroidManifest merge.
    [
      "expo-local-authentication",
      {
        faceIDPermission: "Allow MedApp to use FaceID to sign you in.",
      },
    ],
    // "Add to Calendar" on BookingConfirmedScreen. The plugin writes iOS's
    // NSCalendarsUsageDescription (and, on the SDK 55 line, the write-only
    // variant) from `calendarPermission`, so the copy is reviewable here rather
    // than buried in a generated Info.plist. Reminders are NOT requested — the
    // app writes events only, and asking for a scope you never use is how an
    // App Review rejection happens.
    [
      "expo-calendar",
      {
        calendarPermission: "Allow MedApp to add your confirmed appointments to your calendar.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
    googleWebClientId: GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: GOOGLE_IOS_CLIENT_ID,
    appleSignInEnabled: APPLE_SIGN_IN_ENABLED,
    appEnv: APP_ENV,
    apiBaseUrl: API_BASE_URL,
    partnerOnboardingUrl: PARTNER_ONBOARDING_URL,
    hospitalPortalUrl: HMS_WEB_URL,
  },
});
