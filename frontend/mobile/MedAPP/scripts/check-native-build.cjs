// Configuration-only check: never contacts providers, launches an app or prints values.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { parseArgs } = require("node:util");

const profiles = {
  development: { appEnv: "dev", bundle: "com.amalitech.medapp.dev" },
  preview: { appEnv: "preview", bundle: "com.amalitech.medapp.preview" },
  production: { appEnv: "prod", bundle: "com.amalitech.medapp" },
};
const projectIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function checkApiUrl(value, profile) {
  if (!value?.trim())
    return "Set API_BASE_URL explicitly for the phone; emulator defaults are not used for this check.";
  let url;
  try {
    url = new URL(value);
  } catch {
    return "API_BASE_URL must be a valid absolute HTTP(S) URL.";
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return "API_BASE_URL must use HTTP(S) without embedded credentials, query parameters or a fragment.";
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^127\./.test(host) ||
    ["0.0.0.0", "10.0.2.2", "10.0.3.2", "[::]", "[::1]"].includes(host) ||
    host.startsWith("[::ffff:")
  ) {
    return "API_BASE_URL points to a loopback/emulator address. Use a gateway address reachable from the phone.";
  }
  if (/(^|\.)(example\.(com|org|net)|invalid|test)$/.test(host)) {
    return "Replace the placeholder API_BASE_URL with the intended gateway address.";
  }
  if (profile !== "development" && url.protocol !== "https:") {
    return "Preview and production builds require an HTTPS API_BASE_URL.";
  }
  return null;
}

function checkFirebase(contents, bundle) {
  let data;
  try {
    data = JSON.parse(contents);
  } catch {
    return "ANDROID_GOOGLE_SERVICES_FILE must contain valid Firebase client JSON.";
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "ANDROID_GOOGLE_SERVICES_FILE must contain a Firebase client configuration object.";
  }
  if (data.private_key || data.type === "service_account") {
    return "A private service account key cannot be bundled. Use the Firebase Android client google-services.json; store the FCM v1 key in EAS credentials.";
  }
  const client = Array.isArray(data.client)
    ? data.client.find((item) => item?.client_info?.android_client_info?.package_name === bundle)
    : undefined;
  if (!client)
    return "Firebase client configuration does not match the selected Android package. Download the file for this build variant.";
  if (
    !/^\d+$/.test(String(data.project_info?.project_number ?? "")) ||
    !data.project_info?.project_id ||
    !client.client_info?.mobilesdk_app_id ||
    !Array.isArray(client.api_key) ||
    !client.api_key.some((key) => typeof key?.current_key === "string" && key.current_key.trim())
  ) {
    return "Firebase client configuration is incomplete; download a fresh google-services.json from the intended Firebase project.";
  }
  return null;
}

function validateNativeBuild({ profile, platform, env, config, readFile = fs.readFileSync, root }) {
  const errors = [];
  const notes = [];
  const add = (code, message) => errors.push({ code, message });
  if (!Object.hasOwn(profiles, profile) || !["android", "ios"].includes(platform)) {
    add("target", "Choose development, preview or production, and android or ios.");
    return { ok: false, errors, notes };
  }
  const expected = profiles[profile];
  if (config.extra?.appEnv !== expected.appEnv || env.APP_ENV !== expected.appEnv) {
    add("app_env", "APP_ENV does not match the selected EAS build profile.");
  }
  const bundle = platform === "android" ? config.android?.package : config.ios?.bundleIdentifier;
  if (bundle !== expected.bundle)
    add(
      "app_identifier",
      "The native application identifier does not match the selected build profile.",
    );
  if (
    !projectIdPattern.test(env.EAS_PROJECT_ID ?? "") ||
    config.extra?.eas?.projectId !== env.EAS_PROJECT_ID
  ) {
    add(
      "eas_project",
      "Set EAS_PROJECT_ID to the intended Expo project's public UUID; config and environment must agree.",
    );
  }
  const apiError = checkApiUrl(env.API_BASE_URL, profile);
  if (apiError) add("api_url", apiError);
  if (env.API_BASE_URL && config.extra?.apiBaseUrl !== env.API_BASE_URL) {
    add("api_config", "The resolved API URL does not match API_BASE_URL.");
  }
  if (
    !config.plugins?.some(
      (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === "expo-notifications",
    )
  ) {
    add(
      "notifications_plugin",
      "Add expo-notifications to the native config plugins before rebuilding.",
    );
  }
  if (platform === "android") {
    const file = env.ANDROID_GOOGLE_SERVICES_FILE;
    if (!file?.trim() || config.android?.googleServicesFile !== file) {
      add(
        "firebase_file",
        "Set ANDROID_GOOGLE_SERVICES_FILE to this variant's local Firebase client JSON or an EAS file variable.",
      );
    } else {
      try {
        const firebaseError = checkFirebase(readFile(path.resolve(root, file), "utf8"), bundle);
        if (firebaseError) add("firebase_config", firebaseError);
      } catch {
        // File paths and parser errors can contain credentials. Report neither.
        add(
          "firebase_read",
          "Firebase client configuration could not be read. Check the local file or EAS file variable.",
        );
      }
    }
    notes.push(
      "FCM v1 credentials, Firebase API restrictions and Android signing must be verified in the intended EAS/Firebase project.",
    );
  } else {
    notes.push(
      "APNs credentials, Apple signing and registered test devices must be verified in the intended EAS/Apple project.",
    );
  }
  if (profile === "development" && env.API_BASE_URL?.startsWith("http:")) {
    notes.push(
      "HTTP is allowed for isolated development only. Use synthetic test accounts and a trusted test network.",
    );
  }
  notes.push(
    "This checks local configuration only: project ownership, gateway reachability, PostgreSQL migrations, worker health and phone delivery remain unverified.",
  );
  return { ok: errors.length === 0, profile, platform, errors, notes };
}

function run(args = process.argv.slice(2)) {
  let json = args.includes("--json");
  let report;
  try {
    const { values } = parseArgs({
      args,
      options: {
        profile: { type: "string", default: process.env.EAS_BUILD_PROFILE || "development" },
        platform: { type: "string", default: process.env.EAS_BUILD_PLATFORM || "android" },
        json: { type: "boolean", default: false },
      },
    });
    json = values.json;
    if (!Object.hasOwn(profiles, values.profile) || !["android", "ios"].includes(values.platform)) {
      throw new Error("target");
    }
    const root = path.resolve(__dirname, "..");
    const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
    const selected = eas.build?.[values.profile];
    if (
      selected?.env?.APP_ENV !== profiles[values.profile].appEnv ||
      selected?.environment !== values.profile
    ) {
      throw new Error("profile");
    }
    // Resolve Expo's own dotenv loader from Expo's dependency tree. No global CLI needed.
    const expoRequire = createRequire(require.resolve("expo/package.json"));
    expoRequire("@expo/env").load(root, { silent: true });
    // Mirror EAS profile precedence locally; on the build server verify what EAS supplied.
    if (process.env.EAS_BUILD !== "true") process.env.APP_ENV = selected.env.APP_ENV;
    const { exp } = require("expo/config").getConfig(root);
    report = validateNativeBuild({
      profile: values.profile,
      platform: values.platform,
      env: process.env,
      config: exp,
      root,
    });
  } catch {
    // Never echo an exception, env value or file content into a shared build log.
    report = {
      ok: false,
      errors: [
        {
          code: "config_load",
          message:
            "Could not resolve build configuration. Check arguments, installed lockfile dependencies, eas.json and app.config.ts. Supported profiles: development, preview, production; platforms: android, ios.",
        },
      ],
      notes: [],
    };
  }
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(
      report.ok
        ? "Native build configuration checks passed."
        : "Native build configuration needs attention.",
    );
    for (const item of report.errors) console.log(`FAIL [${item.code}] ${item.message}`);
    for (const note of report.notes) console.log(`NOTE ${note}`);
  }
  return report.ok ? 0 : 1;
}

module.exports = { checkApiUrl, checkFirebase, validateNativeBuild, run };
if (require.main === module) process.exitCode = run();
