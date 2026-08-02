// Global Jest setup (registered via setupFilesAfterEnv in jest.config.js).
//
// AsyncStorage talks to a native module that doesn't exist under Jest. It's
// reached from src/lib/theme.ts (the appearance store), which the components/ui
// barrel pulls in via Logo — so without this mock, *any* test importing a UI
// primitive fails. Using the package's own official mock rather than a hand-
// rolled stub keeps the API surface honest.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
