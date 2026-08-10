// Locks the brand-mark contract.
//
// Jest maps `.svg` to src/test/svg-mock.tsx, so glyph geometry isn't observable
// here — what IS observable, and what actually broke, is the wiring: the marks
// must be real SVG components (not an icon-font name), Google's must never be
// recoloured, and Apple's must take a themed colour.

import { render, screen } from "@testing-library/react-native";
import { BrandMark, MARK } from "../brand/BrandMark";

/** The stand-in the global `\.svg$` mapping renders. */
const GLYPH = "svg-mock";

describe("BrandMark", () => {
  it("renders the marks as SVG components, not as an icon-font glyph name", () => {
    // MaterialIcons `g-mobiledata` was the reported bug, and no icon font can
    // ever carry the four-colour G. Resolving a real .svg module is the fix.
    render(<BrandMark name="google" label="Google" />);
    expect(screen.getByLabelText(GLYPH)).toBeTruthy();
  });

  it("marks the Google G as un-themable and the Apple mark as themed", () => {
    // Recolouring the official G violates Google's Sign-In branding rules, so
    // `color` is dropped for that mark even if a caller passes one. The Apple
    // silhouette is monochrome by specification and must follow the theme, or it
    // disappears against a dark surface.
    expect(MARK.google.themed).toBe(false);
    expect(MARK.apple.themed).toBe(true);
  });

  it("normalises both marks to one optical height at the same nominal size", () => {
    // The Apple silhouette is full-bleed in an 814x1000 box while the Google art
    // spans 44 of 48 — without the scale factor Apple renders visibly taller.
    const { unmount } = render(<BrandMark name="google" size={20} label="Google" />);
    expect(screen.getByLabelText(GLYPH).props.style.height).toBe(20);
    unmount();

    render(<BrandMark name="apple" size={20} label="Apple mark" />);
    const apple = screen.getByLabelText(GLYPH).props.style;
    expect(apple.height).toBe(Math.round(20 * (44 / 48)));
    // …and it keeps its aspect ratio rather than being squashed into a square.
    expect(apple.width).toBeLessThan(apple.height);
  });

  it("hides a decorative mark from assistive tech but names a labelled one", () => {
    // Decorative = sitting next to the visible word "Google" in the button.
    const { unmount } = render(<BrandMark name="apple" />);
    expect(screen.queryByLabelText("Apple")).toBeNull();
    unmount();

    render(<BrandMark name="apple" label="Apple" />);
    expect(screen.getByLabelText("Apple")).toBeTruthy();
  });
});
