/**
 * Jest config for Expo SDK 55.
 * Preset handles RN, JSX, and most transforms. transformIgnorePatterns is
 * widened so common ESM packages get transformed too.
 *
 * RNTL v13 requires react-test-renderer to match React exactly. Pin both at
 * 19.2.0 so a fresh install cannot select a newer, incompatible renderer.
 * jest-expo uses the same renderer version, allowing npm to deduplicate it.
 * https://oss.callstack.com/react-native-testing-library/13.x/docs/start/quick-start
 */
module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind))",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // Jest doesn't run Metro's SVG transformer, so icon .svg imports (Health
    // Icons) are stubbed with a plain component. Tests assert behaviour and
    // labels, not glyph geometry.
    "\\.svg$": "<rootDir>/src/test/svg-mock.tsx",
  },
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}", "<rootDir>/src/**/__tests__/**/*.{ts,tsx}"],
  // src/test holds mocks/setup, not specs — don't treat them as test suites.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/src/test/"],
};
