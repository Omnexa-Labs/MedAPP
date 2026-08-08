// Locks SkeletonCard (Figma 517:2291) to its ONE job: reserving the exact
// layout of what it replaces.
//
// The load-bearing assertion is the arithmetic one — for every shape, the row
// heights actually rendered, plus the gaps and the shell inset, must still sum to
// the measured total. That is the check the private copies had no equivalent of,
// and it is why 222:333 shipped 118px against VitalStatCard's real 127.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { SKELETON_HEIGHTS, SkeletonCard, type SkeletonShape } from "../SkeletonCard";

function code(): string {
  return readFileSync(join(__dirname, "..", "SkeletonCard.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

/** `gap-3` on the shell — read from the source, not guessed, so the two agree. */
const GAP = 12;

/** The shell inset per shape, as the frames draw it. */
const INSET: Record<string, number> = {
  "provider-card": 16,
  "list-row": 16,
  "vital-stat-card": 16,
  "post-card": 24,
};

/** The rows each card shape is composed of, in order. */
const ROWS: Record<string, number[]> = {
  "provider-card": [56, 22, 28, 44],
  "list-row": [56, 46],
  "vital-stat-card": [24, 31, 16],
  "post-card": [40, 22, 70, 100],
};

const CARD_SHAPES = Object.keys(ROWS) as Exclude<SkeletonShape, "reply-thread">[];
const ALL_SHAPES = Object.keys(SKELETON_HEIGHTS) as SkeletonShape[];

/**
 * Every shape is hidden from assistive tech, and RNTL v13 excludes hidden
 * elements from queries by default — so every lookup here has to opt back in.
 * That the opt-in is REQUIRED is itself part of what this suite proves.
 */
function shell(testID: string) {
  return screen.getByTestId(testID, { includeHiddenElements: true });
}

function heightOf(testID: string): number | undefined {
  return StyleSheet.flatten(shell(testID).props.style)?.height as number | undefined;
}

/**
 * The shape `toJSON()` returns, declared structurally rather than imported from
 * `react-test-renderer` — jest.config.js forbids depending on that package
 * directly, and two renderers in the tree is how you get two Reacts.
 */
type Json = { props: Record<string, unknown>; children: (Json | string)[] | null };

/**
 * The HOST tree, not the element tree. `ReactTestInstance.children` includes the
 * composite nodes (ReplyRow, Bar), which makes "the shell's rows" ambiguous;
 * toJSON() flattens those away, so index 0..n really are the rows.
 */
function hostTree(shape: SkeletonShape): Json {
  const tree = render(<SkeletonCard shape={shape} />).toJSON();
  return (Array.isArray(tree) ? tree[0] : tree) as unknown as Json;
}

function kids(node: Json): Json[] {
  return (node.children ?? []).filter((c: Json | string): c is Json => typeof c !== "string");
}

function rowHeights(node: Json): number[] {
  return kids(node).map(
    (child) => (StyleSheet.flatten(child.props.style as never) as { height?: number })?.height,
  ) as number[];
}

describe("SkeletonCard — the measured heights are the contract", () => {
  it("carries the Figma-measured height for every shape", () => {
    // Written out literally rather than looped over the export, so a number
    // edited in the component has to be edited HERE too, against the frame.
    expect(SKELETON_HEIGHTS).toEqual({
      "provider-card": 218,
      "list-row": 146,
      "vital-stat-card": 127,
      "post-card": 316,
      "reply-thread": 190,
    });
  });

  it.each(ALL_SHAPES)("renders %s at exactly its measured height", (shape) => {
    render(<SkeletonCard shape={shape} testID="sk" />);
    expect(heightOf("sk")).toBe(SKELETON_HEIGHTS[shape]);
  });

  it.each(CARD_SHAPES)("%s's rows still sum to its total", (shape) => {
    const rows = rowHeights(hostTree(shape));
    expect(rows).toEqual(ROWS[shape]);

    const inner = rows.reduce((a, b) => a + b, 0) + GAP * (rows.length - 1);
    expect(inner + 2 * INSET[shape]).toBe(SKELETON_HEIGHTS[shape]);
  });

  it("uses the gap this suite assumes, so the arithmetic above is not fiction", () => {
    expect(code()).toMatch(/className="w-full gap-3"/);
  });

  it("post card keeps exactly three body lines — PostCard's clamp is the 316", () => {
    // Third row is the body group; its own children are the lines.
    expect(kids(kids(hostTree("post-card"))[2])).toHaveLength(3);
  });
});

describe("SkeletonCard — the height cannot be overridden", () => {
  it("takes no `style`, no `height` and no `width` prop", () => {
    const src = code();
    const start = src.indexOf("export type SkeletonCardProps");
    const props = src.slice(start, src.indexOf("};", start));
    expect(props).not.toMatch(/\bstyle\??:/);
    expect(props).not.toMatch(/\bheight\??:/);
    expect(props).not.toMatch(/\bwidth\??:/);
  });

  it("requires `shape` — a skeleton must name what it stands in for", () => {
    expect(code()).toMatch(/shape: SkeletonShape;/);
    expect(code()).not.toMatch(/shape\?:/);
    expect(code()).not.toMatch(/shape = "/);
  });

  it("reads the height from the shape, never from a caller", () => {
    expect(code()).toMatch(/height: SKELETON_HEIGHTS\[shape\]/);
  });
});

describe("SkeletonCard — placeholder, not content", () => {
  it.each(ALL_SHAPES)("hides %s from assistive tech", (shape) => {
    render(<SkeletonCard shape={shape} testID="sk" />);
    const el = shell("sk");
    expect(el.props.accessibilityElementsHidden).toBe(true);
    expect(el.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("offers no way to un-hide it — the announcement belongs to the screen", () => {
    const src = code();
    expect(src).not.toMatch(/accessibilityLabel\??:/);
    expect(src).not.toMatch(/accessibilityRole\??:/);
  });

  it("carries no text at all", () => {
    render(<SkeletonCard shape="provider-card" />);
    expect(screen.queryAllByText(/\S/, { includeHiddenElements: true })).toHaveLength(0);
  });

  it("paints every bar with outline-variant, never a surface-container step", () => {
    const src = code();
    expect(src).toMatch(/bg-outline-variant/);
    // `surface-container-high` and `card-surface` are the SAME value in dark
    // mode, so bars painted with it had contrast 1.00 and vanished.
    expect(src).not.toMatch(/bg-surface-container/);
  });

  it("takes bar radii from the scale only — the copies used an off-scale 6px", () => {
    const src = code();
    expect(src).toMatch(/RADIUS = \{ bar: "rounded-xs", block: "rounded-md", pill: "rounded-full" \}/);
    expect(src).not.toMatch(/rounded-\[/);
  });
});

describe("SkeletonCard — count", () => {
  it("renders n copies and adds no spacing of its own", () => {
    render(<SkeletonCard shape="list-row" count={3} testID="sk" />);
    expect(shell("sk-0")).toBeTruthy();
    expect(shell("sk-1")).toBeTruthy();
    expect(shell("sk-2")).toBeTruthy();
    // A fragment, so the parent's gap is the only gap — a wrapper with its own
    // gap would be a second shift when the real list arrives.
    expect(code()).toMatch(/return <>\{Array\.from/);
  });

  it("still reserves the full height per copy", () => {
    render(<SkeletonCard shape="provider-card" count={2} testID="sk" />);
    expect(heightOf("sk-0")).toBe(218);
    expect(heightOf("sk-1")).toBe(218);
  });
});

describe("SkeletonCard — reply thread is the shell-less one, on purpose", () => {
  it("draws no card shell: no card-surface and no hairline", () => {
    render(<SkeletonCard shape="reply-thread" testID="sk" />);
    const flat = StyleSheet.flatten(shell("sk").props.style) ?? {};
    expect(flat).not.toHaveProperty("borderWidth");
    // It loads INSIDE a card, so a shell here would be a card in a card AND
    // would reserve a shell the loaded content never has.
    expect(code()).not.toMatch(/function ReplyThread[\s\S]{0,400}<Card/);
    expect(code()).toMatch(/SHELL_INSET: Record<Exclude<SkeletonShape, "reply-thread">/);
  });

  it("indents 32 behind a 1px rail and reserves two replies", () => {
    const src = code();
    expect(src).toMatch(/gap-3 pl-8/);
    expect(src).toMatch(/w-px self-stretch bg-outline-variant/);
    // [rail, replies]; the replies column holds exactly two reply rows.
    const top = kids(hostTree("reply-thread"));
    expect(top).toHaveLength(2);
    expect(kids(top[1])).toHaveLength(2);
  });
});
