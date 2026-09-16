// The web width ceiling.
//
// This file exists because the rest of the shell suite CANNOT cover it. Those
// tests run under Jest's native platform, where `WebColumn` returns its children
// untouched — so all 142 of them passed unchanged when the column was introduced,
// which proves the native no-op and says nothing whatsoever about the web path.
// The behaviour that was actually shipped is only observable with `Platform.OS`
// forced to "web".
//
// Both directions are asserted, because both are load-bearing: a wrapper that
// failed to appear on web would leave the 1900px stretch in place, and a wrapper
// that appeared on native would re-centre every phone layout in the app inside a
// 480px box on devices that are already the right width.

import { render, screen } from "@testing-library/react-native";
import { Platform, Text } from "react-native";

import { WebColumn, WEB_COLUMN_MAX_WIDTH } from "../WebColumn";

/**
 * `Platform.OS` is a plain property on the module object, so it is swapped
 * directly and restored afterwards. `jest.mock("react-native")` would work too
 * and costs the whole library — this needs one field.
 */
function withPlatform(os: typeof Platform.OS, body: () => void) {
  const original = Platform.OS;
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  try {
    body();
  } finally {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  }
}

describe("on the web", () => {
  it("wraps its children in a column capped at the shared max width", () => {
    withPlatform("web", () => {
      render(
        <WebColumn>
          <Text>content</Text>
        </WebColumn>,
      );
      const column = screen.getByTestId("web-column");
      expect(column).toBeTruthy();
      expect(column.props.style).toEqual(
        expect.objectContaining({ maxWidth: WEB_COLUMN_MAX_WIDTH }),
      );
    });
  });

  it("still renders the children it wraps", () => {
    withPlatform("web", () => {
      render(
        <WebColumn>
          <Text>content</Text>
        </WebColumn>,
      );
      expect(screen.getByText("content")).toBeTruthy();
    });
  });

  it("caps rather than fixes the width, so a narrow window stays full-bleed", () => {
    // A fixed `width` would leave dead margins on a phone-sized browser window.
    withPlatform("web", () => {
      render(
        <WebColumn>
          <Text>content</Text>
        </WebColumn>,
      );
      const style = screen.getByTestId("web-column").props.style as Record<string, unknown>;
      expect(style.width).toBeUndefined();
    });
  });
});

describe("on native", () => {
  it.each(["ios", "android"] as const)("adds no wrapper on %s", (os) => {
    withPlatform(os, () => {
      render(
        <WebColumn>
          <Text>content</Text>
        </WebColumn>,
      );
      // The children render, and nothing has been introduced around them — the
      // phone layouts are untouched.
      expect(screen.getByText("content")).toBeTruthy();
      expect(screen.queryByTestId("web-column")).toBeNull();
    });
  });
});

describe("the shared constant", () => {
  it("is a phone-width column, not a desktop one", () => {
    // The design frames render at 390–430px. A ceiling far above that would let
    // rows reflow into shapes the design never specified; far below it would clip
    // the intended composition.
    expect(WEB_COLUMN_MAX_WIDTH).toBeGreaterThanOrEqual(430);
    expect(WEB_COLUMN_MAX_WIDTH).toBeLessThanOrEqual(600);
  });
});
