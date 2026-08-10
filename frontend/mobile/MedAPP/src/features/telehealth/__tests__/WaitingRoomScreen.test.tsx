import { Linking } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string | undefined> = {};

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: "patient-1", displayName: "Ama Boateng" } }),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { WaitingRoomScreen } from "../WaitingRoomScreen";

beforeEach(() => {
  mockBack.mockClear();
  mockReplace.mockClear();
  mockParams = {};
});

describe("WaitingRoomScreen", () => {
  it("renders the approved patient waiting state and real device controls", () => {
    render(<WaitingRoomScreen />);

    expect(screen.getByText("Waiting room")).toBeTruthy();
    expect(screen.getByText("Check your setup")).toBeTruthy();
    expect(screen.getByText("Dr. Julian Sterling")).toBeTruthy();
    expect(screen.getByLabelText("Waiting for provider")).toBeDisabled();
    expect(screen.getByLabelText("Device settings")).toBeTruthy();
  });

  it("confirms before leaving the waiting room", () => {
    render(<WaitingRoomScreen />);

    fireEvent.press(screen.getByLabelText("Leave waiting room"));
    expect(screen.getByText("Leave the waiting room?")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    fireEvent.press(screen.getAllByLabelText("Leave waiting room")[1]);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("toggles microphone and camera state", () => {
    render(<WaitingRoomScreen />);

    fireEvent.press(screen.getByLabelText("Mute microphone"));
    expect(screen.getByLabelText("Unmute microphone")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Turn camera off"));
    expect(screen.getByLabelText("Turn camera on")).toBeTruthy();
    expect(screen.getAllByText("Off")).toHaveLength(2);
  });

  it("joins only when the route reports the remote participant ready", () => {
    mockParams = {
      state: "ready",
      sessionId: "session-1",
      appointmentId: "appointment-1",
    };
    render(<WaitingRoomScreen />);

    expect(screen.getByText("Your provider is ready")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Join video visit"));

    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/(app)/telemedicine-consultation",
        params: expect.objectContaining({
          providerId: "julian-sterling",
          providerName: "Dr. Julian Sterling",
          patientName: "Ama Boateng",
          viewerRole: "patient",
        }),
      }),
    );
  });

  it("renders practitioner copy from the same canonical session", () => {
    mockParams = {
      viewerRole: "practitioner",
      patientId: "patient-1",
      patientName: "Ama Boateng",
    };
    render(<WaitingRoomScreen />);

    expect(screen.getByText("Waiting for Ama Boateng")).toBeTruthy();
    expect(screen.getByLabelText("Waiting for patient")).toBeDisabled();
  });

  it("exposes permission recovery through device settings", () => {
    mockParams = { state: "permissions-blocked" };
    const settings = jest.spyOn(Linking, "openSettings").mockResolvedValueOnce();
    render(<WaitingRoomScreen />);

    expect(screen.getByText("Allow device access")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Open settings"));
    expect(settings).toHaveBeenCalledTimes(1);
    settings.mockRestore();
  });

  it("renders an offline recovery state without exposing call controls", () => {
    mockParams = { state: "offline" };
    render(<WaitingRoomScreen />);

    expect(screen.getByText("Session unavailable")).toBeTruthy();
    expect(screen.queryByLabelText("Mute microphone")).toBeNull();
    fireEvent.press(screen.getAllByLabelText("Try again")[0]);
    expect(screen.getByText("Check your setup")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Colour-literal drift guard (dark-mode pass).
//
// WaitingRoomScreen was on the "does not flip" list, but the capture disagrees:
// dark-33 flips. It composes entirely from shell + ui + telehealth primitives
// and holds no colour of its own. This test is the thing that keeps that true —
// the screen is exactly one inline `color=` away from the failure mode every
// other screen in this batch had.
// ---------------------------------------------------------------------------
describe("WaitingRoomScreen — holds no colour of its own", () => {
  const source = require("node:fs")
    .readFileSync(require("node:path").join(__dirname, "..", "WaitingRoomScreen.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("contains no hex, no rgb()/rgba(), and no CSS colour word", () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgba?\s*\(/);
    expect(source).not.toMatch(/\b(white|black)\b/);
  });

  it("uses no Tailwind default palette class", () => {
    expect(source).not.toMatch(
      /\b(?:bg|text|border|fill|stroke)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    );
  });
});
