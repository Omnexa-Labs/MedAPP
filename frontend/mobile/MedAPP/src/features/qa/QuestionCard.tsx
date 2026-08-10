// One row of the Ask a doctor list. Figma `QA Question Card` 1106:18267.
//
// ---------------------------------------------------------------------------
// THE ROW IS INERT, BY DESIGN
// ---------------------------------------------------------------------------
// No overflow menu, no share, no profile tap, no like. Every affordance that
// leads away from a row like this leads towards its author: there is no report
// route for a question in social_service, any share text would carry the
// question body, and there is no profile to open because there is no id to open
// one with. So this is a <View>, not a <Pressable> — the absence is the feature.
//
// ---------------------------------------------------------------------------
// A SILHOUETTE, NEVER INITIALS
// ---------------------------------------------------------------------------
// `AvatarWithFallback` walks photo -> initials -> silhouette. An anonymous
// question has no name in the row at all, so `initials={null}` is the only
// honest input: deriving a letter would invent an identity, and the `?` disc
// this codebase retired from comments was retired because comments are always
// attributed — that reasoning does not transfer to a question that genuinely is
// not.
//
// ---------------------------------------------------------------------------
// AWAITING IS A STATE, NOT A SPINNER
// ---------------------------------------------------------------------------
// An unanswered question renders a settled hairline-and-label row. No
// ActivityIndicator, no skeleton, no shimmer. Nothing is in flight — the row
// loaded completely and the answer does not exist yet, possibly for good. A
// progress indicator would promise an answer that no timer is counting down to,
// which is the same lie as a dead control.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.
// This file uses none.

import { Text, View } from "react-native";
import { AvatarWithFallback, Card, Icon } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { bylineForQuestion, type QAEntry } from "./api";

/**
 * Relative time, copied from `features/community/PostCard.tsx`.
 *
 * Copied rather than imported: that module is the Community feature's, it pulls
 * in expo-router and the post card's whole view model, and this feature must not
 * take a dependency on either to format a timestamp.
 */
export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export function QuestionCard({ entry }: { entry: QAEntry }) {
  const muted = useTokenColor("on-surface-variant");
  const primary = useTokenColor("primary");
  const byline = bylineForQuestion(entry);

  return (
    // <Card>, not a hand-rolled surface: card-surface + a 1px outline-variant
    // hairline + radius/24 + a 24px inset is the whole treatment, and no drop
    // shadow in either mode.
    <Card testID={`qa-question-${entry.id}`} className="gap-sm">
      <View className="flex-row items-center gap-3">
        {/* `initials={null}` is deliberate — see the header. */}
        <AvatarWithFallback size={40} uri={null} initials={null} label={byline} />
        <View className="flex-1 gap-[2px]">
          <Text className="font-label-md text-label-md text-on-surface" numberOfLines={1}>
            {byline}
          </Text>
          <Text className="font-label-sm text-label-sm text-on-surface-variant">
            Asked {timeAgo(entry.createdAtIso)}
          </Text>
        </View>
      </View>

      <Text className="font-body-md text-body-md text-on-surface" style={{ lineHeight: 24 }}>
        {entry.question}
      </Text>

      {/* The only thing said about who asked. It is here for the ASKER's benefit
          — it is how they can see that the anonymous default held on the
          question they just sent. */}
      {entry.isAnonymous ? (
        <View className="flex-row items-center gap-xs self-start rounded-full bg-surface-container-low px-sm py-xs">
          <Icon chrome="shield" size={16} color={muted} />
          <Text className="font-label-sm text-label-sm text-on-surface-variant">
            Asked anonymously
          </Text>
        </View>
      ) : null}

      {entry.isAnswered ? (
        <View className="gap-sm rounded-xl bg-primary-container/15 p-3">
          <View className="flex-row items-center gap-sm">
            {/* Attribution is the ROLE, not a name. `QAOut` returns
                `answered_by_user_id` and nothing else about the answerer, and
                naming a clinician the service never named is the fabrication
                this codebase already removed from the chat feature. */}
            <Icon name="stethoscope" size={16} color={primary} />
            <Text className="font-label-sm text-label-sm text-primary">
              Answered by a clinician
            </Text>
            {entry.answeredAtIso ? (
              <Text className="font-label-sm text-label-sm text-on-surface-variant">
                · {timeAgo(entry.answeredAtIso)}
              </Text>
            ) : null}
          </View>
          <Text className="font-body-md text-body-md text-on-surface" style={{ lineHeight: 24 }}>
            {entry.answer}
          </Text>
        </View>
      ) : (
        <View className="gap-sm">
          <View className="h-px bg-outline-variant" />
          <View className="flex-row items-center gap-sm">
            <Icon chrome="schedule" size={16} color={muted} />
            <Text
              testID={`qa-awaiting-${entry.id}`}
              className="flex-1 font-label-sm text-label-sm text-on-surface-variant"
            >
              No answer yet. A clinician will reply here.
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}
