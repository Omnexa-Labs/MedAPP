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
  isOwnComment,
  isOwnPost,
  socialKeys,
  PAGE_LIMIT,
  type Comment,
  type Page,
  type Post,
} from "./api";
import {
  useBookmarkToggle,
  useDeleteComment,
  useDeletePost,
  useDropPostFromLists,
  useLikeToggle,
  useReportComment,
  useReportPost,
} from "./postActions";
import { CommentOverflowSheet, PostOverflowSheet } from "./PostOverflowSheet";
import { buildPostShareText, timeAgo, toFeedPost } from "./PostCard";

/**
 * The byline for a post or comment.
 *
 * Three cases, and they are NOT the same:
 *   - anonymous post      -> "Anonymous". The name is absent from the database,
 *                            not hidden by the client.
 *   - lookup failed       -> "MedApp member". Someone real wrote it; we just
 *                            could not resolve who at write time.
 *   - resolved            -> the name.
 *
 * A comment can only ever hit the middle case: comments have no anonymous mode.
 *
 * `authorUserId` is NEVER used as a fallback. A raw UUID is a worse byline than
 * none, and on an anonymous post it would deanonymise the author outright.
 */
export function bylineFor(authorName: string | null, isAnonymous: boolean): string {
  if (isAnonymous) return "Anonymous";
  return authorName ?? "MedApp member";
}

export function PostDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const postId = Array.isArray(params.id) ? params.id[0] : params.id;

  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const viewerId = user?.id ?? null;
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

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
    mutationFn: (body: string) => communityApi.commentOnPost(postId as string, body),
    onSuccess: () => {
      setDraft("");
      // Refetch rather than append: the server assigns the id, the timestamp
      // and the resolved author name, and a moderation rule could hold the
      // comment back entirely. An optimistic row would show a comment that may
      // never be published.
      void queryClient.invalidateQueries({ queryKey: socialKeys.comments(postId) });
      // The card's comment_count changed too — every list this post is in.
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
            <AvatarWithFallback size={48} uri={null} initials={null} label={byline} />
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

          <View className="flex-row items-center gap-sm">
            <Text className="font-headline-md text-headline-md text-on-surface">Comments</Text>
            <Text className="font-label-md text-label-md text-on-surface-variant">
              {commentsPending ? post.commentCount : comments.length}
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
            <View className="gap-md">
              {comments.map((c: Comment) => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  postId={post.id}
                  isOwn={isOwnComment(c, viewerId)}
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
        <View className="border-t border-outline-variant bg-surface px-md py-sm">
          <View className="flex-row items-center gap-sm rounded-full bg-field-surface px-base py-xs">
            <View className="flex-1">
              <CommentInput value={draft} onChange={setDraft} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post comment"
              accessibilityState={{ disabled: !canSend, busy: addComment.isPending }}
              disabled={!canSend}
              onPress={() => addComment.mutate(draft.trim())}
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
              style={{ opacity: canSend ? 1 : 0.4 }}
            >
              <Icon chrome="send" size={22} color={spinner} />
            </Pressable>
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

/** One comment, with the action its OWNERSHIP allows. */
function CommentRow({
  comment,
  postId,
  isOwn,
  onError,
}: {
  comment: Comment;
  postId: string;
  isOwn: boolean;
  onError: (message: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const muted = useTokenColor("on-surface-variant");
  const report = useReportComment({ onError });
  const remove = useDeleteComment({ onError });

  // A comment is always attributed, so a null name here only ever means the
  // write-time lookup failed.
  const byline = bylineFor(comment.authorName, false);

  return (
    <View className="flex-row gap-3">
      <AvatarWithFallback size={36} uri={null} initials={null} label={byline} />
      <View className="flex-1 gap-xs">
        <View className="flex-row items-center gap-xs">
          <Text className="font-label-md text-label-md text-on-surface">{byline}</Text>
          <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 12 }}>
            {timeAgo(comment.createdAtIso)}
          </Text>
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
        <View className="rounded-md bg-surface-container-low px-3 py-2">
          <Text className="font-body-md text-on-surface" style={{ fontSize: 15, lineHeight: 22 }}>
            {comment.body}
          </Text>
        </View>
      </View>

      <CommentOverflowSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        isOwn={isOwn}
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

function CommentInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const placeholder = useTokenColor("outline");
  return (
    <TextInput
      accessibilityLabel="Comment input"
      value={value}
      onChangeText={onChange}
      placeholder="Add a comment…"
      placeholderTextColor={placeholder}
      multiline
      className="font-body-md text-body-md text-on-surface"
      style={{ maxHeight: 96 }}
    />
  );
}
