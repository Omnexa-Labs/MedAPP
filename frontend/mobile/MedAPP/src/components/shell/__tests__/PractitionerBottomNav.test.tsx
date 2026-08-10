// Locks the practitioner tab contract.
//
// Two things here are load-bearing and were previously got wrong in this
// codebase, which is why they are asserted rather than left to review:
//
//  1. the tab set is the PRACTITIONER one (Figma 381:628), not the patient one
//     — a screen that quietly renders Overview/Community/Lifestyle to a
//     practitioner is the bug this component exists to prevent;
//  2. tabs whose route does not exist must NOT navigate. Pushing an invented
//     path, or a patient screen, is worse than a no-op.

import { StyleSheet } from "react-native";
import { screen, fireEvent } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), canGoBack: () => true },
}));

import { PractitionerBottomNav } from "../PractitionerBottomNav";

// Visible labels. "Schedule" (not "Appointments") because the longer word
// truncated to "Appointmen..." at label-sm 12 in a ~75px tab, and BRAND forbids
// dropping below 12sp or 44pt to make it fit. The tab `key` is still
// "appointments" — that is the API, this is the copy.
const PRACTITIONER_TABS = ["Home", "Schedule", "Inbox", "Patients", "Profile"];
/** The patient set — none of these may ever appear in this component. */
const PATIENT_ONLY_TABS = ["Overview", "Community", "Lifestyle"];

describe("PractitionerBottomNav", () => {
  beforeEach(() => mockPush.mockClear());

  it("renders the practitioner tab set, in order, and no patient tabs", () => {
    render(<PractitionerBottomNav />);
    for (const label of PRACTITIONER_TABS) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    for (const label of PATIENT_ONLY_TABS) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it("marks only the active tab as selected", () => {
    render(<PractitionerBottomNav active="inbox" />);
    expect(screen.getByLabelText("Inbox").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("Home").props.accessibilityState.selected).toBe(false);
  });

  it("pushes the real route for tabs that have one", () => {
    render(<PractitionerBottomNav active="home" />);
    fireEvent.press(screen.getByLabelText("Schedule"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/appointments");
    fireEvent.press(screen.getByLabelText("Inbox"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/inbox");
  });

  it("routes ALL FIVE tabs — Home and Profile are no longer dead", () => {
    // Converted, not deleted. This used to assert Profile was unavailable, and
    // its sibling asserted the dimming. Both were correct while the destinations
    // did not exist; both had to fail the moment they did, which is what a
    // conditional treatment's test is FOR. See PRACTITIONER_TAB_HREFS.
    render(<PractitionerBottomNav active="inbox" />);

    for (const [label, href] of [
      ["Home", "/(app)/practitioner-home"],
      ["Schedule", "/(app)/appointments"],
      ["Patients", "/(app)/active-patient-roster-2"],
      ["Profile", "/(app)/practitioner-profile"],
    ] as const) {
      mockPush.mockClear();
      fireEvent.press(screen.getByLabelText(label));
      expect(mockPush).toHaveBeenCalledWith(href);
    }
  });

  it("leaves NO tab dimmed or disabled — the interim treatment is gone", () => {
    // The mirror of the test this replaces. Home and Profile once rendered at
    // 0.6 opacity with `disabled: true` and a "Not available yet" hint, because
    // they went nowhere. Now they go somewhere, so every trace must be gone —
    // a tab that still looks unavailable while working is the same lie in
    // reverse.
    render(<PractitionerBottomNav active="patients" />);

    for (const label of ["Home", "Schedule", "Inbox", "Patients", "Profile"]) {
      const tab = screen.getByLabelText(label);
      expect(tab.props.accessibilityState.disabled).toBeFalsy();
      expect(tab.props.accessibilityHint).not.toBe("Not available yet");
      const style = StyleSheet.flatten(tab.props.style) ?? {};
      expect(style.opacity ?? 1).toBe(1);
    }
  });

  it("no-ops on the already-active tab", () => {
    render(<PractitionerBottomNav active="inbox" />);
    fireEvent.press(screen.getByLabelText("Inbox"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("lets a screen intercept a tab press", () => {
    const onTabPress = jest.fn(() => true);
    render(<PractitionerBottomNav active="home" onTabPress={onTabPress} />);
    fireEvent.press(screen.getByLabelText("Schedule"));
    expect(onTabPress).toHaveBeenCalledWith("appointments");
    expect(mockPush).not.toHaveBeenCalled();
  });
});
