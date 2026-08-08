// PostDetailScreen — Figma `community — post detail` 1066:2025,
// dark proof 1069:2106, page 949:10202.
//
// ---------------------------------------------------------------------------
// WHY THIS SCREEN EXISTS
// ---------------------------------------------------------------------------
// The feed card renders "read more" and a comment count. Both promised a
// destination and neither had one — the dead-control defect this codebase has
// been removing throughout. This is that destination.
//
// ---------------------------------------------------------------------------
// `GET /v1/social/posts/{id}` NOW EXISTS, AND THE CACHE WORKAROUND IS GONE
// ---------------------------------------------------------------------------
// This screen used to read the post out of the react-query cache under
// `["social", "feed"]`, because social_service had no single-post route. That
// forced an explicit "open it from Community" dead end for a cold cache — a
// deep link, a process restart, an eviction — and made the screen unreachable by
// URL.
//
// The route shipped, returning the same shape as a feed row with counts and
// per-viewer flags included, so this is a plain `useQuery` and the dead-end
// branch is DELETED. What replaces it is an honest error state: a 404 here means
// the post is missing OR flagged, and a post that was reported is meant to stop
// opening — letting a saved link still reach it would make reporting cosmetic.
//
// ---------------------------------------------------------------------------
// THE ENGAGEMENT ROW WAS DECORATION
// ---------------------------------------------------------------------------
// The like and comment counters here were plain `<View>`s: icon, number, no
// handler, no press feedback, sitting in the exact position the feed card puts
// working buttons. Like is now the same real, optimistic, rolled-back mutation
// the card uses, and the screen gained the share / save / overflow actions it
// had none of.
//
// ---------------------------------------------------------------------------
// COMMENTS
// ---------------------------------------------------------------------------
// `GET /v1/social/posts/{id}/comments` — approved only, oldest first, both
// enforced server-side. This screen does no filtering or sorting of its own;
// doing so would be a second opinion about moderation, held in the client, where
// it does not belong. Paged like everything else, oldest first, so a "Load
// earlier"-style jump is not needed: new comments land at the END and the next
// page is simply more of them.
//
// ---------------------------------------------------------------------------
// THAT LIST IS TOP-LEVEL ONLY, AND THE HEADER COUNT IS NOT ITS LENGTH
// ---------------------------------------------------------------------------
// Since 2026-08-08 the route returns top-level comments with a `replyCount` each;
// replies come from `GET /comments/{id}/replies` when a reader opens a thread.
// `Post.commentCount` counts replies, so it LEGITIMATELY exceeds the number of
// visible threads, and the header shows the post's total because that is what the
// card the reader tapped showed them. A reader who counts will find the numbers
// only add up once every thread is expanded; there is no label short enough to
// explain that, and quietly showing the smaller number instead would misreport
// how much discussion is on the post.
//
// ---------------------------------------------------------------------------
// THE COMPOSER HAS TWO MODES AND THE SERVER OWNS WHERE A REPLY LANDS
// ---------------------------------------------------------------------------
// Reply mode is stated twice — a bar above the composer names the target, and the
// target's own bubble is tinted — because one signal that scrolls out of view is
// no signal. See `CommentThread` for the two-level rule; the part that matters
// HERE is that the `parentCommentId` on the created comment is not always the id
// this screen sent, so which thread gets refreshed and opened is read off the
// RESPONSE.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.
// Only expo-router is used.

import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import { AvatarWithFallback, Icon, KeyboardInset } from "@/components/ui";
import { Toast, useToast } from "@/components/feedback";
import { useTokenColor } from "@/lib/tokens";
import { shareText } from "@/lib/share";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  communityApi,
  isOwnPost,
  socialKeys,
  PAGE_LIMIT,
  type Comment,
  type Page,
  type Post,
} from "./api";
import {
  useBookmarkToggle,
  useDeletePost,
  useDropPostFromLists,
  useLikeToggle,
  useReportPost,
} from "./postActions";
import { PostOverflowSheet } from "./PostOverflowSheet";
import { buildPostShareText, timeAgo, toFeedPost } from "./PostCard";
import { CommentThread, type ReplyTarget } from "./CommentThread";
import { bylineFor, initialsFor } from "./bylines";

export function PostDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const postId = Array.isArray(params.id) ? params.id[0] : params.id;

  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const viewerId = user?.id ?? null;
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  /** Null = the composer writes a top-level comment. */
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  /**
   * Which threads are open, keyed on the TOP-LEVEL comment id.
   *
   * Held here rather than inside each thread so that posting a reply can open the
   * thread the SERVER filed it under — which is not always the one the reader was
   * looking at, since replying to a reply lands on that reply's parent.
   */
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const toggleThread = (commentId: string) =>
    setOpenThreads((open) => ({ ...open, [commentId]: !open[commentId] }));

  const spinner = useTokenColor("primary");
  const primary = useTokenColor("primary");
  const mutedGlyph = useTokenColor("on-surface-variant");
  const errorColor = useTokenColor("error");
  const { message: toastMessage, tone: toastTone, show: showToast, clear: clearToast } = useToast();
  const onError = (message: string) => showToast("error", message);

  const {
    data: post,
    isPending: postPending,
    isError: postError,
    refetch: refetchPost,
    isRefetching: postRefetching,
  } = useQuery({
    // Keyed on VIEWER + post: `liked_by_me` and `bookmarked_by_me` are computed
    // from the caller, so a key on post id alone serves one user's like state to
    // the next account signed in on the device.
    queryKey: socialKeys.post(viewerId, postId),
    queryFn: () => communityApi.getPost(postId as string),
    enabled: Boolean(postId),
  });

  const {
    data: commentPages,
    isPending: commentsPending,
    isError: commentsError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    // Viewer-free on purpose: `CommentOut` carries no per-viewer field, so this
    // cache is correct for anyone and survives an account switch.
    queryKey: socialKeys.comments(postId),
    queryFn: ({ pageParam }) =>
      communityApi.listComments(postId as string, { limit: PAGE_LIMIT, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: Page<Comment>) => lastPage.nextOffset ?? undefined,
    enabled: Boolean(postId),
  });

  const comments = useMemo(
    () => (commentPages?.pages ?? []).flatMap((page) => page.items),
    [commentPages],
  );

  const like = useLikeToggle({ viewerId, onError });
  const bookmark = useBookmarkToggle({ viewerId, onError });
  const report = useReportPost({ viewerId, onError });
  const removePost = useDeletePost({ viewerId, onError });
  const dropFromLists = useDropPostFromLists({ viewerId });

  /**
   * Leave after the post stops existing for this reader — reported or deleted.
   *
   * Staying would repaint this screen as "This post isn't available", which is
   * the right copy for arriving at a dead link and the wrong one for an action
   * the user just took deliberately.
   */
  const leaveAfterRemoval = () => {
    dropFromLists(postId as string);
    if (router.canGoBack()) router.back();
  };

  const addComment = useMutation({
    mutationFn: ({ body, target }: { body: string; target: ReplyTarget | null }) =>
      // The id sent is the comment the reader ANSWERED, which is not necessarily
      // where the row will live. See `onSuccess`.
      communityApi.commentOnPost(postId as string, body, target?.commentId),
    onSuccess: (created: Comment) => {
      setDraft("");
      setReplyTarget(null);
      // THE PARENT ID CAME BACK FROM THE SERVER AND MAY NOT BE THE ONE WE SENT.
      //
      // A reply to a reply is filed against that reply's own top-level parent, so
      // `created.parentCommentId` is the only trustworthy answer to "which thread
      // did this land in". Opening the thread we SENT would leave the reader
      // staring at a closed thread, or an open one their reply is not in.
      if (created.parentCommentId) {
        setOpenThreads((open) => ({ ...open, [created.parentCommentId as string]: true }));
      }
      // Refetch rather than append: the server assigns the id, the timestamp
      // and the resolved author name, and a moderation rule could hold the
      // comment back entirely. An optimistic row would show a comment that may
      // never be published — and for a reply it would also have to guess
      // `replyToName`, which is snapshotted server-side.
      void queryClient.invalidateQueries({ queryKey: socialKeys.comments(postId) });
      // The card's comment_count changed too — every list this post is in — and
      // every open thread's replies plus the parent's replyCount hang under the
      // same root.
      void queryClient.invalidateQueries({ queryKey: socialKeys.all });
    },
    onError: () => onError("Couldn't post your comment. Check your connection and try again."),
  });

  if (postPending) {
    return (
      <DetailShell title="Post" testID="post-detail-screen">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={spinner} />
        </View>
      </DetailShell>
    );
  }

  // The cold-cache dead end is GONE. This is a real failure now: the post is
  // missing, or it was reported and is therefore no longer readable by anyone.
  // Both are 404, and the client cannot tell them apart — nor should it, since
  // "this was flagged" is a claim about someone else's content.
  if (postError || !post) {
    return (
      <DetailShell title="Post" testID="post-detail-screen">
        <View className="flex-1 items-center justify-center gap-sm px-lg">
          <Text className="text-center font-headline-md text-headline-md text-on-surface">
            This post isn&apos;t available
          </Text>
          <Text className="text-center font-body-md text-body-md text-on-surface-variant">
            It may have been removed by its author, or hidden while a moderator reviews it.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading the post"
            onPress={() => refetchPost()}
            disabled={postRefetching}
            className="mt-sm min-h-[44px] justify-center rounded-full border border-outline px-lg active:opacity-70"
          >
            <Text className="font-label-md text-label-md text-on-surface">
              {postRefetching ? "Retrying…" : "Try again"}
            </Text>
          </Pressable>
        </View>
      </DetailShell>
    );
  }

  const canSend = draft.trim().length > 0 && !addComment.isPending;
  const byline = bylineFor(post.authorName, post.isAnonymous);
  const share = () => {
    void shareText(buildPostShareText(toFeedPost(post, viewerId)), {
      dialogTitle: "Share post",
      subject: `${byline} on MedApp`,
    });
  };

  return (
    <DetailShell
      title="Post"
      claimsBottomInset={false}
      testID="post-detail-screen"
      // The card's overflow, in the app bar's action slot — the natural place
      // for a screen-level menu, and the bar enforces the 44pt target itself.
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More options"
          accessibilityHint="Save, share, report or delete this post"
          onPress={() => setMenuOpen(true)}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
        >
          <Icon chrome="more-vert" size={22} color={mutedGlyph} />
        </Pressable>
      }
    >
      <KeyboardInset>
        <ScrollView className="flex-1" contentContainerClassName="gap-lg px-md py-md">
          {/* Author. Initials, not an avatar — nothing in the backend stores one. */}
          <View className="flex-row items-center gap-3">
            {/* 56, the post-author size on `Avatar`'s ramp — it was a hand-rolled
                48. Initials from the stored NAME only: an anonymous post and a
                failed lookup both yield null and fall to the silhouette, which is
                correct for both, because "Anonymous" is not a name to abbreviate.
                `tint` rather than `primary` is the documented initials plate. */}
            <AvatarWithFallback
              size={56}
              uri={null}
              initials={initialsFor(post.authorName)}
              tone={post.authorName ? "tint" : "neutral"}
              label={byline}
            />
            <View className="flex-1">
              <Text className="font-label-md text-label-md text-on-surface" numberOfLines={1}>
                {byline}
              </Text>
              <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 13 }}>
                {post.authorRole} · {timeAgo(post.createdAtIso)}
              </Text>
            </View>
          </View>

          {/* The post in FULL. No clamp and no "read more": this screen IS the
              read-more, and repeating the affordance would loop the reader back
              to where they already are. */}
          <View className="gap-sm">
            <Text className="font-headline-md text-headline-md text-on-surface">{post.title}</Text>
            <Text className="font-body-md text-body-md text-on-surface" style={{ lineHeight: 26 }}>
              {post.body}
            </Text>
          </View>

          {/* Was three inert `<View>`s. Every one of these is a control now, and
              they carry the same state as the feed card because both read the
              same per-viewer flags out of the same cache. */}
          <View className="flex-row items-center gap-lg">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={post.likedByMe ? "Unlike" : "Like"}
              accessibilityState={{
                selected: post.likedByMe,
                disabled: like.isPending,
                busy: like.isPending,
              }}
              disabled={like.isPending}
              onPress={() => like.mutate({ postId: post.id, next: !post.likedByMe })}
              className="flex-row items-center gap-xs active:scale-95"
              style={{ opacity: like.isPending ? 0.5 : 1 }}
            >
              <Icon
                chrome={post.likedByMe ? "favorite" : "favorite-border"}
                size={20}
                color={post.likedByMe ? errorColor : mutedGlyph}
              />
              <Text className="font-label-md text-label-md text-on-surface-variant">
                {post.likeCount}
              </Text>
            </Pressable>
            {/* Comments are already on this screen, so this stays a readout —
                but it is a readout that LOOKS like one: no press feedback, and
                hidden from the a11y tree as a button. */}
            <View className="flex-row items-center gap-xs">
              <Icon chrome="chat-bubble-outline" size={20} color={mutedGlyph} />
              <Text className="font-label-md text-label-md text-on-surface-variant">
                {post.commentCount}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share"
              onPress={share}
              className="active:scale-95"
            >
              <Icon chrome="share" size={20} color={mutedGlyph} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={post.bookmarkedByMe ? "Remove bookmark" : "Bookmark"}
              accessibilityState={{
                selected: post.bookmarkedByMe,
                disabled: bookmark.isPending,
                busy: bookmark.isPending,
              }}
              disabled={bookmark.isPending}
              onPress={() => bookmark.mutate({ postId: post.id, next: !post.bookmarkedByMe })}
              className="active:scale-95"
              style={{ opacity: bookmark.isPending ? 0.5 : 1 }}
            >
              <Icon
                chrome={post.bookmarkedByMe ? "bookmark" : "bookmark-border"}
                size={20}
                color={post.bookmarkedByMe ? primary : mutedGlyph}
              />
            </Pressable>
          </View>

          <View className="h-px bg-outline-variant" />

          <View className="flex-row items-center gap-2">
            <Text className="font-headline-md text-headline-md text-on-surface">Comments</Text>
            {/* The POST's total, replies included — deliberately not the number of
                threads below it. `comment_count` is what the feed card the reader
                tapped showed them, and it counts replies; the list is top-level
                only. Substituting `comments.length` would make the two screens
                disagree and would under-report the discussion. */}
            <Text
              testID="comments-count"
              className="font-label-md text-label-md text-on-surface-variant"
            >
              {post.commentCount}
            </Text>
          </View>

          {commentsPending ? (
            <View className="items-center py-xl">
              <ActivityIndicator color={spinner} />
            </View>
          ) : commentsError ? (
            <View className="items-center gap-sm py-xl">
              <Text className="font-label-md text-label-md text-on-surface">
                Couldn&apos;t load the comments
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading comments"
                onPress={() => refetch()}
                className="min-h-[44px] justify-center rounded-full border border-outline px-lg active:opacity-70"
              >
                <Text className="font-label-md text-label-md text-on-surface">Try again</Text>
              </Pressable>
            </View>
          ) : comments.length === 0 ? (
            <Text className="font-body-md text-body-md text-on-surface-variant">
              No comments yet. Be the first to reply.
            </Text>
          ) : (
            <View className="gap-4">
              {comments.map((c: Comment) => (
                <CommentThread
                  key={c.id}
                  comment={c}
                  postId={post.id}
                  viewerId={viewerId}
                  expanded={Boolean(openThreads[c.id])}
                  onToggleExpanded={toggleThread}
                  replyTarget={replyTarget}
                  onReply={setReplyTarget}
                  onError={onError}
                />
              ))}
              {hasNextPage ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Load more comments"
                  accessibilityState={{ disabled: isFetchingNextPage, busy: isFetchingNextPage }}
                  disabled={isFetchingNextPage}
                  onPress={() => void fetchNextPage()}
                  className="min-h-[44px] items-center justify-center rounded-full border border-outline active:opacity-70"
                >
                  <Text className="font-label-md text-label-md text-on-surface">
                    {isFetchingNextPage ? "Loading…" : "Load more comments"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>

        {/* Composer, docked. `claimsBottomInset={false}` above because this
            claims the inset itself, the same contract the chat screens use. */}
        <View>
          {/* Reply mode, signal 2 of 2 — the target's own bubble is tinted up in
              the thread, and this bar names them. Two signals because the tinted
              bubble scrolls away and the bar does not, and because meaning must
              never rest on a tint alone.

              `primary-tint` with a 1px TOP hairline and no shadow, the same chrome
              rule the docked composer below already follows. */}
          {replyTarget ? (
            <View className="flex-row items-center gap-2 border-t border-outline-variant bg-primary-tint px-md py-2">
              {/* A null name gets a POINTER, not an invented identity: no "@", no
                  "member", and never `replyToUserId`. The WORD changes as well as
                  the emphasis, so the two cases are distinguishable without
                  reading a font weight.

                  Two sibling <Text>s rather than one with a nested run: only the
                  name may truncate, and a nested run would take the whole
                  sentence's `numberOfLines` with it and clip "Replying to" first
                  on a long name. */}
              {replyTarget.name ? (
                <View className="min-w-0 flex-1 flex-row items-center gap-1">
                  <Text className="shrink-0 font-body-md text-body-md text-on-surface">
                    Replying to
                  </Text>
                  <Text
                    className="min-w-0 flex-1 font-inter-semibold text-body-md text-on-surface"
                    numberOfLines={1}
                  >
                    {replyTarget.name}
                  </Text>
                </View>
              ) : (
                <Text className="min-w-0 flex-1 font-body-md text-body-md text-on-surface">
                  Replying to this comment
                </Text>
              )}
              {/* A 44pt TEXT control, not an X: the icon registry has no close
                  glyph for this and "Cancel" needs no asset to be unambiguous. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
                accessibilityHint="Returns the composer to a top-level comment"
                onPress={() => setReplyTarget(null)}
                className="h-11 shrink-0 justify-center px-2 active:opacity-70"
              >
                <Text className="font-label-md text-label-md text-primary">Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          <View className="border-t border-outline-variant bg-surface px-md py-sm">
            <View className="flex-row items-center gap-sm rounded-full bg-field-surface px-base py-xs">
              <View className="flex-1">
                <CommentInput
                  value={draft}
                  onChange={setDraft}
                  // The placeholder names the target too, so reply mode stays
                  // legible when the bar above has scrolled out of view on a small
                  // screen. It carries no "@" — that prefix is written
                  // server-side from the target's stored name, and pre-filling it
                  // into an editable field would let the reader change it until
                  // what is rendered disagrees with what is stored.
                  placeholder={
                    replyTarget
                      ? replyTarget.name
                        ? `Reply to ${replyTarget.name}…`
                        : "Write a reply…"
                      : "Add a comment…"
                  }
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={replyTarget ? "Post reply" : "Post comment"}
                accessibilityState={{ disabled: !canSend, busy: addComment.isPending }}
                disabled={!canSend}
                onPress={() => addComment.mutate({ body: draft.trim(), target: replyTarget })}
                className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
                style={{ opacity: canSend ? 1 : 0.4 }}
              >
                <Icon chrome="send" size={22} color={spinner} />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardInset>

      <PostOverflowSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        // Computed here from the wire field and passed as a BOOLEAN — the id
        // itself never reaches a component that could render it, which is what
        // keeps delete-own working on an ANONYMOUS post without exposing who
        // wrote it. See PostCard's header.
        isOwn={isOwnPost(post, viewerId)}
        bookmarked={post.bookmarkedByMe}
        onToggleBookmark={() =>
          bookmark.mutate({ postId: post.id, next: !post.bookmarkedByMe })
        }
        onShare={share}
        onReport={async (reason) => {
          try {
            await report.mutateAsync({ postId: post.id, reason });
            return true;
          } catch {
            return false;
          }
        }}
        onReported={leaveAfterRemoval}
        onDelete={async () => {
          try {
            await removePost.mutateAsync({ postId: post.id });
            leaveAfterRemoval();
            return true;
          } catch {
            return false;
          }
        }}
      />

      <Toast message={toastMessage} tone={toastTone} onDismiss={clearToast} />
    </DetailShell>
  );
}

function CommentInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Names the reply target when there is one — see the call site. */
  placeholder: string;
}) {
  const placeholderColor = useTokenColor("outline");
  return (
    <TextInput
      // Deliberately stable across both modes. It is the same field and the same
      // draft either way, and a label that renamed itself would break every
      // existing reference to it for no gain — the mode is announced by the bar
      // above and by the placeholder.
      accessibilityLabel="Comment input"
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={placeholderColor}
      multiline
      className="font-body-md text-body-md text-on-surface"
      style={{ maxHeight: 96 }}
    />
  );
}
