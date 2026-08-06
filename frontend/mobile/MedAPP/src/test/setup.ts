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

// ---------------------------------------------------------------------------
// react-native-reanimated
// ---------------------------------------------------------------------------
// `KeyboardInset` (src/components/ui/KeyboardInset.tsx) uses
// `useAnimatedKeyboard`, and it is exported from the `@/components/ui` barrel —
// so importing ANY ui component now pulls reanimated into the module graph.
// Without this, every one of those suites dies before a single assertion with:
//
//   WorkletsError: [Worklets] Native part of Worklets doesn't seem to be
//   initialized.
//
// Reanimated's worklets runtime is native and has no business running under
// Jest. Mocked at the module boundary, like every other native module in this
// suite.
//
// `height: { value: 0 }` is the closed keyboard, which is the correct default:
// a test that has not opened a keyboard must see the layout as it is at rest.
// A test that needs an open keyboard overrides this mock locally.
jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    useAnimatedKeyboard: () => ({ height: { value: 0 }, state: { value: 0 } }),
    // The real hook runs its worklet on the UI thread and returns a style. Here
    // it just evaluates the callback, so a test still sees the computed padding.
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (initial: unknown) => ({ value: initial }),
  };
});
