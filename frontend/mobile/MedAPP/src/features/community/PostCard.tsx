// The post card — one row of the Community feed, and of the Saved list.
//
// ============================================================================
// EXTRACTED SO SAVED POSTS IS NOT A SECOND COPY
// ============================================================================
// This was private to CommunityScreen. `GET /v1/social/me/bookmarks` returns the
// SAME `PostList` envelope as the feed, deliberately so one mapper and one card
// serve both, and the alternative was a second card that would have drifted on
// the like wiring within a release.
//
// ============================================================================
// `FeedPost` CARRIES NO AUTHOR ID, AND THAT IS THE ANONYMITY GUARANTEE
// ============================================================================
// `PostOut.author_user_id` is on the wire for an ANONYMOUS post too — the
// backend's anonymity lives in `author_name` being absent from the row, not in
// the id being withheld. So the invariant cannot be "remember not to render it";
// it has to be structural. `toFeedPost` is the choke point: it reads the id to
// answer ONE question — is this the viewer's own post, so should Delete appear —
// and puts the boolean `isOwn` on the view model. The id itself never crosses
// into a component, so no `<Text>` in this file or the sheet it opens can print
// it, today or after the next edit.
//
// ============================================================================
// LIKE AND BOOKMARK ARE REAL NOW
// ============================================================================
// Both were `useState` toggles that called nothing. Initial state is
// `likedByMe` / `bookmarkedByMe` from the server, the tap mutates optimistically
// and rolls back on failure, and the failure is spoken through `onError` — see
// ./postActions.ts. There is no local `liked` state left to disagree with the
// cache.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. Only expo-router is used.

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { AvatarWithFallback, Icon } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { shareText } from "@/lib/share";
import { shareLinkLine } from "@/lib/share-links";
import { isOwnPost, type Post } from "./api";
import {
  useBookmarkToggle,
  useDeletePost,
  useDropPostFromLists,
  useLikeToggle,
  useReportPost,
} from "./postActions";
import { PostOverflowSheet } from "./PostOverflowSheet";

/**
 * A post as the card draws it.
 *
 * Every field maps to something `PostOut` actually returns. The shape used to
 * carry `avatarUri`, `imageUri`, `imageBadge`, `infoCard`, `followedByUser`,
 * `groupId`, `clampBody` and `readMore`; the wire has none of them, so only the
 * hardcoded mock ever set one and every branch reading them was unreachable
 * against live data.
 *
 * There is deliberately no `authorUserId` — see the header.
 */
export interface FeedPost {
  id: string;
  author: string;
  role: string;
  ago: string;
  /** Returned by the server and dropped by the old card. See the note in the JSX. */
  title: string;
  excerpt: string | null;
  body: string;
  likes: number;
  comments: number;
  liked: boolean;
  bookmarked: boolean;
  /** Whether the viewer wrote it. A boolean, never an id. */
  isOwn: boolean;
}

/** Short relative time for the byline. */
export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

/**
 * Open the post detail screen.
 *
 * `push`, not `navigate`: a detail screen is a genuine stack entry, and back
 * must return to the list at its scroll position.
 */
export function openPost(id: string) {
  router.push({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pathname: "/(app)/post-detail" as any,
    params: { id },
  });
}

/**
 * `Post` (wire) -> `FeedPost` (what the card draws).
 *
 * `authorName` is null in TWO cases that must not be conflated: the post is
 * anonymous, and the write-time lookup failed. Anonymous gets "Anonymous"; a
 * failed lookup gets "MedApp member". Neither ever falls back to the author id.
 *
 * No avatar: nothing in the backend stores one for a patient, so
 * `AvatarWithFallback` renders initials (PO decision, v1).
 */
export function toFeedPost(p: Post, viewerId: string | null | undefined): FeedPost {
  const author = p.isAnonymous ? "Anonymous" : (p.authorName ?? "MedApp member");
  return {
    id: p.id,
    author,
    role: p.authorRole,
    ago: timeAgo(p.createdAtIso),
    title: p.title,
    excerpt: p.excerpt,
    body: p.body,
    likes: p.likeCount,
    comments: p.commentCount,
    liked: p.likedByMe,
    bookmarked: p.bookmarkedByMe,
    isOwn: isOwnPost(p, viewerId),
  };
}

/**
 * The text body behind a post's Share action.
 *
 * TEXT, via React Native's own sheet — not a file. A post is a paragraph
 * somebody pastes into a chat; wrapping it in a `.txt` attachment would make
 * the recipient open a document to read three sentences. See @/lib/share for
 * the full argument.
 *
 * IT NOW CARRIES A LINK, and the note that used to say it could not is gone.
 * That note was right when it was written — the screen resolved a post out of
 * the feed cache, so a link opened a dead end from a cold start. `GET
 * /v1/social/posts/{id}` shipped and PostDetailScreen is a plain `useQuery` on
 * it, so `medapp://post-detail?id=…` genuinely loads the post on a fresh
 * launch. The link is the POST ID only; @/lib/share-links is where the scheme,
 * the no-`https` decision and the "no link rather than a dead one" rule live,
 * and it returns null in the runtimes where the URL would not resolve — this
 * function drops the line rather than substituting anything.
 *
 * WHAT IS STILL DELIBERATELY LEFT OUT:
 *
 *   * `post.ago` ("2h ago"). It is relative to the moment the reader opened the
 *     app, and the share is read later and elsewhere. There is no absolute
 *     timestamp on `FeedPost` to substitute, so the share carries no date at
 *     all rather than a wrong one.
 *
 *   * The like and comment counts. Engagement on our feed is not part of what
 *     the reader is being told.
 *
 *   * The author's id, on an anonymous post or any other. The link addresses
 *     the POST; nothing about the person who wrote it is in the URL. See this
 *     file's header for why that invariant is structural rather than remembered.
 */
export function buildPostShareText(post: FeedPost): string {
  const attribution = `${post.author} · ${post.role}`;
  return [
    attribution,
    post.body,
    "Shared from the MedApp community.",
    shareLinkLine({ kind: "post", id: post.id }),
  ]
    .filter((line): line is string => !!line)
    .join("\n\n");
}

export interface PostCardProps {
  post: FeedPost;
  /** For the per-viewer cache keys the mutations patch. */
  viewerId: string | null | undefined;
  /** How a failed mutation reaches the user. Required — no silent failures. */
  onError: (message: string) => void;
}

export function PostCard({ post, viewerId, onError }: PostCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Glyph colours by TOKEN. These were `#3d4947` and `#00685f` literals — the
  // LIGHT values of `on-surface-variant` and `primary` frozen in JS, which in
  // dark mode paint a near-black glyph on a near-black card.
  const muted = useTokenColor("on-surface-variant");
  const primary = useTokenColor("primary");
  const error = useTokenColor("error");

  const like = useLikeToggle({ viewerId, onError });
  const bookmark = useBookmarkToggle({ viewerId, onError });
  const report = useReportPost({ viewerId, onError });
  const remove = useDeletePost({ viewerId, onError });
  const dropFromLists = useDropPostFromLists({ viewerId });

  const share = () => {
    void shareText(buildPostShareText(post), {
      dialogTitle: "Share post",
      subject: `${post.author} on MedApp`,
    });
  };

  return (
    // FLAGGED for a later pass, NOT adopted onto the shared <Card />: this card
    // is edge-to-edge — the action bar bleeds to the border and each section
    // carries its own padding — while <Card /> applies a single 24px inset to
    // everything inside it. The hairline is full-strength `outline-variant`
    // (BRAND's hairline token) since it is the only separation left.
    <View className="overflow-hidden rounded-[20px] border border-outline-variant bg-card-surface">
      {/* Header. The verified tick that sat beside the name is gone: nothing on
          `PostOut` says an author is verified, and patients publish here too, so
          it decorated every byline in the feed with a trust claim the backend
          never made. */}
      <View className="flex-row items-start gap-sm p-md">
        <AvatarWithFallback size={48} uri={null} initials={null} label={post.author} />
        <View className="flex-1">
          <Text className="font-label-md text-label-md text-on-surface">{post.author}</Text>
          <Text className="font-label-sm text-label-sm text-on-surface-variant">
            {post.role} • {post.ago}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More options"
          accessibilityHint="Save, share, report or delete this post"
          hitSlop={8}
          onPress={() => setMenuOpen(true)}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
        >
          <Icon chrome="more-vert" size={22} color={muted} />
        </Pressable>
      </View>

      {/* TITLE AND EXCERPT WERE BEING THROWN AWAY. `PostCreate` requires a
          title and the feed returns it on every row, and this card rendered
          `body` alone — a hangover from the deleted mock, whose fixture had no
          title to render. The detail screen has always drawn it, so the same
          post had a heading on one screen and none on the other.

          The excerpt is the author's own one-line summary and is shown INSTEAD
          of the body when present: two clamped paragraphs saying the same thing
          twice is what a summary field exists to avoid. `body` is the fallback
          for the rows that have no excerpt. Clamped either way — `body` is
          unbounded on the wire, and a live 2000-character post pushed every
          other card off the screen when the clamp was per-post and only the
          mock ever set it. */}
      <View className="px-md pb-sm">
        <Text className="font-label-md text-label-md text-on-surface" numberOfLines={2}>
          {post.title}
        </Text>
        <Text className="mt-xs font-body-md text-body-md text-on-surface" numberOfLines={3}>
          {post.excerpt?.trim() ? post.excerpt : post.body}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Read more: ${post.title || post.author}`}
          hitSlop={6}
          className="mt-sm self-start"
          onPress={() => openPost(post.id)}
        >
          <Text className="font-label-sm text-label-sm text-primary">Read more</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center justify-between border-t border-surface-variant p-md">
        <View className="flex-row gap-lg">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={post.liked ? "Unlike" : "Like"}
            accessibilityState={{ selected: post.liked, disabled: like.isPending, busy: like.isPending }}
            disabled={like.isPending}
            onPress={() => like.mutate({ postId: post.id, next: !post.liked })}
            className="flex-row items-center gap-xs active:scale-95"
            style={{ opacity: like.isPending ? 0.5 : 1 }}
          >
            <Icon
              chrome={post.liked ? "favorite" : "favorite-border"}
              size={22}
              color={post.liked ? error : muted}
            />
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              {post.likes}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Comment"
            className="flex-row items-center gap-xs active:scale-95"
            onPress={() => openPost(post.id)}
          >
            <Icon chrome="chat-bubble-outline" size={22} color={muted} />
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              {post.comments}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share"
            onPress={share}
            className="flex-row items-center active:scale-95"
          >
            <Icon chrome="share" size={22} color={muted} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.bookmarked ? "Remove bookmark" : "Bookmark"}
          accessibilityState={{
            selected: post.bookmarked,
            disabled: bookmark.isPending,
            busy: bookmark.isPending,
          }}
          disabled={bookmark.isPending}
          onPress={() => bookmark.mutate({ postId: post.id, next: !post.bookmarked })}
          className="active:scale-95"
          style={{ opacity: bookmark.isPending ? 0.5 : 1 }}
        >
          <Icon
            chrome={post.bookmarked ? "bookmark" : "bookmark-border"}
            size={22}
            color={post.bookmarked ? primary : muted}
          />
        </Pressable>
      </View>

      <PostOverflowSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        // The boolean, not the id. See the header.
        isOwn={post.isOwn}
        bookmarked={post.bookmarked}
        onToggleBookmark={() => bookmark.mutate({ postId: post.id, next: !post.bookmarked })}
        onShare={share}
        onReport={async (reason) => {
          try {
            await report.mutateAsync({ postId: post.id, reason });
            return true;
          } catch {
            // `onError` on the mutation has already raised the message; the
            // boolean only tells the sheet not to claim success.
            return false;
          }
        }}
        onReported={() => dropFromLists(post.id)}
        onDelete={async () => {
          try {
            await remove.mutateAsync({ postId: post.id });
            return true;
          } catch {
            return false;
          }
        }}
      />
    </View>
  );
}
