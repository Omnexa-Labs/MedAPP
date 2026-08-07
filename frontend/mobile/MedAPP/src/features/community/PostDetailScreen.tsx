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
// THERE IS NO `GET /v1/social/posts/{id}`, AND THAT SHAPES THIS FILE
// ---------------------------------------------------------------------------
// social_service exposes the FEED and the comments, but no single-post read.
// So the post itself comes out of the react-query cache under
// `["social", "feed"]`, which the Community screen has already populated by the
// time anyone can tap through to here.
//
// The consequence is a real one and is handled rather than ignored: arriving
// with a COLD cache — a deep link, a process restart, a cache eviction — leaves
// nothing to render. Rather than a spinner that never resolves, that case shows
// an explicit "open it from Community" state. A fabricated placeholder post
// would be worse than admitting we cannot load it.
//
// If a single-post route is added later, swap the `useMemo` below for a
// `useQuery` and delete the cold-cache branch. Nothing else changes.
//
// ---------------------------------------------------------------------------
// COMMENTS
// ---------------------------------------------------------------------------
// `GET /v1/social/posts/{id}/comments` — approved only, oldest first, both
// enforced server-side (docs/api/social_service.md). This screen does no
// filtering or sorting of its own; doing so would be a second opinion about
// moderation, held in the client, where it does not belong.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.
// Only expo-router is used.

import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import { AvatarWithFallback, Icon, KeyboardInset } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { communityApi, type Comment, type Post } from "./api";

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
function bylineFor(authorName: string | null, isAnonymous: boolean): string {
  if (isAnonymous) return "Anonymous";
  return authorName ?? "MedApp member";
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export function PostDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const postId = Array.isArray(params.id) ? params.id[0] : params.id;

  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const spinner = useTokenColor("primary");
  const mutedGlyph = useTokenColor("on-surface-variant");

  // The post, out of the feed cache — there is no single-post route. See header.
  const feed = queryClient.getQueryData<Post[]>(["social", "feed"]);
  const post = useMemo(() => (feed ?? []).find((p) => p.id === postId), [feed, postId]);

  const {
    data: comments,
    isPending: commentsPending,
    isError: commentsError,
    refetch,
  } = useQuery({
    queryKey: ["social", "post", postId, "comments"],
    queryFn: () => communityApi.listComments(postId as string),
    enabled: Boolean(postId),
  });

  const addComment = useMutation({
    mutationFn: (body: string) => communityApi.commentOnPost(postId as string, body),
    onSuccess: () => {
      setDraft("");
      // Refetch rather than append: the server assigns the id, the timestamp
      // and the resolved author name, and a moderation rule could hold the
      // comment back entirely. An optimistic row would show a comment that may
      // never be published.
      void queryClient.invalidateQueries({ queryKey: ["social", "post", postId, "comments"] });
      // The feed card's comment_count changed too.
      void queryClient.invalidateQueries({ queryKey: ["social", "feed"] });
    },
  });

  // Cold cache: nothing to show, and nothing to invent.
  if (!post) {
    return (
      <DetailShell title="Post" testID="post-detail-screen">
        <View className="flex-1 items-center justify-center gap-sm px-lg">
          <Text className="text-center font-headline-md text-headline-md text-on-surface">
            This post isn&apos;t loaded
          </Text>
          <Text className="text-center font-body-md text-body-md text-on-surface-variant">
            Open it from Community and it will appear here.
          </Text>
        </View>
      </DetailShell>
    );
  }

  const canSend = draft.trim().length > 0 && !addComment.isPending;

  return (
    <DetailShell title="Post" claimsBottomInset={false} testID="post-detail-screen">
      <KeyboardInset>
        <ScrollView className="flex-1" contentContainerClassName="gap-lg px-md py-md">
          {/* Author. Initials, not an avatar — nothing in the backend stores one. */}
          <View className="flex-row items-center gap-3">
            <AvatarWithFallback
              size={48}
              uri={null}
              initials={null}
              label={bylineFor(post.authorName, post.isAnonymous)}
            />
            <View className="flex-1">
              <Text className="font-label-md text-label-md text-on-surface" numberOfLines={1}>
                {bylineFor(post.authorName, post.isAnonymous)}
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

          <View className="flex-row items-center gap-lg">
            <View className="flex-row items-center gap-xs">
              <Icon chrome="favorite-border" size={20} color={mutedGlyph} />
              <Text className="font-label-md text-label-md text-on-surface-variant">
                {post.likeCount}
              </Text>
            </View>
            <View className="flex-row items-center gap-xs">
              <Icon chrome="chat-bubble-outline" size={20} color={mutedGlyph} />
              <Text className="font-label-md text-label-md text-on-surface-variant">
                {post.commentCount}
              </Text>
            </View>
          </View>

          <View className="h-px bg-outline-variant" />

          <View className="flex-row items-center gap-sm">
            <Text className="font-headline-md text-headline-md text-on-surface">Comments</Text>
            <Text className="font-label-md text-label-md text-on-surface-variant">
              {comments?.length ?? post.commentCount}
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
          ) : (comments?.length ?? 0) === 0 ? (
            <Text className="font-body-md text-body-md text-on-surface-variant">
              No comments yet. Be the first to reply.
            </Text>
          ) : (
            <View className="gap-md">
              {(comments ?? []).map((c: Comment) => (
                <View key={c.id} className="flex-row gap-3">
                  {/* A comment is always attributed, so a null name here only
                      ever means the write-time lookup failed. */}
                  <AvatarWithFallback
                    size={36}
                    uri={null}
                    initials={null}
                    label={bylineFor(c.authorName, false)}
                  />
                  <View className="flex-1 gap-xs">
                    <View className="flex-row items-center gap-xs">
                      <Text className="font-label-md text-label-md text-on-surface">
                        {bylineFor(c.authorName, false)}
                      </Text>
                      <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 12 }}>
                        {timeAgo(c.createdAtIso)}
                      </Text>
                    </View>
                    <View className="rounded-md bg-surface-container-low px-3 py-2">
                      <Text
                        className="font-body-md text-on-surface"
                        style={{ fontSize: 15, lineHeight: 22 }}
                      >
                        {c.body}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
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
              accessibilityState={{ disabled: !canSend }}
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
    </DetailShell>
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
