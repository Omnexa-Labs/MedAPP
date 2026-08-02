// Drift guard: PatientProfileOverviewScreen must carry no literal colour.
//
// The visible failure in the dark capture (dark-13) was the camera FAB: a
// `#ffffff` glyph on `bg-primary`, which in dark mode is #6BD8CB — white on
// mint, roughly 1.5:1. It is the textbook case for "pick the token by ROLE":
// the glyph is label-on-a-filled-button, so it is `on-primary`, NOT `surface`
// and not a literal that happens to match on-primary's light value.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_PATH = join(__dirname, "..", "PatientProfileOverviewScreen.tsx");

/** The file with block and line comments removed — prose may cite old hexes. */
function code(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

describe("PatientProfileOverviewScreen — no literal colours survive", () => {
  it("contains no hex anywhere outside comments", () => {
    expect(code()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("contains no raw rgb()/rgba()", () => {
    expect(code()).not.toMatch(/\brgba?\s*\(/);
  });

  it("names no CSS colour word — BRAND does not exempt white", () => {
    expect(code()).not.toMatch(/\b(white|black)\b/);
  });

  it("uses no Tailwind default palette class", () => {
    expect(code()).not.toMatch(
      /\b(?:bg|text|border|fill|stroke)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    );
  });

  it("takes the camera FAB's glyph from `on-primary`, its fill's pair", () => {
    expect(code()).toMatch(/useTokenColor\("on-primary"\)/);
  });
});
