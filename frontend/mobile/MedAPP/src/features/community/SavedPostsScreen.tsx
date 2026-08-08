// Saved posts — `GET /v1/social/me/bookmarks`.
//
// ============================================================================
// WHY THIS SCREEN EXISTS: bookmarking wrote into a black hole
// ============================================================================
// The card's bookmark control is now a real `POST /posts/{id}/bookmark`, and
// before this screen there was NO surface anywhere in the app that read the
// list back. A user saved a post and could never find it again — the same class
// of defect as the like that was never sent, one step later in the flow.
//
// Reached from the bookmark icon in the Community feed header. That entry point
// is argued for in CommunityScreen's own header: the control that saves is on
// the feed, so the list of what it saved belongs a tap from the feed.
//
// ============================================================================
// IT REUSES THE FEED'S CARD, DELIBERATELY
// ============================================================================
// `/me/bookmarks` returns the same `PostList` envelope as `/feed` precisely so
// one mapper and one card serve both — so this screen is the feed's list with a
// different query and a different empty state, not a second rendering of a post.
// Unsaving from here removes the row immediately (see `useBookmarkToggle`);
// anything else would leave the user tapping a filled bookmark that stays.
//
// A post reported after it was saved disappears from here too: the server
// filters this list to `approved`, so a bookmark is not a private back door to
// flagged content.
//
// `DetailShell`, like every other secondary screen — a back button in the app
// bar and no bottom nav (docs/BRAND.md §App shell: "Detail screens don't get
// the bottom nav").
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none.

import { useCallback, useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ui";
import { DetailShell } from "@/components/shell";
import { Toast, useToast } from "@/components/feedback";
import { useTokenColor } from "@/lib/tokens";
import { useCurrentUser } from "@/hooks/use-current-user";
import { communityApi, socialKeys, PAGE_LIMIT, type Page, type Post } from "./api";
import { PostCard, toFeedPost, type FeedPost } from "./PostCard";

export function SavedPostsScreen() {
  const user = useCurrentUser();
  const viewerId = user?.id ?? null;

  const spinner = useTokenColor("primary");
  const primary = useTokenColor("primary");
  const { message: toastMessage, tone: toastTone, show: showToast, clear: clearToast } = useToast();
  const onError = useCallback((message: string) => showToast("error", message), [showToast]);

  const {
    data,
    isPending,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: socialKeys.bookmarks(viewerId),
    queryFn: ({ pageParam }) =>
      communityApi.listBookmarks({ limit: PAGE_LIMIT, offset: pageParam }),
    initialPageParam: 0,
    // Null `next_offset` is the last page, and the only stop signal. Same
    // contract as the feed.
    getNextPageParam: (lastPage: Page<Post>) => lastPage.nextOffset ?? undefined,
  });

  const posts: FeedPost[] = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page.items.map((p) => toFeedPost(p, viewerId))),
    [data, viewerId],
  );

  return (
    <DetailShell title="Saved" testID="saved-posts-screen">
      <FlatList
        data={isPending || isError ? [] : posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <PostCard post={item} viewerId={viewerId} onError={onError} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
        ItemSeparatorComponent={() => <View className="h-lg" />}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          isPending ? (
            <View className="items-center py-2xl">
              <ActivityIndicator color={spinner} />
            </View>
          ) : isError ? (
            /* Same treatment as the feed's error state, on purpose — two
               different apologies for the same failure is drift. */
            <View className="items-center gap-sm py-2xl">
              <Text className="font-headline-md text-headline-md text-on-surface">
                Couldn&apos;t load your saved posts
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading saved posts"
                onPress={() => refetch()}
                disabled={isRefetching}
                className="min-h-[44px] justify-center rounded-full border border-outline px-lg active:opacity-70"
              >
                <Text className="font-label-md text-label-md text-on-surface">
                  {isRefetching ? "Retrying…" : "Try again"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center gap-sm py-2xl">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-container/15">
                <Icon chrome="bookmarks" size={28} color={primary} />
              </View>
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
                Nothing saved yet
              </Text>
              {/* Names the exact control that fills this list. An empty state
                  that does not say how to leave it is the "Follow specialists
                  and communities" copy the feed's empty state lost. */}
              <Text
                className="text-center font-body-md text-on-surface-variant"
                style={{ fontSize: 14 }}
              >
                Tap the bookmark on a post in Community and it will appear here.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="items-center py-lg">
              <ActivityIndicator color={spinner} />
            </View>
          ) : null
        }
      />
      <Toast message={toastMessage} tone={toastTone} onDismiss={clearToast} />
    </DetailShell>
  );
}
