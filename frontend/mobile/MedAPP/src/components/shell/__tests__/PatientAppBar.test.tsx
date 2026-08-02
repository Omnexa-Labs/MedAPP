// Locks the patient app bar's behaviour (Figma set 741:887,
// `Back=Hidden | Shown`).
//
// Three of these assert defects the codebase has actually shipped:
//
//  - the avatar must fall back to a glyph, not a bare tinted circle
//    (docs/BRAND.md: "an empty coloured circle reads as a broken image");
//  - the badge must be ABSENT at 0 / undefined rather than showing a fabricated
//    count, since nothing models notifications yet;
//  - the bar must not centre the logo or drop the avatar — that is the
//    PRACTITIONER layout, and the two bars are mirror images.
//
// The back-affordance block at the bottom locks the two things that make this
// axis different from the practitioner one: the INVERTED default, and the
// absence of a spacer when back is hidden.

import { screen, fireEvent } from "@testing-library/react-native";
// The only place a test may import an icon library: asserting WHICH glyph the
// avatar fell back to is the point of the silhouette test.
import { MaterialIcons } from "@expo/vector-icons";
import { renderWithSafeArea as render } from "@/test/safe-area";

// `mock`-prefixed so Jest's out-of-scope-variable guard allows the factory to
// close over them (see the babel-plugin-jest-hoist rule). Same shape as
// PractitionerAppBar.test.
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockNav = { canGoBack: true };

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: () => mockNav.canGoBack,
  },
}));

import { PatientAppBar } from "../PatientAppBar";

/**
 * The accessible names inside the bar's LEADING group, in order. Everything the
 * group can contain is named (the back button and the logo), so an empty spacer
 * would be the one thing this can't see — which is why the assertion is on the
 * exact list rather than on a count.
 */
// `findAll`'s predicate is not contextually typed here (react-test-renderer's
// ReactTestInstance does not flow through), so the shape is stated locally
// rather than reached for with `any`.
type Named = { props: { accessibilityLabel?: string } };

function leadingLabels(): string[] {
  const labels: string[] = screen
    .getByTestId("patient-app-bar-leading")
    .findAll((node: Named) => Boolean(node.props?.accessibilityLabel))
    .map((node: Named) => String(node.props.accessibilityLabel));
  // A composite and its host element both carry the label (Logo renders as a
  // labelled View inside a labelled component), so the same name appears twice
  // in a row. Collapse RUNS only — two genuinely separate elements with the same
  // name would still show up, which is what this is meant to catch.
  return labels.filter((label, i) => label !== labels[i - 1]);
}

describe("PatientAppBar", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
    mockNav.canGoBack = true;
  });

  it("renders the logo, the avatar and the bell", () => {
    render(<PatientAppBar avatarInitials="MN" avatarLabel="Melchizedek Narh" />);
    expect(screen.getByLabelText("MedApp")).toBeTruthy();
    expect(screen.getByLabelText("Melchizedek Narh")).toBeTruthy();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
  });

  it("has no back button by default, even when navigation can pop", () => {
    // The inverted default is the whole point: every existing caller is a tab
    // root, and `canGoBack` is true on most of them.
    mockNav.canGoBack = true;
    render(<PatientAppBar />);
    expect(screen.queryByLabelText("Go back")).toBeNull();
  });

  it("renders initials when there is no photo", () => {
    render(<PatientAppBar avatarInitials="sc" avatarLabel="Dr. Sarah Chen" />);
    expect(screen.getByText("SC")).toBeTruthy();
  });

  it("falls back to a silhouette — never a bare coloured circle — with no photo and no initials", () => {
    render(<PatientAppBar avatarLabel="Your profile" />);
    // The silhouette is a decorative <Icon />, so it is hidden from assistive
    // tech and can't be found by label — the glyph itself is the assertion. An
    // empty tinted circle (the defect BRAND calls out) would render no glyph.
    const glyphs = screen.UNSAFE_getAllByType(MaterialIcons).map((n) => n.props.name);
    expect(glyphs).toContain("person");
  });

  it("prefers initials over the silhouette", () => {
    render(<PatientAppBar avatarInitials="MN" avatarLabel="Melchizedek Narh" />);
    const glyphs = screen.UNSAFE_getAllByType(MaterialIcons).map((n) => n.props.name);
    expect(glyphs).not.toContain("person");
    expect(screen.getByText("MN")).toBeTruthy();
  });

  it("names the avatar for assistive tech", () => {
    render(<PatientAppBar avatarLabel="Melchizedek Narh" />);
    expect(screen.getByLabelText("Melchizedek Narh")).toBeTruthy();
  });

  it("uses a default avatar label when the user has no display name", () => {
    render(<PatientAppBar />);
    expect(screen.getByLabelText("Your profile")).toBeTruthy();
  });

  it("makes the avatar a button only when a handler is supplied", () => {
    const onAvatarPress = jest.fn();
    const { unmount } = render(<PatientAppBar avatarLabel="Me" />);
    expect(screen.getByLabelText("Me").props.accessibilityRole).toBe("image");
    unmount();

    render(<PatientAppBar avatarLabel="Me" onAvatarPress={onAvatarPress} />);
    const button = screen.getByRole("button", { name: "Me" });
    fireEvent.press(button);
    expect(onAvatarPress).toHaveBeenCalled();
  });

  it("shows no unread badge when no count is supplied", () => {
    render(<PatientAppBar />);
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    expect(screen.queryByText("3")).toBeNull();
  });

  it("shows no unread badge at zero", () => {
    render(<PatientAppBar unreadCount={0} />);
    // The count is part of the accessible name, so its absence is observable.
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("renders the unread count and announces it", () => {
    render(<PatientAppBar unreadCount={3} />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByLabelText("Notifications, 3 unread")).toBeTruthy();
  });

  it("clamps a large unread count", () => {
    render(<PatientAppBar unreadCount={1204} />);
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("calls the notifications handler", () => {
    const onNotificationsPress = jest.fn();
    render(<PatientAppBar onNotificationsPress={onNotificationsPress} />);
    fireEvent.press(screen.getByLabelText("Notifications"));
    expect(onNotificationsPress).toHaveBeenCalled();
  });

  it("says the bell is unavailable until a handler is wired", () => {
    render(<PatientAppBar />);
    expect(screen.getByLabelText("Notifications").props.accessibilityHint).toBe(
      "Not available yet",
    );
  });

  // -------------------------------------------------------------------------
  // Back — Figma 741:887 `Back=Shown`, the fix for the Patient Profile Overview
  // dead end. Mirrors PractitionerAppBar's contract with an inverted default.
  // -------------------------------------------------------------------------

  it("shows back when the screen opts in and there is history", () => {
    render(<PatientAppBar hideBack={false} />);
    expect(screen.getByLabelText("Go back")).toBeTruthy();
  });

  it("pops the stack on back", () => {
    render(<PatientAppBar hideBack={false} />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("prefers an explicit handler over popping", () => {
    const onBackPress = jest.fn();
    render(<PatientAppBar hideBack={false} onBackPress={onBackPress} />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(onBackPress).toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("still shows back for an explicit handler with nothing to pop", () => {
    mockNav.canGoBack = false;
    const onBackPress = jest.fn();
    render(<PatientAppBar hideBack={false} onBackPress={onBackPress} />);
    expect(screen.getByLabelText("Go back")).toBeTruthy();
  });

  it("hides back when there is nothing to pop and no fallback", () => {
    mockNav.canGoBack = false;
    render(<PatientAppBar hideBack={false} />);
    expect(screen.queryByLabelText("Go back")).toBeNull();
  });

  it("falls back to a given href when there is nothing to pop", () => {
    mockNav.canGoBack = false;
    render(<PatientAppBar hideBack={false} backFallbackHref={"/(app)/index" as never} />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(app)/index");
  });

  it("keeps the logo LEFT when back is shown — it does not centre", () => {
    // Centring is the practitioner bar's signature. `Back=Shown` shifts the
    // logo right inside the leading group instead, so the logo stays the second
    // child of the LEFT-hand group rather than moving into a middle slot.
    render(<PatientAppBar hideBack={false} />);
    expect(leadingLabels()).toEqual(["Go back", "MedApp"]);
  });

  it("renders NO spacer when back is hidden, so the logo does not shift", () => {
    // The practitioner bar keeps a 44x44 spacer because its logo is centred.
    // Here a spacer would be the thing that MOVES the logo (16 -> 68), so the
    // leading group must hold the logo and nothing else.
    render(<PatientAppBar />);
    expect(leadingLabels()).toEqual(["MedApp"]);
  });
});
