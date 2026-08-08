/**
 * Jest config for Expo SDK 55.
 * Preset handles RN, JSX, and most transforms. transformIgnorePatterns is
 * widened so common ESM packages get transformed too.
 *
 * Do not add `react-test-renderer` as a DIRECT dependency: rendering goes
 * through @testing-library/react-native v13, which uses RN's own internal
 * renderer, and a second renderer in the tree is how you get two Reacts.
 *
 * It IS present in node_modules regardless, as a declared dependency of
 * `jest-expo` (55.0.20 -> react-test-renderer 19.2.0). That is expected, not a
 * stray install — an earlier version of this note said it "doesn't support
 * React 19", which stopped being true at 19.x and has since been read as
 * evidence of a mistake more than once. It peers on react ^19.2.0, which is
 * what package.json pins.
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
