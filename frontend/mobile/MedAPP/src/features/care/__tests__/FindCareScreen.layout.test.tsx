// Locks the 360dp CHIP-ROW decision.
//
// Found on an Itel S25 Ultra at 360dp (1080px / density 480), 33dp narrower than
// the 393dp the frames are drawn at: both filter rows shipped as full-bleed
// horizontal scrollers and both half-sliced at rest. The type row cut
// "Hospitals" mid-word — the row read `All  Doctors  Nurses  Ho` — and the facet
// row ended "Home Service" exactly ON the screen edge with "Nearest" off-screen
// entirely. docs/BRAND.md §"Horizontal strips and carousels": "Nothing is
// half-sliced in the resting state."
//
// Jest cannot see layout, so this suite does not try to. It asserts the DECISION
// instead, at the one seam that distinguishes the two modes of ChoiceChipRow: a
// wrapping row renders a View with no `horizontal` prop, a scroller renders a
// ScrollView with `horizontal` set. That is enough to stop `scrollable` being
// quietly put back — which is the only way this defect returns — and it is
// honest about what a unit test can know. The width arithmetic itself lives in
// the comment above each row in FindCareScreen.tsx.

import { screen } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => null,
}));

// The rows under test are static; the directory is stubbed to a settled empty
// state so this suite never touches react-query or the care API.
jest.mock("@/features/care/hooks/use-directory", () => ({
  useDirectory: () => ({ entries: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

import { FindCareScreen } from "../FindCareScreen";

describe("FindCareScreen filter rows at 360dp", () => {
  it("wraps both chip rows instead of scrolling them", () => {
    render(<FindCareScreen />);

    for (const testID of ["find-care-type-chips", "find-care-facet-chips"]) {
      // Falsy, not `false`: a wrapping row is a View, which has no such prop.
      expect(screen.getByTestId(testID).props.horizontal).toBeFalsy();
    }
  });

  it("keeps every category and every facet mounted and reachable at rest", () => {
    render(<FindCareScreen />);

    // The whole point of the wrap: at 360dp the scroller left three of these six
    // off-screen behind an affordance that did not read as scrollable, and one of
    // them cut through its own label.
    for (const label of [
      "All",
      "Doctors",
      "Nurses",
      "Hospitals",
      "Pharmacies",
      "Pharmacists",
      "Specialty",
      "Available Now",
      "Home Service",
      "Nearest",
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });
});
