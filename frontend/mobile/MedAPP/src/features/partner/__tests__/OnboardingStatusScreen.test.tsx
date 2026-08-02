// Regression guard for frame 72:117.
//
// The reason this file exists: the shipped build drifted behind the approved
// frame and nobody noticed until it was reviewed by eye — no app bar back
// button, no bell, no bottom nav. Those are structural facts a render test can
// hold, so it now holds them.
//
// It also pins the behaviour that must survive an appearance rebuild: the
// stepper is driven by `partner.status` (not pinned to the frame's mock), the
// completion counter is derived from the task list, and every task row stays an
// accessible no-op rather than a silent dead end.
//
// `use-current-user` is mocked rather than the zustand store being seeded:
// importing `@/store/auth-store` pulls in `@/lib/api/client` -> `@/lib/config`,
// which throws unless app.config.ts extras are present. The screen's only data
// dependency is this hook, so mocking it keeps the test about the screen.

import { screen } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import type { PartnerStatus, User } from "@/types/user";

const mockUser: { current: User | null } = { current: null };

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));

jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => mockUser.current,
}));

import { OnboardingStatusScreen } from "../OnboardingStatusScreen";

function signIn(status: PartnerStatus, displayName = "Dr. Adjei") {
  mockUser.current = {
    id: "u1",
    email: "adjei@example.com",
    displayName,
    partner: { kind: "practitioner", status, appliedAt: "2026-07-24T09:00:00.000Z" },
    createdAt: "2026-07-01T00:00:00.000Z",
  };
}

describe("OnboardingStatusScreen", () => {
  afterEach(() => {
    mockUser.current = null;
  });

  it("wears the practitioner shell: back button, bell, and the five practitioner tabs", () => {
    signIn("pending");
    render(<OnboardingStatusScreen />);

    expect(screen.getByLabelText("Go back")).toBeTruthy();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    // "Schedule" is the Appointments tab's visible label — the longer word
    // truncated on device and BRAND forbids shrinking type or the target to fit.
    for (const tab of ["Home", "Schedule", "Inbox", "Patients", "Profile"]) {
      expect(screen.getByLabelText(tab)).toBeTruthy();
    }
    // Home is the frame's Active=Home instance.
    expect(screen.getByLabelText("Home").props.accessibilityState.selected).toBe(true);
    // The patient tab set must never appear on a practitioner screen.
    for (const tab of ["Overview", "Community", "Lifestyle"]) {
      expect(screen.queryByLabelText(tab)).toBeNull();
    }
  });

  it("renders the hero art caption that replaced the placeholder illustration", () => {
    signIn("pending");
    render(<OnboardingStatusScreen />);
    expect(screen.getByText("Secure credential review in progress")).toBeTruthy();
  });

  it("drives the stepper from partner.status rather than the frame's mock", () => {
    signIn("pending");
    render(<OnboardingStatusScreen />);
    // pending -> step 1 active, so the ETA chip is present and step 0 is done.
    expect(screen.getByText("ETA: 1-2 business days")).toBeTruthy();
    expect(screen.getByLabelText("Complete")).toBeTruthy();
    expect(screen.getByLabelText("In progress")).toBeTruthy();
    expect(screen.getByLabelText("Not started")).toBeTruthy();
    expect(screen.getByText("Submitted Jul 24, 2026")).toBeTruthy();
  });

  it("renders the approved state the frame does not draw", () => {
    signIn("approved", "Dr. Mensah");
    render(<OnboardingStatusScreen />);
    expect(screen.getByText("Application Approved")).toBeTruthy();
    expect(screen.getByText("You're verified, Dr. Mensah")).toBeTruthy();
    expect(screen.queryByText("ETA: 1-2 business days")).toBeNull();
  });

  it("falls back to the frame's mock name when the session has none", () => {
    render(<OnboardingStatusScreen />);
    expect(screen.getByText("You're on your way, Dr. Adjei")).toBeTruthy();
  });

  it("derives the completion counter from the task list", () => {
    signIn("pending");
    render(<OnboardingStatusScreen />);
    expect(screen.getByText("0/3 Completed")).toBeTruthy();
  });

  it("keeps every unrouted task row an accessible no-op", () => {
    signIn("pending");
    render(<OnboardingStatusScreen />);
    const row = screen.getByLabelText(
      "Add Clinic Photos. Upload photos to help patients recognize your clinic.",
    );
    expect(row.props.accessibilityHint).toBe("Not available yet");
  });
});
