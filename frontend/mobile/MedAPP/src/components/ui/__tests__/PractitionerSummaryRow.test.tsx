// Locks PractitionerSummaryRow (Figma 780:5363) against the three-way drift that
// made it necessary: the same practitioner drawn at 80x80 r12, 88x88 r12 and 64
// circle across one flow, every one of them a bare <Image> on a remote CDN URI
// with no fallback, and screen 2's tags at fontSize 10.
//
// Both Figma axes are covered — Surface=Card|Bare × rating/tags/verified on and
// off — plus the two rules that are not visual: the avatar must degrade to a real
// fallback (offline is the normal case for the target market), and nothing may be
// set under 12sp.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Image } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { tokenColor } from "@/lib/tokens";

const mockScheme = { value: "light" as "light" | "dark" };
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: mockScheme.value, setColorScheme: jest.fn() }),
}));

import { Card } from "../Card";
import { Icon } from "../icons/Icon";
import { PractitionerSummaryRow } from "../PractitionerSummaryRow";

function code(): string {
  return readFileSync(join(__dirname, "..", "PractitionerSummaryRow.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

const BASE = { name: "Dr. Evelyn Sterling", specialty: "Cardiologist" };

beforeEach(() => {
  mockScheme.value = "light";
});

describe("PractitionerSummaryRow — Surface axis", () => {
  it("wraps the SHARED Card by default, rather than redrawing one", () => {
    // A private card surface here would be a fourth definition of one, and one
    // that could quietly acquire the shadow Card structurally strips.
    render(<PractitionerSummaryRow {...BASE} />);
    expect(screen.UNSAFE_getAllByType(Card)).toHaveLength(1);
  });

  it("renders bare content with no Card for the confirmation screen", () => {
    render(<PractitionerSummaryRow {...BASE} surface="bare" />);
    expect(screen.UNSAFE_queryAllByType(Card)).toHaveLength(0);
    expect(screen.getByText("Dr. Evelyn Sterling")).toBeTruthy();
  });

  it("draws no card treatment of its own in either surface", () => {
    const src = code();
    expect(src).not.toMatch(/\brounded-card\b/);
    expect(src).not.toMatch(/\bbg-card-surface\b/);
    expect(src).not.toMatch(/\bborder-outline-variant\b/);
  });
});

describe("PractitionerSummaryRow — the avatar has a real fallback", () => {
  it("renders NO bare <Image> when there is no URI — the offline case", () => {
    // Three screens shipped a bare <Image> on a Google CDN URI. Offline, that is
    // a grey box, and offline is the normal case for this product's market.
    render(<PractitionerSummaryRow {...BASE} />);
    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
    // The silhouette is the fallback, and the avatar is still named.
    expect(screen.getByLabelText("Dr. Evelyn Sterling")).toBeTruthy();
  });

  it("renders the photo when one exists", () => {
    render(<PractitionerSummaryRow {...BASE} avatarUri="https://example.test/e.jpg" />);
    expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(1);
  });

  it("treats a null URI as absent rather than as a broken source", () => {
    render(<PractitionerSummaryRow {...BASE} avatarUri={null} />);
    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it("hardcodes no CDN URI of its own", () => {
    expect(code()).not.toMatch(/https?:\/\//);
  });
});

describe("PractitionerSummaryRow — verified badge", () => {
  it("is absent by default", () => {
    render(<PractitionerSummaryRow {...BASE} />);
    expect(screen.queryByLabelText("Verified")).toBeNull();
  });

  it("is ANNOUNCED, not decorative — nothing else in the row says it", () => {
    render(<PractitionerSummaryRow {...BASE} verified />);
    expect(screen.getByLabelText("Verified")).toBeTruthy();
  });

  it("tints its check `on-primary` on the `primary` disc, per mode", () => {
    render(<PractitionerSummaryRow {...BASE} verified />);
    const check = screen.UNSAFE_getAllByType(Icon).find((n) => n.props.chrome === "check");
    expect(check?.props.color).toBe(tokenColor("on-primary", "light"));
    expect(check?.props.size).toBe(12);
  });

  it("has no white separation ring — BRAND forbids a raw white fill", () => {
    const src = code();
    expect(src).not.toMatch(/\b(white|black)\b/);
    expect(src).not.toMatch(/bg-surface\b/);
  });
});

describe("PractitionerSummaryRow — rating axis", () => {
  it("is absent when no rating is given (screen 3)", () => {
    render(<PractitionerSummaryRow {...BASE} surface="bare" verified />);
    expect(screen.queryByText(/reviews/)).toBeNull();
  });

  it("renders value and review count, announced as one phrase", () => {
    render(<PractitionerSummaryRow {...BASE} rating={{ value: 4.9, count: 128 }} />);
    expect(screen.getByText("4.9")).toBeTruthy();
    expect(screen.getByText("(128 reviews)")).toBeTruthy();
    expect(screen.getByLabelText("4.9 out of 5, 128 reviews")).toBeTruthy();
  });

  it("draws the star at 16 in `primary`, decorative", () => {
    render(<PractitionerSummaryRow {...BASE} rating={{ value: 4.9, count: 128 }} />);
    const star = screen.UNSAFE_getAllByType(Icon).find((n) => n.props.chrome === "star-outline");
    expect(star?.props.size).toBe(16);
    expect(star?.props.color).toBe(tokenColor("primary", "light"));
    expect(star?.props.label).toBeUndefined();
  });
});

describe("PractitionerSummaryRow — tags axis", () => {
  it("is absent when omitted, and when empty", () => {
    render(<PractitionerSummaryRow {...BASE} />);
    expect(screen.queryByText("Cardiology")).toBeNull();
    render(<PractitionerSummaryRow {...BASE} tags={[]} />);
    expect(screen.queryByText("Cardiology")).toBeNull();
  });

  it("renders every tag through the shared Badge, not a 10px private pill", () => {
    // `TagPill` at fontSize 10 is under docs/BRAND.md's 12sp floor.
    render(<PractitionerSummaryRow {...BASE} tags={["Cardiology", "Top Rated"]} />);
    expect(screen.getByText("Cardiology")).toBeTruthy();
    expect(screen.getByText("Top Rated")).toBeTruthy();
    expect(code()).not.toMatch(/fontSize/);
    expect(code()).not.toMatch(/text-\[\d+px\]/);
  });

  it("accents only the FIRST tag — a row of three teal badges reads as three claims", () => {
    expect(code()).toMatch(/i === 0 \? "primary" : "neutral"/);
  });
});

describe("PractitionerSummaryRow — treatment", () => {
  it("contains no colour literal", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\s*\(/);
  });

  it("imports no icon library directly", () => {
    expect(code()).not.toMatch(/@expo\/vector-icons/);
  });

  it("sets name and specialty on the ramp", () => {
    const src = code();
    expect(src).toMatch(/font-headline-md text-headline-md text-on-surface/);
    expect(src).toMatch(/font-body-md text-body-md text-on-surface-variant/);
  });

  it("emits no shadow", () => {
    const src = code();
    expect(src).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(src).not.toMatch(/\belevation\b/);
  });

  it("exposes no className or style escape hatch", () => {
    const src = code();
    expect(src).not.toMatch(/className\?:/);
    expect(src).not.toMatch(/style\?:/);
  });

  it("keeps ONE avatar size, so the three screens cannot diverge again", () => {
    // 80x80 r12 / 88x88 r12 / 64 circle was the shipped state.
    expect(code().match(/const AVATAR = \d+/)).toBeTruthy();
    expect(code()).not.toMatch(/size\?:\s*number/);
  });
});
