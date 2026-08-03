// Locks the 360dp SUGGESTED-GROUPS STRIP arithmetic.
//
// Found on an Itel S25 Ultra at 360dp: a 200dp card + 16dp gap laid out inside
// the screen's 16dp gutter put the second card's right edge at 432 against a
// 328dp content column, so 112 of its 200dp showed — sliced through its middle,
// Join button chopped. docs/BRAND.md §"Horizontal strips and carousels" allows a
// scrolling strip only with "a deliberate partial peek (roughly a third to a half
// of the next item) plus a trailing inset matching the leading gutter".
//
// Jest has no layout engine, so this suite asserts the three INPUTS the peek is
// derived from — card width, gap, and the full-bleed/inset pair — and recomputes
// the peek from them. If someone tunes one of the three, the peek fraction moves
// out of BRAND's band and this fails, which is the whole intent: the numbers are
// a system, not three independent knobs.

import { screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
}));

// Same reason as CommunityScreen.nav.test.tsx: the real store pulls in
// @/lib/api/client -> @/lib/config, which throws without app.config.ts extras.
jest.mock("@/store/auth-store", () => ({
  useAuthStore: () => ({ user: null }),
}));

import { CommunityScreen } from "../CommunityScreen";

/** The device the defect was found on. */
const SCREEN = 360;
/** BRAND's screen gutter. */
const GUTTER = 16;

describe("Suggested Groups strip at 360dp", () => {
  it("scrolls full-bleed with a leading gutter and a matching trailing inset", () => {
    render(<CommunityScreen />);
    const strip = screen.getByTestId("suggested-groups-strip");

    expect(strip.props.horizontal).toBe(true);

    // Full-bleed: the strip breaks out of the parent's 16dp gutter...
    const outer = StyleSheet.flatten(strip.props.style);
    expect(outer.marginHorizontal).toBe(-GUTTER);

    // ...and re-applies it symmetrically as its own content inset, which is what
    // BRAND's "trailing inset matching the leading gutter" means. Inside the
    // parent's padding there was no trailing inset at all.
    const inner = StyleSheet.flatten(strip.props.contentContainerStyle);
    expect(inner.paddingHorizontal).toBe(GUTTER);
  });

  it("sizes the card so the second one peeks between a third and a half", () => {
    render(<CommunityScreen />);
    const strip = screen.getByTestId("suggested-groups-strip");
    const gap = StyleSheet.flatten(strip.props.contentContainerStyle).gap as number;

    const width = StyleSheet.flatten(screen.getByTestId("group-card-g1").props.style)
      .width as number;
    expect(width).toBe(240);

    // card 1 spans GUTTER .. GUTTER+width; card 2 starts one gap later.
    const secondCardX = GUTTER + width + gap;
    const peek = SCREEN - secondCardX;

    // Sliced through the middle is the defect; a hairline sliver and a
    // near-complete card are the two other failures BRAND names.
    expect(peek / width).toBeGreaterThanOrEqual(1 / 3);
    expect(peek / width).toBeLessThanOrEqual(1 / 2);
  });
});
