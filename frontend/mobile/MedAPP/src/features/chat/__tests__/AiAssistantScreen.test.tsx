// AiAssistantScreen — the screen with no model behind it.
//
// ---------------------------------------------------------------------------
// WHY THIS SUITE LOOKS NOTHING LIKE THE ONE IT REPLACES
// ---------------------------------------------------------------------------
// The previous version had ~30 cases and every one of them passed while the
// screen was returning ONE hardcoded 34-word reply to every question a patient
// could ask, under an "AI-generated" attribution, and asserting a Vitamin D lab
// result that this user had never had. The cases asserted layout — a bubble, a
// chip row, a 44px target — and a fabricated answer lays out exactly like a real
// one. Two of them actively locked the fabrication in place: one waited 900ms
// and asserted the canned reply arrived, another asserted the invented lab
// sentence named a roster clinician.
//
// There is no assistant endpoint and no `medical_chat_agent` client, so the
// screen no longer simulates one. What is left to test is therefore mostly
// ABSENCE — no answer, no canned reply, no composer, no invented finding — plus
// the one thing that is real: the escalation POSTs, and lands the user in a
// thread a clinician reads.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ScrollView } from "react-native";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    push: (...a: unknown[]) => mockPush(...a),
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

// `mock`-prefixed on purpose: babel hoists jest.mock above the const, and jest
// only permits a factory to close over a variable whose name starts with "mock".
const mockCreateThread = jest.fn();
jest.mock("../api", () => ({
  chatApi: { createThread: (...a: unknown[]) => mockCreateThread(...a) },
}));

import { AiAssistantScreen } from "../AiAssistantScreen";

const SOURCE_PATH = join(__dirname, "..", "AiAssistantScreen.tsx");

/** The header names the very strings these tests ban; prose must not fail them. */
function code(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const thread = (over: Record<string, unknown> = {}) => ({
  id: "t-9",
  subject: "Request to speak with a practitioner",
  source: "direct",
  status: "open",
  createdByUserId: "u-1",
  assignedRole: "doctor",
  assignedUserId: null,
  bookingId: null,
  lastMessageAtIso: null,
  ...over,
});

beforeEach(() => {
  mockBack.mockClear();
  mockPush.mockClear();
  mockScheme.value = "light";
  mockCreateThread.mockReset().mockResolvedValue(thread());
});

// ---------------------------------------------------------------------------
// The defect
// ---------------------------------------------------------------------------

describe("AiAssistantScreen — it does not pretend to be an assistant", () => {
  it("states plainly that MedAI is unavailable", () => {
    render(<AiAssistantScreen />);
    expect(screen.getByTestId("ai-unavailable-panel")).toBeTruthy();
    expect(screen.getByText(/MedAI isn't available yet/)).toBeTruthy();
  });

  it("has NO composer — there is nothing on the other end of one", () => {
    render(<AiAssistantScreen />);
    expect(screen.queryByLabelText("Message MedAI")).toBeNull();
    expect(screen.queryByLabelText("Send message")).toBeNull();
    expect(screen.queryByLabelText("Attach file")).toBeNull();
    expect(screen.queryByLabelText("Voice input")).toBeNull();
  });

  it("carries no canned reply and no fake thinking delay", () => {
    const src = code();
    // The 34 words every question used to return, and the 900ms it "thought"
    // for first. Asserted from source: a timer that never fires because the
    // composer is gone would still be a canned reply waiting for a caller.
    expect(src).not.toMatch(/CANNED_REPLY/);
    expect(src).not.toMatch(/Thanks for sharing that/);
    expect(src).not.toMatch(/REPLY_DELAY_MS/);
    expect(src).not.toMatch(/setTimeout/);
    render(<AiAssistantScreen />);
    expect(screen.queryByTestId("ai-thinking-turn")).toBeNull();
  });

  it("asserts NO lab result for this user", () => {
    // The worst line in the old seed: "Your lab report from yesterday shows
    // Vitamin D a little below the usual range." No lab endpoint was consulted;
    // the sentence came from a Figma frame and was rendered as this patient's
    // own result.
    render(<AiAssistantScreen />);
    expect(screen.queryByText(/Vitamin D/)).toBeNull();
    expect(code()).not.toMatch(/Vitamin D/);
    // …nor the rest of the invented consultation it opened.
    expect(screen.queryByText(/mild headache/i)).toBeNull();
    expect(code()).not.toMatch(/tension headache/);
  });

  it("attributes nothing as AI-generated, because nothing was generated", () => {
    render(<AiAssistantScreen />);
    expect(screen.queryByText(/AI-generated/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The exit
// ---------------------------------------------------------------------------

describe("AiAssistantScreen — the escalation is real", () => {
  it("POSTs a thread assigned to a clinician and opens it", async () => {
    render(<AiAssistantScreen />);

    fireEvent.press(screen.getByLabelText("Talk to a Practitioner"));

    await waitFor(() =>
      expect(mockCreateThread).toHaveBeenCalledWith({
        subject: "Request to speak with a practitioner",
        source: "direct",
        assignedRole: "doctor",
      }),
    );
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({ params: expect.objectContaining({ threadId: "t-9" }) }),
      ),
    );
  });

  it("says so when the escalation fails, instead of appearing to work", async () => {
    // This is the one failure on this screen that matters: the user has already
    // decided they want a person.
    mockCreateThread.mockRejectedValue(new Error("offline"));
    render(<AiAssistantScreen />);

    fireEvent.press(screen.getByLabelText("Talk to a Practitioner"));

    await waitFor(() => expect(screen.getByText(/Couldn't reach the care team/)).toBeTruthy());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does NOT call the handoff endpoint, which a patient token cannot use", () => {
    // `POST /v1/threads/handoff` is documented for exactly this and IS wrapped
    // in ./api.ts — but `create_handoff_thread` requires a service/admin
    // principal, so from the handset it is a guaranteed 403. Asserted so nobody
    // "fixes" the escalation onto it.
    expect(code()).not.toMatch(/chatApi\.handoff/);
  });

  it("offers no dead second CTA beside it", () => {
    // "Schedule a Consultation" shipped permanently `disabled` — which practitioner
    // it should pre-select is a product decision, not an inference.
    render(<AiAssistantScreen />);
    expect(screen.queryByLabelText("Schedule a Consultation")).toBeNull();
  });

  it("tells the user what to do if it is an emergency", () => {
    render(<AiAssistantScreen />);
    expect(screen.getByTestId("ai-emergency-callout")).toBeTruthy();
    expect(screen.getByText(/call your local emergency number now/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// What survives the frame reconciliation, because it is true either way
// ---------------------------------------------------------------------------

describe("AiAssistantScreen — the boundary statements are kept", () => {
  it("opens with the Assistant Identity Header (550:2708) and its boundary line", () => {
    render(<AiAssistantScreen />);
    expect(screen.getByTestId("assistant-identity-header")).toBeTruthy();
    expect(screen.getByText("AI health assistant · not a clinician")).toBeTruthy();
    // The comp's "AI Health Insight" card appears in no frame and named a
    // clinician who is in no roster.
    expect(screen.queryByText("AI Health Insight")).toBeNull();
    expect(code()).not.toMatch(/Dr\. Smith/);
    expect(code()).not.toMatch(/Dr\. Mensah/);
  });

  it("PINS the AI Disclosure Line (550:2971) outside the scroller", () => {
    render(<AiAssistantScreen />);
    expect(screen.getByTestId("ai-disclosure-line")).toBeTruthy();
    expect(screen.getByText(/MedAI is an AI assistant\./)).toBeTruthy();
    expect(
      screen.getByText(/not a diagnosis — for medical advice, talk to a practitioner/),
    ).toBeTruthy();
    // It must never become a property of a message: attached to one it scrolls
    // away, which is the defect pinning it fixed.
    expect(code()).not.toMatch(/disclaimer/);
    // Outside the scroll canvas, structurally.
    const canvas = screen.UNSAFE_getAllByType(ScrollView)[0];
    expect(canvas.findAllByProps({ testID: "ai-disclosure-line" })).toHaveLength(0);
  });
});

describe("AiAssistantScreen — renders through DetailShell", () => {
  it("keeps the bar's title, and NOTHING else — 550:2700 draws back + title", () => {
    render(<AiAssistantScreen />);
    // "MedAI" is on the bar AND in the identity header (550:2708).
    expect(screen.getAllByText("MedAI").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Your profile")).toBeNull();
    expect(screen.queryByLabelText("Notifications")).toBeNull();
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

  it("hand-rolls no wrapper of its own", () => {
    const src = code();
    expect(src).not.toMatch(/SafeAreaView/);
    expect(src).not.toMatch(/\bStatusBar\b/);
    expect(src).not.toMatch(/style="dark"/);
    expect(src).toMatch(/DetailShell/);
    expect(src).not.toMatch(/<DetailAppBar/);
  });

  it("claims the bottom inset again, now that no composer needs the keyboard", () => {
    render(<AiAssistantScreen />);
    const areas = screen.UNSAFE_queryAllByType(SafeAreaView);
    expect(areas).toHaveLength(1);
    expect(areas[0].props.edges).toEqual(["top", "left", "right", "bottom"]);
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

describe("AiAssistantScreen — BRAND compliance", () => {
  it("imports no icon library — the icon gate is the only file allowed to", () => {
    const src = code();
    expect(src).not.toMatch(/@expo\/vector-icons/);
    expect(src).not.toMatch(/MaterialIcons/);
  });

  it("carries no raw colour literals, including white", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\(/);
    expect(src).not.toMatch(/\btext-white\b/);
  });
});
