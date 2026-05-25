/**
 * Jest config for Expo SDK 55.
 * Preset handles RN, JSX, and most transforms. transformIgnorePatterns is
 * widened so common ESM packages get transformed too.
 *
 * Note: do NOT install `react-test-renderer` — it doesn't support React 19.
 * @testing-library/react-native v13 uses RN's internal renderer.
 */
module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind))",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}", "<rootDir>/src/**/__tests__/**/*.{ts,tsx}"],
};
