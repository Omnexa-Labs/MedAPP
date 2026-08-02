// Locks the DetailShell migration for AiAssistantScreen.
//
// Same contract as the ChatThreadScreen test, and for the same reason: this is
// the second of the two composer screens, so the keyboard is the thing a shell
// migration can silently break. The composer must stay inside the
// KeyboardAvoidingView, the app bar must stay outside it, and the shell must not
// claim the bottom inset (a static pad does not move when the keyboard rises).
//
// The status-bar assertion renders BOTH modes and asserts they differ — the only
// shape that fails on a re-frozen `style="dark"`, which in light mode looks right.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { screen, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { renderWithSafeArea as render } from "@/test/safe-area";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    canGoBack: () => true,
  },
}));

const mockScheme = { value: "light" as "light" | "dark" };

jest.mock("nativewind", () => ({
  useColorScheme: () => ({
    colorScheme: mockScheme.value,
    setColorScheme: jest.fn(),
  }),
}));

import { AiAssistantScreen } from "../AiAssistantScreen";

const SOURCE_PATH = join(__dirname, "..", "AiAssistantScreen.tsx");

function code(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

/** The chat canvas, not the quick-action chip row (which is also a ScrollView). */
function canvas() {
  return screen.UNSAFE_getAllByType(ScrollView)[0];
}

beforeEach(() => {
  mockBack.mockClear();
  mockScheme.value = "light";
});

describe("AiAssistantScreen — renders through DetailShell", () => {
  it("keeps the bar's title, avatar and action", () => {
    render(<AiAssistantScreen />);
    expect(screen.getByText("MedAI")).toBeTruthy();
    expect(screen.getByLabelText("Your profile")).toBeTruthy();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
  });

  it("routes the back button through the shell to router.back()", () => {
    render(<AiAssistantScreen />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("renders no bottom nav — a detail screen must not have one", () => {
    render(<AiAssistantScreen />);
    for (const label of ["Home", "Overview", "Inbox", "Community", "Lifestyle"]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    expect(code()).not.toMatch(/BottomNav/);
  });

  it("hand-rolls no wrapper of its own any more", () => {
    const src = code();
    expect(src).not.toMatch(/SafeAreaView/);
    expect(src).not.toMatch(/\bStatusBar\b/);
    expect(src).not.toMatch(/style="dark"/);
    expect(src).toMatch(/DetailShell/);
    expect(src).not.toMatch(/<DetailAppBar/);
  });
});

describe("AiAssistantScreen — status bar follows the scheme", () => {
  const statusBarStyle = () => {
    const bars = screen.UNSAFE_queryAllByType(StatusBar);
    expect(bars).toHaveLength(1);
    return bars[0].props.style;
  };

  it("produces a DIFFERENT style in the two modes — the frozen `dark` fails this", () => {
    mockScheme.value = "light";
    render(<AiAssistantScreen />);
    const light = statusBarStyle();
    expect(light).toBe("dark");
    screen.unmount();

    mockScheme.value = "dark";
    render(<AiAssistantScreen />);
    expect(statusBarStyle()).toBe("light");
    expect(statusBarStyle()).not.toBe(light);
  });
});

describe("AiAssistantScreen — the composer still clears the keyboard", () => {
  it("leaves the bottom inset to the screen, exactly as before the migration", () => {
    render(<AiAssistantScreen />);
    const areas = screen.UNSAFE_queryAllByType(SafeAreaView);
    expect(areas).toHaveLength(1);
    expect(areas[0].props.edges).toEqual(["top", "left", "right"]);
  });

  it("keeps the composer and the quick-action chips INSIDE the KeyboardAvoidingView", () => {
    render(<AiAssistantScreen />);
    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(kav.findAllByProps({ accessibilityLabel: "Message MedAI" }).length).toBeGreaterThan(0);
    expect(kav.findAllByProps({ accessibilityLabel: "Send message" }).length).toBeGreaterThan(0);
    expect(kav.findAllByType(ScrollView).length).toBeGreaterThan(0);
  });

  it("keeps the app bar OUTSIDE the KeyboardAvoidingView", () => {
    render(<AiAssistantScreen />);
    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(kav.findAllByProps({ accessibilityLabel: "Go back" })).toHaveLength(0);
    expect(kav.findAllByProps({ accessibilityLabel: "Notifications" })).toHaveLength(0);
  });

  it("preserves the KAV's own configuration verbatim — and adds no offset it never had", () => {
    render(<AiAssistantScreen />);
    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(kav.props.behavior).toBe(Platform.OS === "ios" ? "padding" : undefined);
    expect(kav.props.keyboardVerticalOffset).toBeUndefined();
  });

  it("keeps the scroll padding unchanged — no bottom nav reserve to drop", () => {
    render(<AiAssistantScreen />);
    expect(canvas().props.contentContainerStyle).toEqual({
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 16,
    });
  });
});

describe("AiAssistantScreen — behaviour is untouched", () => {
  it("still sends a typed message and still fires the quick actions", () => {
    jest.useFakeTimers();
    try {
      render(<AiAssistantScreen />);

      fireEvent.changeText(screen.getByLabelText("Message MedAI"), "My head still hurts");
      fireEvent.press(screen.getByLabelText("Send message"));
      expect(screen.getByText("My head still hurts")).toBeTruthy();

      fireEvent.press(screen.getByText("Check Vitals"));
      expect(screen.getAllByText("Check Vitals").length).toBeGreaterThan(1);

      act(() => {
        jest.advanceTimersByTime(900);
      });
      expect(screen.getAllByText(/Thanks for sharing that/).length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
