// HospitalReviewCard — one patient review of a hospital.
//
// Figma: local component `HospitalReviewCard` 1019:16078 on page 1019:640
// "Facilities", 361x152. Instanced by `hospital_detail` 1020:641.
//
//   card    the shared <Card />
//   head    row, justify-between — star glyph + "4 / 5" (label-md) | date (label-sm)
//   title   label-md `on-surface`
//   body    body-md `on-surface-variant`
//
// LOCAL, AND PROPOSED FOR PROMOTION — same reasoning as HoursRow.tsx. The design
// system has no review component at all; `doctor_profile`'s is a hand-drawn
// frame, which is the drift `docs/PIPELINE.md` §2 exists to stop, so this is one
// definition rather than a second hand-drawing.
//
// ---------------------------------------------------------------------------
// THERE IS NO REVIEWER, AND THAT IS A COLUMN FACT
// ---------------------------------------------------------------------------
// `hospital_reviews` holds `reviewer_user_id` and nothing else about the person
// — no name, no avatar, and `hospital_service` has no user lookup to resolve
// one with. So this card takes no author prop. It is not an oversight to fill in
// later: a name here would have to be invented, and the adapter deliberately
// drops the UUID so it cannot reach a screen at all.
//
// There is also NO aggregate. The table carries a per-review `rating` and the
// profile has no `avg_rating` / `review_count` column, so the section shows the
// individual scores and never a headline "4.2 ★ (18)" — refused by name in
// `docs/PIPELINE.md` §5.
//
// ---------------------------------------------------------------------------
// THE DATE IS RELATIVE, AND COARSE ON PURPOSE
// ---------------------------------------------------------------------------
// The frame reads "2 weeks ago" / "1 month ago". Coarse buckets, not "13 days
// ago": the precision is meaningless for a review and an exact age invites a
// reader to treat one review as fresher than another when the difference is
// noise. `formatReviewAge` is exported so a test asserts the buckets rather than
// re-deriving them, and it never throws on a malformed date — the server types
// `created_at` as `object`, so a non-ISO string is possible and the card must
// render the review anyway.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none.

import { Text, View } from "react-native";
import { Card, Icon } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

/** docs/BRAND.md §Iconography: 20 in a dense row. */
const GLYPH = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "2 weeks ago". Returns null for anything unparseable, and the card then omits
 * the date rather than printing "Invalid Date" beside a real person's words.
 */
export function formatReviewAge(iso: string, now: Date = new Date()): string | null {
  const then = new Date(iso);
  const ms = then.getTime();
  if (Number.isNaN(ms)) return null;

  const days = Math.floor((now.getTime() - ms) / DAY_MS);
  // A clock-skewed future timestamp is not an error worth surfacing on a review.
  if (days < 0) return "Just now";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;

  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export type HospitalReviewCardProps = {
  /** The raw score. Rendered as "N / 5" — the table has no scale column, and 5 is the app's. */
  rating: number;
  title: string;
  body: string | null;
  /** ISO-8601 `created_at`. */
  createdAt: string;
  testID?: string;
};

export function HospitalReviewCard({
  rating,
  title,
  body,
  createdAt,
  testID,
}: HospitalReviewCardProps) {
  const star = useTokenColor("primary");
  const age = formatReviewAge(createdAt);

  return (
    <Card testID={testID}>
      <View className="w-full flex-row items-center justify-between gap-3">
        {/* One node: "Rated 4 out of 5" rather than a glyph announcement
            followed by the fragment "4 / 5". The glyph is decorative — the
            words beside it carry the meaning, so the rating is never colour
            or iconography alone. */}
        <View
          accessible
          accessibilityLabel={`Rated ${rating} out of 5`}
          className="flex-row items-center gap-1"
        >
          <Icon chrome="star-outline" size={GLYPH} color={star} />
          <Text className="font-label-md text-label-md text-on-surface">{rating} / 5</Text>
        </View>
        {age ? (
          <Text className="font-label-sm text-label-sm text-on-surface-variant">{age}</Text>
        ) : null}
      </View>

      <Text className="mt-3 font-label-md text-label-md text-on-surface">{title}</Text>
      {body ? (
        <Text className="mt-1 font-body-md text-body-md text-on-surface-variant">{body}</Text>
      ) : null}
    </Card>
  );
}
