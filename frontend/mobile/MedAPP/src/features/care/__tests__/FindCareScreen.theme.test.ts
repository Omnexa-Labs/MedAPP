// Drift guard: FindCareScreen must carry no literal colour.
//
// This screen is one of the three wired to a live backend, so the states a
// reviewer sees least — skeleton, empty, error — are the states a user on a bad
// connection sees MOST. Before this pass those were the worst offenders on the
// screen: the retry CTA was `#00685f` with a `#ffffff` label and a hand-picked
// `#005049` pressed value, and both the empty and error glyphs were `#6d7a77`.
// In dark mode the button stayed dark teal on a #0E1514 page while every label
// around it flipped.
//
// The assertion is source-level rather than render-level on purpose: a render
// test only proves the ONE branch it exercised, and the point here is that no
// branch of the file — including the two unreachable `warn` / `away` tones —
// can reintroduce a frozen value.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_PATH = join(__dirname, "..", "FindCareScreen.tsx");

/** The file with block and line comments removed — prose may cite old hexes. */
function code(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

describe("FindCareScreen — no literal colours survive", () => {
  it("contains no hex anywhere outside comments", () => {
    expect(code()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("contains no raw rgb()/rgba() — alpha goes through tokenColor's third arg", () => {
    expect(code()).not.toMatch(/\brgba?\s*\(/);
  });

  it("names no CSS colour word — BRAND does not exempt white", () => {
    expect(code()).not.toMatch(/\b(white|black)\b/);
  });

  it("uses no Tailwind default palette class — those have no dark value", () => {
    // `bg-green-100`, `text-orange-700`, `bg-red-500` were all live here. They
    // are not tokens: NativeWind resolves them from Tailwind's own palette,
    // which has one value per shade and therefore cannot flip.
    expect(code()).not.toMatch(
      /\b(?:bg|text|border|fill|stroke)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    );
  });

  it("resolves every JS-side colour by token name", () => {
    const source = code();
    expect(source).toMatch(/from "@\/lib\/tokens"/);
    // The derived value that replaced a hand-picked pressed hex on the CTA.
    expect(source).toMatch(/blendTokens\("tertiary", "on-tertiary", 0\.12/);
    // The `primary`/`on-primary` pair that used to be asserted here is GONE, and
    // its absence is the point: it belonged to a hand-rolled <Pressable> inside
    // this screen's private ErrorPanel, which drew a filled CTA without using
    // Button. The three panels are now the shared components (Figma 517:1773 /
    // 517:2111 / 517:2291), so their pressed state layer is Button's — one
    // definition instead of a re-derived copy per screen. What is asserted
    // instead is that they cannot come back: this screen no longer DEFINES a
    // panel, it imports one.
    expect(source).toMatch(/EmptyState,\s*\n?\s*ErrorPanel,/);
    expect(source).not.toMatch(/function (EmptyState|ErrorPanel|SkeletonCard)\(/);
  });
});
