// SkeletonCard — the loading placeholder (Figma 517:2291, Shape=Provider card |
// List row | Vital stat card | Post card | Reply thread).
//
// ---------------------------------------------------------------------------
// THE ONE RULE, AND HOW THIS API ENFORCES IT
// ---------------------------------------------------------------------------
// docs/PIPELINE.md:106 — "SkeletonCard must reserve the EXACT layout of what it
// replaces, or it causes the layout shift it exists to prevent." The frame's own
// description is blunter: "A skeleton that no longer measures its target is
// worse than none, because it guarantees the shift it was added to prevent."
// The measured misses are on record: Figma 147:150 reserved 122px too little for
// ProviderCard, and 222:333 was 118 against VitalStatCard's real 127 — 9px of
// shift. A `Shape=Post card` variant was added at exactly 316 because that is
// PostCard's 3-line clamp.
//
// So the height is not a prop, and neither is `style`:
//
//   * `shape` is REQUIRED and has no default. You cannot render a skeleton
//     without naming the component it stands in for.
//   * the height comes from SKELETON_HEIGHTS, keyed by shape, and there is no
//     way to pass one in. A skeleton that can be resized at the call site is a
//     skeleton that will be resized to whatever stops it looking odd on the
//     screen being written, which is how the 118-vs-127 miss happened.
//   * SKELETON_HEIGHTS is exported so the test can assert each shape's rows sum
//     to its measured total — the arithmetic is checked, not trusted.
//
// Width is deliberately NOT fixed. The frames measure 345/361 because that is
// the mobile frame's content width; in RN the card fills its container, and
// pinning 361 would letterbox it on every other device. Height is the axis that
// causes shift.
//
// ---------------------------------------------------------------------------
// WHY THE BARS ARE `outline-variant`
// ---------------------------------------------------------------------------
// Not `surface-container-high`, which is what three of the private copies used:
// it resolves to #242B2A in dark and `card-surface` ALSO resolves to #242B2A in
// dark, so the bars had contrast 1.00 and the skeleton rendered as blank cards.
// `outline-variant` is 1.71 in light and 1.54 in dark — visible in both, and
// quiet enough to still read as a placeholder (`outline` at 4.5 reads as data).
//
// No shimmer. A Reanimated opacity loop is the only correct way to add one here
// and HomeScreen is currently the app's single Reanimated consumer, so adding it
// would pull the mock into every suite that renders a loading state.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none.

import { View } from "react-native";
import { cn } from "@/lib/cn";
import { Card } from "./Card";

export type SkeletonShape =
  /** ProviderCard 407:529 — avatar 56, name + specialty, clinic line, three badges, action + icon action. */
  | "provider-card"
  /** The appointment / conversation row — 56 thumb, title + meta, full-width action. */
  | "list-row"
  /** VitalStatCard 211:241 — 24 icon chip + label, value, trend. */
  | "vital-stat-card"
  /** PostCard Content=Plain, including its 3-line clamp and action bar. */
  | "post-card"
  /** The two-level comment thread on community — post detail. NO card shell. */
  | "reply-thread";

/**
 * Each shape's measured height, in px, from its Figma variant.
 *
 * IF THE COMPONENT A SHAPE MIRRORS CHANGES HEIGHT, CHANGE IT HERE TOO — and the
 * Figma variant with it. These are not spacing choices; they are measurements of
 * other components, and the test asserts each one against the rows that compose
 * it so a row edited without the total cannot pass.
 */
export const SKELETON_HEIGHTS: Record<SkeletonShape, number> = {
  "provider-card": 218,
  "list-row": 146,
  "vital-stat-card": 127,
  "post-card": 316,
  "reply-thread": 190,
};

/** Shell inset per shape. The card shapes take 16; Post card takes 24. */
const SHELL_INSET: Record<Exclude<SkeletonShape, "reply-thread">, number> = {
  "provider-card": 16,
  "list-row": 16,
  "vital-stat-card": 16,
  "post-card": 24,
};

/**
 * Bar radius from the scale only: 4 for text bars, 12 for button/bubble blocks,
 * full for pills and avatars. The frames this replaces used 6px, which is off
 * BRAND's scale — including the newer Post card variant's 24px action squares,
 * which are drawn here at `radius/4` and flagged in the build report rather than
 * reproduced off-scale.
 */
const RADIUS = { bar: "rounded-xs", block: "rounded-md", pill: "rounded-full" } as const;

type BarProps = {
  h: number;
  /** px, a `%` string, or omitted for `flex-1`. */
  w?: number | `${number}%`;
  radius?: keyof typeof RADIUS;
};

function Bar({ h, w, radius = "bar" }: BarProps) {
  return (
    <View
      className={cn("bg-outline-variant", RADIUS[radius])}
      style={{ height: h, ...(w === undefined ? { flex: 1 } : { width: w }) }}
    />
  );
}

function ProviderCard() {
  return (
    <>
      {/* Identity row 56. Every row height here is an explicit `style` number
          rather than a class, so the test can read them back off the tree and
          check they still sum to SKELETON_HEIGHTS — the arithmetic is the whole
          contract, and a compiled `h-14` is not legible to it. */}
      <View className="w-full flex-row items-center gap-3" style={{ height: 56 }}>
        <Bar h={56} w={56} radius="pill" />
        <View className="flex-1 gap-1">
          <Bar h={26} w={200} />
          <Bar h={18} w={140} />
        </View>
      </View>
      {/* Clinic row 22 */}
      <View className="w-full flex-row items-center gap-2" style={{ height: 22 }}>
        <Bar h={16} w={16} />
        <Bar h={18} w={220} />
      </View>
      {/* Badge row 28 */}
      <View className="w-full flex-row items-center gap-2" style={{ height: 28 }}>
        <Bar h={28} w={112} radius="pill" />
        <Bar h={28} w={103} radius="pill" />
        <Bar h={28} w={76} radius="pill" />
      </View>
      {/* Actions row 44 — the 44pt touch floor, so it reserves a real control. */}
      <View className="w-full flex-row items-center gap-3" style={{ height: 44 }}>
        <Bar h={44} radius="block" />
        <Bar h={44} w={44} radius="block" />
      </View>
    </>
  );
}

function ListRow() {
  return (
    <>
      <View className="w-full flex-row items-center gap-3" style={{ height: 56 }}>
        <Bar h={56} w={56} radius="block" />
        <View className="flex-1 gap-2">
          <Bar h={18} w="100%" />
          <Bar h={14} w={120} />
        </View>
      </View>
      <Bar h={46} w="100%" radius="pill" />
    </>
  );
}

function VitalStatCardShape() {
  return (
    <>
      <View className="w-full flex-row items-center gap-2" style={{ height: 24 }}>
        <Bar h={24} w={24} radius="pill" />
        <Bar h={18} w={100} />
      </View>
      <Bar h={31} w={90} />
      <Bar h={16} w={140} />
    </>
  );
}

function PostCard() {
  return (
    <>
      {/* Header 40 */}
      <View className="w-full flex-row items-start gap-3" style={{ height: 40 }}>
        <Bar h={40} w={40} radius="pill" />
        <View className="flex-1" style={{ gap: 6 }}>
          <Bar h={18} w={140} radius="block" />
          <Bar h={14} w={96} radius="block" />
        </View>
      </View>
      {/* Title 22 */}
      <Bar h={22} w={220} radius="block" />
      {/* Body 70 — THREE lines, which is PostCard Content=Plain's clamp. Adding a
          fourth here is the same defect as changing the height. */}
      <View className="w-full gap-2" style={{ height: 70 }}>
        <Bar h={18} w="100%" radius="block" />
        <Bar h={18} w="100%" radius="block" />
        <Bar h={18} w={194} radius="block" />
      </View>
      {/* Action row 100: 24 tall between a 24 lead-in and the 52 that reserves
          the card's own action bar below the clamp. */}
      <View
        className="w-full flex-row items-start gap-8"
        style={{ height: 100, paddingTop: 24, paddingBottom: 52 }}
      >
        <Bar h={24} w={24} />
        <Bar h={24} w={24} />
        <Bar h={24} w={24} />
        <Bar h={24} w={24} />
      </View>
    </>
  );
}

/** One reply: 28 avatar beside a 17 name bar over a 68 bubble block. */
function ReplyRow({ bubbleTail, nameWidth }: { bubbleTail: number; nameWidth: number }) {
  return (
    <View className="w-full flex-row items-start gap-2">
      <Bar h={28} w={28} radius="pill" />
      <View className="flex-1 gap-1">
        <Bar h={17} w={nameWidth} radius="block" />
        <View className="w-full gap-2 p-3">
          <Bar h={18} w="100%" radius="block" />
          <Bar h={18} w={bubbleTail} radius="block" />
        </View>
      </View>
    </View>
  );
}

function ReplyThread({ testID }: { testID?: string }) {
  // The one shape with NO card shell, and that is deliberate rather than an
  // oversight (517:2291's description): every other shape REPLACES a card, this
  // one loads INSIDE one, in the gap opened by tapping "View 3 replies". A shell
  // here would draw a card inside a card AND reserve a shell the loaded content
  // never has — so the shift it exists to prevent would happen on arrival.
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="w-full flex-row items-start gap-3 pl-8"
      style={{ height: SKELETON_HEIGHTS["reply-thread"] }}
      testID={testID}
    >
      <View className="w-px self-stretch bg-outline-variant" />
      <View className="flex-1 gap-3">
        <ReplyRow nameWidth={132} bubbleTail={188} />
        <ReplyRow nameWidth={104} bubbleTail={224} />
      </View>
    </View>
  );
}

const SHAPE_BODY: Record<Exclude<SkeletonShape, "reply-thread">, () => React.JSX.Element> = {
  "provider-card": ProviderCard,
  "list-row": ListRow,
  "vital-stat-card": VitalStatCardShape,
  "post-card": PostCard,
};

export type SkeletonCardProps = {
  /** Required, and there is no default — name what this stands in for. */
  shape: SkeletonShape;
  /**
   * How many to render. Returns a fragment, NOT a spaced list: the parent owns
   * the gap between cards, because the real list it replaces does too and a gap
   * invented here would be a second layout shift on arrival.
   */
  count?: number;
  testID?: string;
};

export function SkeletonCard({ shape, count = 1, testID }: SkeletonCardProps) {
  const one = (index: number) => {
    const key = `${shape}-${index}`;
    const id = count === 1 ? testID : `${testID ?? shape}-${index}`;
    if (shape === "reply-thread") return <ReplyThread key={key} testID={id} />;
    const Body = SHAPE_BODY[shape];
    return (
      <Card
        key={key}
        // Hidden from assistive tech, always. A screen reader must not announce
        // placeholder geometry, and there is no prop to switch this off — the
        // "Loading…" announcement belongs on the screen's own wrapper, which is
        // where OverviewScreen and the facility screens already put it.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="w-full gap-3"
        // `padding` and `height` go through `style` because Card's own `p-md`
        // is a class and `cn` has no tailwind-merge, so a class cannot beat it.
        // Card strips elevation keys from `style` and passes the rest through.
        style={{ padding: SHELL_INSET[shape], height: SKELETON_HEIGHTS[shape] }}
        testID={id}
      >
        <Body />
      </Card>
    );
  };

  return <>{Array.from({ length: count }, (_, i) => one(i))}</>;
}
