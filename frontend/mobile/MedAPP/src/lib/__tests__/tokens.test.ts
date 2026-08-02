// Guards the "one place per colour value" rule from docs/BRAND.md.
//
// global.css is the source: it declares every colour twice, once per mode.
// theme/palette.cjs is its generated JS mirror, needed because React Native
// can't read a CSS variable at runtime. If the two ever drift, a screen's
// class-driven colours and its JS-driven colours disagree — which is invisible
// in the mode you happen to be developing in. So assert they match.

import fs from "fs";
import path from "path";
import palette from "../../../theme/palette.cjs";
import { tokenColor } from "../tokens";

const css = fs.readFileSync(path.join(__dirname, "../../../global.css"), "utf8");

/** Pulls the `--color-*` declarations out of one `:root`-style block. */
function cssBlock(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--color-([a-z0-9-]+):\s*(\d+ \d+ \d+);/g)) out[m[1]] = m[2];
  return out;
}

describe("colour tokens", () => {
  const blocks = { light: cssBlock(":root {"), dark: cssBlock(".dark:root {") };

  it.each(["light", "dark"] as const)("palette.%s mirrors global.css exactly", (scheme) => {
    expect(palette[scheme]).toEqual(blocks[scheme]);
  });

  it("declares the same tokens in both modes", () => {
    expect(Object.keys(palette.dark)).toEqual(Object.keys(palette.light));
  });

  it("resolves a token per mode instead of freezing one value", () => {
    // on-primary is the canary: literal white in light mode, near-black in dark.
    expect(tokenColor("on-primary", "light")).toBe("rgb(255, 255, 255)");
    expect(tokenColor("on-primary", "dark")).toBe("rgb(0, 55, 49)");
  });

  it("composes an alpha the way a /opacity class would", () => {
    expect(tokenColor("shadow", "light", 0.12)).toBe("rgba(13, 26, 23, 0.12)");
  });
});
