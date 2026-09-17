const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { checkApiUrl, checkFirebase, validateNativeBuild } = require("./check-native-build.cjs");

const projectId = "12345678-1234-4234-8234-123456789abc";
const firebase = (bundle = "com.amalitech.medapp.dev") =>
  JSON.stringify({
    project_info: { project_id: "synthetic-test", project_number: "123456789" },
    client: [
      {
        client_info: {
          android_client_info: { package_name: bundle },
          mobilesdk_app_id: "synthetic-app-id",
        },
        api_key: [{ current_key: "synthetic-client-key" }],
      },
    ],
  });
function fixture() {
  return {
    profile: "development",
    platform: "android",
    root: __dirname,
    env: {
      APP_ENV: "dev",
      EAS_PROJECT_ID: projectId,
      API_BASE_URL: "http://192.168.1.20:8000",
      ANDROID_GOOGLE_SERVICES_FILE: "synthetic.json",
    },
    config: {
      extra: { appEnv: "dev", eas: { projectId }, apiBaseUrl: "http://192.168.1.20:8000" },
      android: { package: "com.amalitech.medapp.dev", googleServicesFile: "synthetic.json" },
      ios: { bundleIdentifier: "com.amalitech.medapp.dev" },
      plugins: ["expo-notifications"],
    },
    readFile: () => firebase(),
  };
}

test("valid Android config passes without claiming delivery or credential verification", () => {
  const result = validateNativeBuild(fixture());
  assert.equal(result.ok, true);
  assert.match(result.notes.join(" "), /phone delivery remain unverified/);
  assert.match(result.notes.join(" "), /FCM v1 credentials/);
});

for (const url of [
  undefined,
  "not-a-url",
  "ftp://gateway.company.org",
  "http://localhost:8000",
  "http://127.2.3.4",
  "http://2130706433",
  "http://10.0.2.2:8000",
  "http://10.0.3.2",
  "http://[::1]",
  "http://[::ffff:127.0.0.1]",
  "http://0.0.0.0",
  "https://test.localhost.",
  "https://api.example.com",
  "https://gateway.invalid",
  "https://user:secret@gateway.company.org",
  "https://gateway.company.org?token=secret",
  "https://gateway.company.org#secret",
]) {
  test(`rejects unusable or credential-bearing phone API input: ${String(url)}`, () => {
    assert.equal(typeof checkApiUrl(url, "development"), "string");
  });
}

test("preview and production require HTTPS; development permits a LAN gateway", () => {
  assert.equal(checkApiUrl("http://192.168.1.20:8000", "development"), null);
  for (const profile of ["preview", "production"]) {
    assert.match(checkApiUrl("http://192.168.1.20:8000", profile), /HTTPS/);
    assert.equal(checkApiUrl("https://gateway.company.org/api", profile), null);
  }
});

test("missing setup reports all actionable requirements together", () => {
  const input = fixture();
  input.env = { APP_ENV: "dev" };
  assert.deepEqual(
    validateNativeBuild(input).errors.map((item) => item.code),
    ["eas_project", "api_url", "firebase_file"],
  );
});

test("rejects drift between selected profile, native package and resolved config", () => {
  const input = fixture();
  input.config.extra.appEnv = "prod";
  input.config.android.package = "com.amalitech.medapp";
  input.config.extra.apiBaseUrl = "https://unexpected.company.org";
  input.config.extra.eas.projectId = "87654321-1234-4234-8234-123456789abc";
  input.config.plugins = [];
  const codes = validateNativeBuild(input).errors.map((item) => item.code);
  for (const code of [
    "app_env",
    "app_identifier",
    "api_config",
    "eas_project",
    "notifications_plugin",
    "firebase_config",
  ])
    assert.ok(codes.includes(code));
});

test("rejects invalid project IDs even when env and app config agree", () => {
  for (const project of ["", "00000000-0000-0000-0000-000000000000", "not-a-project"]) {
    const input = fixture();
    input.env.EAS_PROJECT_ID = project;
    input.config.extra.eas.projectId = project;
    assert.ok(validateNativeBuild(input).errors.some((item) => item.code === "eas_project"));
  }
});

test("rejects the wrong Firebase app variant, malformed and incomplete config", () => {
  assert.match(
    checkFirebase(firebase("com.amalitech.medapp"), "com.amalitech.medapp.dev"),
    /does not match/,
  );
  assert.match(checkFirebase("broken", "com.amalitech.medapp.dev"), /valid Firebase client JSON/);
  assert.match(checkFirebase("null", "com.amalitech.medapp.dev"), /configuration object/);
  const incomplete = JSON.parse(firebase());
  delete incomplete.project_info;
  assert.match(checkFirebase(JSON.stringify(incomplete), "com.amalitech.medapp.dev"), /incomplete/);
});

test("private service account JSON is rejected without reflecting its contents", () => {
  const input = fixture();
  input.readFile = () =>
    JSON.stringify({ type: "service_account", private_key: "DO-NOT-PRINT-KEY" });
  const report = validateNativeBuild(input);
  assert.match(report.errors[0].message, /private service account/);
  assert.equal(JSON.stringify(report).includes("DO-NOT-PRINT"), false);
});

test("file errors cannot leak sensitive paths or exception text", () => {
  const input = fixture();
  input.env.ANDROID_GOOGLE_SERVICES_FILE = input.config.android.googleServicesFile =
    "DO-NOT-PRINT-PATH";
  input.readFile = () => {
    throw new Error("DO-NOT-PRINT-EXCEPTION");
  };
  const report = validateNativeBuild(input);
  assert.equal(report.errors[0].code, "firebase_read");
  assert.equal(JSON.stringify(report).includes("DO-NOT-PRINT"), false);
});

test("iOS checks do not read Android files or pretend to verify APNs", () => {
  const input = fixture();
  input.platform = "ios";
  input.readFile = () => {
    assert.fail("Android file was read for iOS");
  };
  const result = validateNativeBuild(input);
  assert.equal(result.ok, true);
  assert.match(result.notes.join(" "), /APNs credentials/);
});

test("CLI rejects bad arguments with a nonzero, redacted JSON result", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "check-native-build.cjs"), "--json", "--profile", "DO-NOT-PRINT"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
  assert.equal(`${result.stdout}${result.stderr}`.includes("DO-NOT-PRINT"), false);
});

test("CLI resolves real Expo config for each EAS variant, with synthetic local inputs", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "medapp-build-check-"));
  const file = path.join(folder, "google-services.json");
  try {
    for (const [profile, suffix] of [
      ["development", ".dev"],
      ["preview", ".preview"],
      ["production", ""],
    ]) {
      fs.writeFileSync(file, firebase(`com.amalitech.medapp${suffix}`));
      const env = {
        ...process.env,
        EXPO_NO_DOTENV: "1",
        EAS_BUILD: "false",
        APP_ENV: "dev",
        EAS_PROJECT_ID: projectId,
        API_BASE_URL: "https://gateway.company.org",
        ANDROID_GOOGLE_SERVICES_FILE: file,
      };
      const result = spawnSync(
        process.execPath,
        [
          path.join(__dirname, "check-native-build.cjs"),
          "--json",
          "--profile",
          profile,
          "--platform",
          "android",
        ],
        { encoding: "utf8", env },
      );
      const report = JSON.parse(result.stdout);
      assert.equal(result.status, 0, JSON.stringify(report));
      assert.equal(report.profile, profile);
      assert.equal(report.ok, true);
    }
  } finally {
    // Delete only this test's explicitly created file and empty temporary directory.
    fs.unlinkSync(file);
    fs.rmdirSync(folder);
  }
});
