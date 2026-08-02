// Locks Logo's BOX, which is the thing that actually broke.
//
// Logo passed `{ height, aspectRatio }` and let the layout engine derive the
// width. react-native-web composes a `require()`d asset's INTRINSIC size UNDER
// the caller's style, so the element ended up with `width: 584px` (the PNG's own
// pixel width) AND `height: 42px` — and CSS `aspect-ratio` is ignored once both
// axes are definite. Measured on the running app at 393pt: a 584-wide logo box
// inside a 393-wide PatientAppBar, which pushed the avatar + bell RightGroup out
// to x=600, off-screen, and left `resizeMode="contain"` centring the artwork in
// that 584 box — so the mark rendered ALONE, hard against the right edge, on
// every patient tab root at once.
//
// The invariant below — both axes definite, width derived from height — is the
// one that would have caught it. It is asserted on the style rather than on a
// rendered pixel width because RNTL has no layout engine; the point is that the
// component does not DELEGATE the width.

import { Image, StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";

const mockScheme = { value: "light" as "light" | "dark" };
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: mockScheme.value, setColorScheme: jest.fn() }),
}));

import { Logo } from "../Logo";

/** The wordmark PNGs are 584x224; the app icon is square. */
const WORDMARK_RATIO = 584 / 224;

function imageStyle() {
  return (StyleSheet.flatten(screen.UNSAFE_getAllByType(Image)[0].props.style) ?? {}) as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  mockScheme.value = "light";
});

describe("Logo", () => {
  it("sets BOTH width and height — it never delegates the width", () => {
    render(<Logo height={42} />);
    const style = imageStyle();
    expect(style.height).toBe(42);
    expect(style.width).toBeCloseTo(42 * WORDMARK_RATIO, 5);
  });

  it("does not fall back to `aspectRatio`, which loses to the asset's intrinsic width", () => {
    render(<Logo height={42} />);
    expect(imageStyle().aspectRatio).toBeUndefined();
  });

  it("stays inside a 393pt app bar's leading slot at the app-bar size", () => {
    // The regression in one number: 42 * 584/224 = 109.5, not 584. A leading
    // group wider than the bar is what evicted the avatar and the bell.
    render(<Logo height={42} />);
    expect(imageStyle().width as number).toBeLessThan(393 - 16 - 100 - 16);
  });

  it("keeps the icon variant square", () => {
    render(<Logo variant="icon" height={64} />);
    const style = imageStyle();
    expect(style.width).toBe(64);
    expect(style.height).toBe(64);
  });

  it("scales the width with the height", () => {
    render(<Logo height={128} />);
    expect(imageStyle().width).toBeCloseTo(128 * WORDMARK_RATIO, 5);
  });

  it("resolves the reversed raster in dark mode, at the same box", () => {
    render(<Logo height={42} />);
    const light = screen.UNSAFE_getAllByType(Image)[0].props.source;

    mockScheme.value = "dark";
    render(<Logo height={42} />);
    const dark = screen.UNSAFE_getAllByType(Image)[0].props.source;

    expect(dark).not.toEqual(light);
    expect(imageStyle().width).toBeCloseTo(42 * WORDMARK_RATIO, 5);
  });
});
