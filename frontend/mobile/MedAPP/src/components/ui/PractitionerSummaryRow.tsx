// PractitionerSummaryRow — "who you are booking with", in one place.
//
// Figma: component set `PractitionerSummaryRow` 780:5363, variants
// `Surface=Card` (780:2270, 361x128) and `Surface=Bare` (780:5348, 313x80).
// Instanced by all three booking frames: 756:4384, 756:4221, 756:5180.
//
//   row       gap 12, items-center
//   avatar    56 circle, fallback plate `surface-container-high` + silhouette
//             `on-surface-variant`; 20px verified badge bottom-right, offset -2/-2,
//             fill `color/primary`, 12px check `color/on-primary`
//   name      headline-md `color/on-surface`, one line
//   specialty body-md `color/on-surface-variant`, one line
//   rating    16px star `color/primary` + value label-md `on-surface`
//             + "(N reviews)" label-sm `on-surface-variant`
//   tags      Badge row — index 0 `primary`, the rest `neutral`
//
// WHY THIS FILE EXISTS. The same practitioner is drawn three times in one flow,
// three different ways, and the divergence had already reached the data:
//
//   screen 1  bare <Image> 80x80 r12   on a Google CDN URI
//   screen 2  bare <Image> 88x88 r12   on the same URI, plus `TagPill` at font 10
//   screen 3  bare <Image> 64 circle   on the same URI
//
// Three sizes, two radii, one of them not even a circle, and a tag treatment at
// 10px — under docs/BRAND.md's 12sp floor, which is a live accessibility defect
// rather than a restyle. The URI is the worse half: a bare `<Image>` on a remote
// CDN is a GREY BOX offline, and offline is the normal case for this product's
// stated market (docs/BRAND.md: "Legible on cheap hardware", PROJECT.md's
// emerging-market brief). BRAND §App shell is explicit — "Avatars always need a
// real fallback (photo -> initials -> person silhouette). An empty coloured circle
// reads as a broken image, not as a placeholder." So the avatar goes through
// `AvatarWithFallback`, and a screen cannot opt out of that by construction.
//
// SLOT ORDER FOLLOWS THE COMPONENT, NOT THE FRAME. 756:4221 (the review screen)
// draws the tags ABOVE the name inside its card; 780:5363, the component that
// frame instances, draws them LAST. The component is the authority — a frame that
// disagrees with the component it instances is an override, and an override is
// exactly the thing that produced three different practitioner rows. FLAGGED for
// the designer either way.
//
// `Surface=Card` WRAPS THE REAL `<Card />`, it does not redraw one. 780:2270's
// 24 inset, radius/24 and hairline are already Card's whole treatment, so
// re-drawing them here would create a fourth definition of a card surface — and
// one that could quietly acquire a shadow, which Card structurally strips.
//
// FLAGGED for the designer: frame 756:4221 wraps a `Surface=Bare` INSTANCE inside
// its own 361x167 card frame, which is pixel-identical to `Surface=Card`. Screen 2
// uses `surface="card"`; the redundant nesting is not reproduced. 756:4221 should
// instance the Card variant.
//
// NO `className` AND NO `style`. Same rule as VitalStatCard: `surface`, `rating`,
// `tags` and `verified` are the axes 780:5363 has, and a screen must not be able
// to express a private practitioner row.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// This file uses none.

import { Text, View } from "react-native";
import { useTokenColor } from "@/lib/tokens";
import { AvatarWithFallback } from "./AvatarWithFallback";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { Icon } from "./icons/Icon";

/** 780:5363. */
const AVATAR = 56;
const VERIFIED_BADGE = 20;
const VERIFIED_GLYPH = 12;
/** Bottom-right overhang, per the frame. */
const VERIFIED_OFFSET = -2;
/** docs/BRAND.md §Iconography: 16 is the in-line size the rating row draws. */
const RATING_GLYPH = 16;

export type PractitionerSummaryRowProps = {
  name: string;
  specialty: string;
  /**
   * May be null/absent, and routinely is. The fallback is not an edge case —
   * see the note above on the target market.
   */
  avatarUri?: string | null;
  /** "card" wraps the shared <Card />; "bare" is the 313x80 inner content. Default "card". */
  surface?: "card" | "bare";
  /** Omit for `Show rating = false` (screen 3). */
  rating?: { value: number; count: number };
  /** Omit or pass [] for `Show tags = false` (screens 1 and 3). */
  tags?: string[];
  verified?: boolean;
  testID?: string;
};

export function PractitionerSummaryRow({
  name,
  specialty,
  avatarUri,
  surface = "card",
  rating,
  tags,
  verified = false,
  testID,
}: PractitionerSummaryRowProps) {
  const starColor = useTokenColor("primary");
  const checkColor = useTokenColor("on-primary");
  const showTags = !!tags && tags.length > 0;

  const body = (
    <View className="w-full flex-row items-center gap-3">
      <View>
        <AvatarWithFallback
          uri={avatarUri}
          size={AVATAR}
          // See AvatarWithFallback's TONE table: a `surface-container-high` plate
          // with an `on-surface-variant` silhouette, per 780:5363. The accent in
          // this row belongs to the verified badge.
          tone="neutral"
          label={name}
        />
        {verified ? (
          // No white ring around the badge — docs/BRAND.md forbids a raw white
          // fill, and in dark mode a white ring is a bright halo on a near-black
          // page. The -2 overhang onto the page is the separation.
          <View
            className="absolute items-center justify-center rounded-full bg-primary"
            style={{
              width: VERIFIED_BADGE,
              height: VERIFIED_BADGE,
              right: VERIFIED_OFFSET,
              bottom: VERIFIED_OFFSET,
            }}
          >
            {/* Meaningful, not decorative: nothing else in the row says the
                practitioner is verified, so it carries a label. */}
            <Icon chrome="check" size={VERIFIED_GLYPH} color={checkColor} label="Verified" />
          </View>
        ) : null}
      </View>

      <View className="min-w-0 flex-1">
        <Text className="font-headline-md text-headline-md text-on-surface" numberOfLines={1}>
          {name}
        </Text>
        <Text className="font-body-md text-body-md text-on-surface-variant" numberOfLines={1}>
          {specialty}
        </Text>

        {rating ? (
          // One a11y node: "4.9 out of 5, 128 reviews", not three fragments.
          <View
            accessible
            accessibilityLabel={`${rating.value} out of 5, ${rating.count} reviews`}
            className="mt-1 flex-row items-center gap-1"
          >
            {/* Decorative — the label above says it in words. */}
            <Icon chrome="star-outline" size={RATING_GLYPH} color={starColor} />
            <Text className="font-label-md text-label-md text-on-surface">{rating.value}</Text>
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              ({rating.count} reviews)
            </Text>
          </View>
        ) : null}

        {showTags ? (
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            {tags.map((tag, i) => (
              // The first tag is the practitioner's specialty and carries the
              // accent; the rest are neutral. One accent per row — a row of
              // three teal badges reads as three equally important claims.
              <Badge key={tag} label={tag} tone={i === 0 ? "primary" : "neutral"} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );

  if (surface === "bare") {
    return (
      <View className="w-full" testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <Card className="w-full" testID={testID}>
      {body}
    </Card>
  );
}
