// Threaded comment replies — Figma collapsed 1094:2270, expanded 1094:2306,
// dark proof 1098:2371, un-named parent 1096:2353, async states 1097:2324, and
// the measured decisions in the design notes 1100:2367.
//
// ============================================================================
// TWO LEVELS, NEVER THREE, AND THE SERVER IS THE ONE ENFORCING IT
// ============================================================================
// A reply attaches to a top-level comment. A reply to a REPLY attaches to that
// reply's own parent — same thread, same depth — so `parent_comment_id` on the
// response is not always the one that was sent. Nothing here recurses, nothing
// here computes a depth, and nothing here decides where a row lands: this file
// renders exactly two levels and reads the parent off the RESPONSE.
//
// What the flattening loses is WHO WAS ADDRESSED, since the person answered is a
// sibling at the same depth rather than the parent. That is what `replyToName`
// carries and what the "@name" prefix renders.
//
// ============================================================================
// REPLIES ARE FETCHED PER PARENT, ONLY WHEN A READER OPENS THE THREAD
// ============================================================================
// `GET /comments/{id}/replies` is one query per thread, `enabled` on the
// expanded flag. A screen showing eight comments must not issue eight extra
// requests for arguments nobody asked to read — `replyCount` is the only input
// the "View N replies" control needs, and it arrives on the comment itself.
//
// Paging stops on `nextOffset === null` and on nothing else. A full page is not
// a signal: the server proves a next page by fetching `limit + 1` and discarding
// the extra, so inferring "a full page means more" loops forever whenever the
// total is an exact multiple of the limit.
//
// ============================================================================
// THE GEOMETRY IS MEASURED, NOT CHOSEN — 1100:2367
// ============================================================================
// Indent 32, a 1px `outline-variant` rail, 12 gap. NOT the 48 that would align a
// reply with the parent's TEXT column: at 360dp that costs 16 of a 328 content
// width and buys alignment with a column the reader has stopped reading.
//
// The arithmetic that indent has to leave room for: 328 - 32 - 1 - 12 = 283
// column, less a 40 avatar and its 12 gap = 231 body, less 12+12 bubble padding =
// 207 of text, which is about 26 characters at body-md. A real line, not a gutter.
//
// ============================================================================
// AVATARS COME OFF THE RAMP, AND DEPTH IS NOT SIGNALLED BY SHRINKING ONE
// ============================================================================
// The reply frames draw hand-rolled 36 and 28 circles with solid teal plates and
// white initials. Both numbers are off `Avatar`'s ramp (40 and 56 only) and the
// white-on-teal fill contradicts the component's own contract: the initials plate
// is `primary-tint` with `on-surface-variant` text, never `on-primary`. The
// delivered post-detail frame was corrected to 56 for the post author and 40 for
// commenters; these frames were not, so this file follows the CORRECTED rule and
// not the drawing.
//
// So a reply's avatar is 40, the same as a parent's, and depth is carried by the
// indent and the rail alone — which is enough, because with one level of nesting
// there is no ambiguity left to resolve: a row is either a comment or a reply.
// A smaller step (28 or 32) would read the depth slightly faster and is NOT
// invented here — a new ramp size is a design system decision, and a one-off
// inline circle is exactly how the drift above started.
//
// The rail is a GROUPING device and it ends where the thread ends, which is what
// puts the two controls in different places: "Show more replies" sits INSIDE it
// because it pages the list, "Hide replies" sits OUTSIDE it because it closes the
// whole thread. Two controls, two positions, two meanings.
//
// Both controls lead with a 16x1 rule rather than a chevron. The icon registry
// ships no chevron for this and buying an asset for a control that already reads
// correctly is not a trade worth making.
//
// ============================================================================
// A LONG NAME MUST NOT MOVE THE TIMESTAMP
// ============================================================================
// The meta row is full width, the name FILLS it with `numberOfLines={1}`, and the
// timestamp is intrinsically sized and therefore pinned right. This is
// structural rather than a hope that names are short: "Dr. Nana Ama
// Serwaa-Boateng Owusu" truncates on one line and nothing else moves. The 3-dot
// lives in the ACTIONS row beside Reply for the same reason — in the meta row it
// would unpin the timestamp.
//
// ============================================================================
// COLOUR: SEMANTIC TOKENS ONLY, BOTH MODES
// ============================================================================
// Every surface, hairline, rule and glyph resolves through a token — the rail and
// the skeleton bars are `outline-variant`, the bubble is `surface-container-low`,
// the reply target and the empty plate are `primary-tint`, the "@" run and the
// text controls are `primary`. No literal white/black, no frozen hex. Icons take
// a colour STRING, so they go through `useTokenColor` rather than a class.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.
// This file uses none.

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AvatarWithFallback, Icon } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import {
  communityApi,
  isOwnComment,
  socialKeys,
  PAGE_LIMIT,
  type Comment,
  type Page,
} from "./api";
import { useDeleteComment, useReportComment } from "./postActions";
import { CommentOverflowSheet } from "./PostOverflowSheet";
import { commentByline, initialsFor } from "./bylines";
import { timeAgo } from "./PostCard";

/**
 * `Avatar`'s smaller ramp size, used at BOTH depths.
 *
 * Named once so the skeleton below cannot drift from the row it reserves space
 * for — a skeleton that stops measuring its target guarantees the layout shift it
 * was added to prevent.
 */
const COMMENT_AVATAR = 40;

/**
 * Who the composer is answering.
 *
 * `commentId` is the comment the reader TAPPED, and it is what goes on the wire
 * as `parent_comment_id`. `threadId` is the top-level row that comment belongs
 * to, which is where the new reply will actually land — they differ exactly when
 * the reader is replying to a reply, and conflating them is how a client sends
 * one thread's id and then refreshes another.
 *
 * `name` may be null, and then there is no name anywhere in reply mode: no "@"
 * prefix on the sent reply, and a composer bar that points ("Replying to this
 * comment") instead of naming.
 */
export interface ReplyTarget {
  commentId: string;
  threadId: string;
  name: string | null;
}

/** The comment being answered, resolved to the thread the server will file it under. */
export function replyTargetFor(comment: Comment): ReplyTarget {
  return {
    commentId: comment.id,
    // `parentCommentId ?? id`: the same re-pointing the service does. Replying to
    // a reply belongs to the reply's thread, not to a new one.
    threadId: comment.parentCommentId ?? comment.id,
    name: comment.authorName,
  };
}

interface ThreadProps {
  comment: Comment;
  postId: string;
  viewerId: string | null | undefined;
  expanded: boolean;
  onToggleExpanded: (commentId: string) => void;
  replyTarget: ReplyTarget | null;
  onReply: (target: ReplyTarget) => void;
  onError: (message: string) => void;
}

/** One top-level comment and, once opened, its replies. */
export function CommentThread({
  comment,
  postId,
  viewerId,
  expanded,
  onToggleExpanded,
  replyTarget,
  onReply,
  onError,
}: ThreadProps) {
  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: socialKeys.replies(comment.id),
    queryFn: ({ pageParam }) =>
      communityApi.listReplies(comment.id, { limit: PAGE_LIMIT, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: Page<Comment>) => lastPage.nextOffset ?? undefined,
    // The whole point of the expander: nothing is requested until it is tapped.
    enabled: expanded,
  });

  const replies = (data?.pages ?? []).flatMap((page) => page.items);

  return (
    <View className="w-full gap-2">
      <CommentRow
        comment={comment}
        postId={postId}
        viewerId={viewerId}
        isTarget={replyTarget?.commentId === comment.id}
        onReply={onReply}
        onError={onError}
      />

      {/* Offered on `replyCount` alone — the replies themselves are not fetched
          to decide whether a thread has any. A comment with none gets no
          expander and still gets a Reply affordance. */}
      {!expanded && comment.replyCount > 0 ? (
        <View className="pl-8">
          <ThreadTextButton
            label={comment.replyCount === 1 ? "View 1 reply" : `View ${comment.replyCount} replies`}
            onPress={() => onToggleExpanded(comment.id)}
          />
        </View>
      ) : null}

      {expanded ? (
        <>
          <View className="w-full flex-row items-start gap-3 pl-8">
            {/* The rail. `self-stretch` is what makes it end where the thread
                ends, which is the grouping this design leans on. */}
            <View className="w-px self-stretch bg-outline-variant" />
            <View className="min-w-0 flex-1 gap-3">
              {isPending ? (
                <ReplySkeleton />
              ) : isError ? (
                <ThreadError onRetry={() => void refetch()} />
              ) : replies.length === 0 ? (
                <ThreadEmpty />
              ) : (
                <>
                  {replies.map((reply) => (
                    <CommentRow
                      key={reply.id}
                      comment={reply}
                      postId={postId}
                      viewerId={viewerId}
                      isTarget={replyTarget?.commentId === reply.id}
                      onReply={onReply}
                      onError={onError}
                    />
                  ))}
                  {hasNextPage ? (
                    <ThreadTextButton
                      label={isFetchingNextPage ? "Loading…" : "Show more replies"}
                      busy={isFetchingNextPage}
                      onPress={() => void fetchNextPage()}
                    />
                  ) : null}
                </>
              )}
            </View>
          </View>

          {/* OUTSIDE the rail: this closes the thread rather than paging it. */}
          <View className="pl-8">
            <ThreadTextButton label="Hide replies" onPress={() => onToggleExpanded(comment.id)} />
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * One comment or one reply.
 *
 * ONE component, and now genuinely one shape: since the avatar is 40 at both
 * depths (see the header) the only thing a reply renders differently is that an
 * "@" prefix can appear on it. Depth lives in the wrapper — the indent and the
 * rail — which is where it belongs.
 */
function CommentRow({
  comment,
  postId,
  viewerId,
  isTarget,
  onReply,
  onError,
}: {
  comment: Comment;
  postId: string;
  viewerId: string | null | undefined;
  isTarget: boolean;
  onReply: (target: ReplyTarget) => void;
  onError: (message: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const muted = useTokenColor("on-surface-variant");
  const primary = useTokenColor("primary");
  const report = useReportComment({ onError });
  const remove = useDeleteComment({ onError });

  const isOwn = isOwnComment(comment, viewerId);
  const byline = commentByline(comment.authorName);
  // Initials come from the stored NAME, never from the byline: "Community
  // member" is a role, and deriving CM from it would dress a missing identity up
  // as a present one. Null falls to the silhouette, which is the design's
  // un-named avatar.
  const initials = initialsFor(comment.authorName);

  return (
    <View className="w-full flex-row items-start gap-3">
      <AvatarWithFallback
        size={COMMENT_AVATAR}
        uri={null}
        initials={initials}
        // `tint` is the documented initials treatment — a `primary-tint` plate
        // with `on-surface-variant` initials. NOT `primary`, which is a solid
        // accent fill with white content: that is what the frames drew and what
        // the component's own description rules out.
        //
        // `neutral` is a `surface-container-high` plate with an
        // `on-surface-variant` silhouette — chrome rather than a tint. An
        // un-named author must not borrow the plate a named one gets, and this is
        // the third rung of BRAND's photo -> initials -> silhouette chain.
        tone={initials ? "tint" : "neutral"}
        label={byline}
      />
      <View className="min-w-0 flex-1 gap-1">
        {/* FILL name + intrinsic timestamp. See the header: this is what keeps a
            long name from pushing the timestamp off the row. */}
        <View className="w-full flex-row items-center gap-2">
          <Text
            className={`min-w-0 flex-1 font-label-md text-label-md ${
              comment.authorName ? "text-on-surface" : "text-on-surface-variant"
            }`}
            numberOfLines={1}
          >
            {byline}
          </Text>
          <Text className="shrink-0 font-label-sm text-label-sm text-on-surface-variant">
            {timeAgo(comment.createdAtIso)}
          </Text>
        </View>

        <View
          className={`w-full rounded-md p-3 ${isTarget ? "bg-primary-tint" : "bg-surface-container-low"}`}
        >
          <Text className="font-body-md text-body-md text-on-surface">
            {/* The "@" is the FIRST RUN OF THE SENTENCE, not a row of its own: it
                is grammatically part of the first clause, and a dedicated line
                would cost 22px on every sibling reply and read as a header.

                Rendered only when `replyToName` is non-null. There is no
                fallback — not "@unknown", and never `replyToUserId`, which
                against un-nameable content would be a deanonymisation dressed up
                as a default. */}
            {comment.replyToName ? (
              <Text className="font-inter-semibold" style={{ color: primary }}>
                {`@${comment.replyToName} `}
              </Text>
            ) : null}
            {comment.body}
          </Text>
        </View>

        <View className="w-full flex-row items-center">
          {/* Every comment AND every reply gets this. Replying to a reply is
              legitimate — the server files it as a sibling and records who was
              answered — so withholding the affordance at depth 2 would hide a
              capability the API has. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reply to ${byline}`}
            accessibilityHint="Opens the composer in reply mode"
            onPress={() => onReply(replyTargetFor(comment))}
            className="h-11 items-center justify-center rounded-full px-3 active:opacity-70"
          >
            <Text className="font-label-md text-label-md text-primary">Reply</Text>
          </Pressable>
          <View className="flex-1" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isOwn ? "Comment options: delete" : "Comment options: report"}
            hitSlop={8}
            onPress={() => setMenuOpen(true)}
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
          >
            <Icon chrome="more-horiz" size={18} color={muted} />
          </Pressable>
        </View>
      </View>

      <CommentOverflowSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        isOwn={isOwn}
        // Both mutations already invalidate `socialKeys.all`, and every reply
        // cache is keyed under it — which is what this row needs and could not
        // get from a narrower key. Reporting a reply removes it AND decrements
        // the parent's `replyCount`, and deleting a top-level comment takes its
        // replies with it, so the thread, the count that opened it and the post's
        // `commentCount` all move together and must be re-read together.
        onReport={async (reason) => {
          try {
            await report.mutateAsync({ commentId: comment.id, postId, reason });
            return true;
          } catch {
            return false;
          }
        }}
        onDelete={async () => {
          try {
            await remove.mutateAsync({ postId, commentId: comment.id });
            return true;
          } catch {
            return false;
          }
        }}
      />
    </View>
  );
}

/**
 * The thread's text controls: a leading 16x1 rule and a label.
 *
 * One component for all three ("View N replies", "Show more replies", "Hide
 * replies") because they are the same control in three positions, and the
 * positions — inside the rail or outside it — are what distinguish paging from
 * collapsing. See the header.
 */
function ThreadTextButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(busy), busy: Boolean(busy) }}
      disabled={busy}
      onPress={onPress}
      className="h-11 flex-row items-center gap-2 self-start pr-3 active:opacity-70"
    >
      <View className="h-px w-4 bg-outline-variant" />
      <Text className="font-label-md text-label-md text-primary">{label}</Text>
    </Pressable>
  );
}

/**
 * Loading — SkeletonCard Shape=Reply thread 1095:919.
 *
 * Reserves the geometry of two real two-line replies: a 17 name bar, then a
 * bubble of 12 + 18 + 8 + 18 + 12. A skeleton that no longer measures its target
 * is worse than none, because it guarantees the shift it exists to prevent —
 * which is why the avatar block reads `COMMENT_AVATAR` rather than repeating the
 * number. The frame's 190px total assumed the 28 avatar it drew; the rows are
 * taller with a ramp-size 40, and the bubble still sets the height.
 *
 * The one skeleton in the system with NO card shell, and that is deliberate:
 * every other shape REPLACES a card, this one loads INSIDE one, in the gap
 * opened by tapping "View N replies". A shell here would draw a card inside a
 * card and would reserve a frame the loaded content never has.
 *
 * Bars are `outline-variant`, not `surface-container-high` — that token and
 * `card-surface` resolve to the same value in dark mode, which once rendered a
 * whole skeleton as blank plates.
 */
function ReplySkeleton() {
  return (
    <View
      className="w-full gap-3"
      // A screen reader must never announce placeholder geometry.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[132, 104].map((nameWidth, index) => (
        <View key={nameWidth} className="w-full flex-row items-start gap-3">
          <View
            className="rounded-full bg-outline-variant"
            style={{ height: COMMENT_AVATAR, width: COMMENT_AVATAR }}
          />
          <View className="min-w-0 flex-1 gap-1">
            <View className="h-[17px] rounded-md bg-outline-variant" style={{ width: nameWidth }} />
            <View className="w-full gap-2 p-3">
              <View className="h-[18px] w-full rounded-md bg-outline-variant" />
              <View
                className="h-[18px] rounded-md bg-outline-variant"
                style={{ width: index === 0 ? 188 : 224 }}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Empty — EmptyState Container=Inline, Action=No.
 *
 * This looks impossible and is not. "View N replies" only renders when
 * `replyCount >= 1`, so an empty page means the replies went away between the
 * count and the fetch — and they can: reporting a reply removes it AND
 * decrements `replyCount`, with no threshold and no un-flag route, so the
 * expander can outlive its replies.
 *
 * The copy therefore says what happened. "No replies yet" would be a lie about
 * it, and this is the only place in the product where that removal is visible.
 */
function ThreadEmpty() {
  const glyph = useTokenColor("on-surface-variant");
  return (
    <View className="w-full items-center gap-3 rounded-md p-4">
      {/* `primary-tint` is a SURFACE tint, so its glyph pairs with
          `on-surface-variant` — not `on-primary`, which would be invisible on it
          in light mode. RN has no currentColor, so the pair is passed. */}
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-tint">
        <Icon chrome="chat-bubble-outline" size={24} color={glyph} />
      </View>
      <Text className="w-full text-center font-body-md text-body-md text-on-surface">
        These replies are gone
      </Text>
      <Text className="w-full text-center font-label-sm text-label-sm text-on-surface-variant">
        They were removed or reported since this thread was counted.
      </Text>
    </View>
  );
}

/**
 * Error — ErrorPanel Container=Inline.
 *
 * The parent comment stays readable above this: one failed sub-request must not
 * blank a thread somebody was already reading.
 *
 * Retry is not optional. Meaning is never carried by colour alone either — the
 * glyph, the sentence and the button are three redundant signals, and a red tint
 * on its own would fail. The plate is `error-container` and its glyph is
 * `on-error-container`, that container's own pair.
 */
function ThreadError({ onRetry }: { onRetry: () => void }) {
  const glyph = useTokenColor("on-error-container");
  return (
    <View className="w-full items-center gap-3 rounded-md p-4">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-error-container">
        <Icon chrome="error-outline" size={24} color={glyph} />
      </View>
      <Text className="w-full text-center font-body-md text-body-md text-on-surface">
        We couldn&apos;t load these replies
      </Text>
      <Text className="w-full text-center font-label-sm text-label-sm text-on-surface-variant">
        Check your connection and try again.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry loading replies"
        onPress={onRetry}
        className="h-14 w-full items-center justify-center rounded-md border border-outline-variant active:opacity-70"
      >
        <Text className="font-label-md text-label-md text-on-surface">Try again</Text>
      </Pressable>
    </View>
  );
}
