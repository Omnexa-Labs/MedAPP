// Drift guard: the three async-state components must carry no literal colour.
//
// Written in the style of PatientProfileOverviewScreen.theme.test.ts, and aimed
// at a defect these three are unusually exposed to. The one on record is
// `bg-white/60` on a state panel — a fill that cannot flip, so the panel stayed
// a light-mode card on a near-black page. The frames' own code hands you exactly
// that: `bg-[var(--color-card-surface,white)]` and
// `text-[color:var(--color/on-primary,white)]` are what get_design_context
// returns, fallback literal included.
//
// The skeleton is the worst case, because a wrong colour there is INVISIBLE
// rather than ugly: `surface-container-high` and `card-surface` resolve to the
// same #242B2A in dark mode, which is how three of the private copies rendered
// as blank cards at contrast 1.00. A hex would fail the same way in one mode and
// look fine in the other, which is why this asserts on the source and not on a
// rendered snapshot.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCES = ["EmptyState.tsx", "ErrorPanel.tsx", "SkeletonCard.tsx", "StatePanelShell.tsx"];

/** The file with block and line comments removed — prose cites old hexes. */
function code(file: string): string {
  return readFileSync(join(__dirname, "..", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

describe.each(SOURCES)("%s — no literal colours survive", (file) => {
  it("contains no hex anywhere outside comments", () => {
    expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("contains no raw rgb()/rgba()", () => {
    expect(code(file)).not.toMatch(/\brgba?\s*\(/);
  });

  it("names no CSS colour word — BRAND does not exempt white", () => {
    expect(code(file)).not.toMatch(/\b(white|black)\b/);
  });

  it("uses no Tailwind default palette class", () => {
    expect(code(file)).not.toMatch(
      /\b(?:bg|text|border|fill|stroke)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    );
  });

  it("keeps no CSS custom property — the frames' code arrives full of them", () => {
    expect(code(file)).not.toMatch(/var\(--/);
  });

  it("resolves any JS-side colour by token name, never by value", () => {
    const src = code(file);
    // Only the plate glyph needs a real string (RN has no currentColor); it must
    // come from the token table, and the token must not be interpolated either.
    if (/color=\{/.test(src)) expect(src).toMatch(/useTokenColor\(/);
    expect(src).not.toMatch(/color=\{"/);
    expect(src).not.toMatch(/bg-\$\{/);
  });
});

describe("the async-state panels — the dark-mode traps specifically", () => {
  it("never paints a skeleton bar with a surface-container step", () => {
    // `surface-container-high` === `card-surface` in dark mode, so bars painted
    // with it had contrast 1.00 and the skeleton rendered as blank cards.
    expect(code("SkeletonCard.tsx")).not.toMatch(/bg-surface-container/);
  });

  it("never gives a transparent container an opaque fill", () => {
    // The Inline containers are transparent by design; a `bg-*` on them is the
    // `bg-white/60` defect in a new coat.
    const shell = code("StatePanelShell.tsx");
    expect(shell).toMatch(/items-center gap-3 rounded-md p-4/);
    expect(shell).not.toMatch(/rounded-md p-4[^"]*bg-/);
  });

  it("pairs every plate fill with its own on- token in one table", () => {
    const shell = code("StatePanelShell.tsx");
    expect(shell).toMatch(/fill:\s*"bg-primary-tint",\s*glyph:\s*"on-surface-variant"/);
    expect(shell).toMatch(/fill:\s*"bg-error-container",\s*glyph:\s*"on-error-container"/);
    // There is no way to select one and keep the other's glyph.
    expect(shell).toMatch(/PLATE_PAIR\[tone\]/);
  });
});
