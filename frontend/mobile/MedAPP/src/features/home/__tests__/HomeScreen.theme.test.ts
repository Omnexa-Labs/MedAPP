// Drift guard: HomeScreen must carry no literal colour.
//
// Copied deliberately from PatientProfileOverviewScreen.theme.test.ts, which is
// why Profile is clean. Same four structural assertions, same
// comments-stripped source, so the two files can be diffed and a divergence is
// visible.
//
// What it caught here, and what each was:
//
//   `bg-white` + `text-primary` on the "Ask MedAI" pill. In dark mode `primary`
//   is #6BD8CB, so this was mint on pure white — roughly 1.4:1, a WCAG failure
//   rather than a tone mismatch. Now `bg-surface` + `text-primary`, which is
//   the role the pill actually plays and pairs correctly in both schemes.
//
//   `style={{ backgroundColor: pressed ? "#008378" : "#00685f" }}` on Join
//   Call. Those are the LIGHT values of `primary-container` and `primary`, and
//   because an inline style beats a class it silently overrode the element's
//   own `bg-primary` — the button was pinned to light teal in dark mode. The
//   pressed state is `active:opacity-90` now, which needs no colour value at
//   all, so there is nothing left to freeze.
//
//   `text-white` on that button's label, where the correct token is
//   `on-primary` (#003731 in dark — the dark ink a mint button needs).
//
//   `rgba(255,255,255,0.10)` on the hero's pulse blob and `#ffffff` on its
//   sparkle glyph, both on a `bg-primary-container` card whose content pair is
//   `on-primary-container`.
//
//   `#ffd999` / `#ff9966` on the Health Insights placeholder tile. Those two
//   were flagged in place as a stand-in for a licensed image and mapped to no
//   token — which is exactly why that card could not be retokenised and had to
//   be deleted instead. It was also the screen's one fabricated health claim.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_PATH = join(__dirname, "..", "HomeScreen.tsx");

/** The file with block and line comments removed — prose may cite old hexes. */
function code(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

describe("HomeScreen — no literal colours survive", () => {
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

  it("takes the hero's glyph and blob from `on-primary-container`, its fill's pair", () => {
    expect(code()).toMatch(/useTokenColor\("on-primary-container"\)/);
    expect(code()).toMatch(/useTokenColor\("on-primary-container", 0\.1\)/);
  });

  it("sets no inline backgroundColor on a pressed state", () => {
    // The specific mechanism that defeated `bg-primary` on Join Call: an inline
    // style always wins over a className, so a pressed-colour callback silently
    // pins the resting colour too.
    expect(code()).not.toMatch(/backgroundColor:\s*pressed/);
  });
});
