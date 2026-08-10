// Community screen — the patient post feed over `GET /v1/social/feed`.
//
// Reached from TWO entry points:
//   - BottomNav "Community" tab (from Home and Overview).
//   - Home screen's "Socials" quick service tile.
//
// ============================================================================
// EVERYTHING THAT WAS NOT A POST HAS BEEN CUT (v1)
// ============================================================================
// This screen shipped as a three-tab browser — "For You / Explore / Community"
// — over a group catalogue, a specialist directory, a follow graph and a
// trending hero. None of those exist in the backend: there is no group table,
// no membership table and no follow edge anywhere in social_service, so every
// count, every Join and every Follow was a control that changed a `useState`
// and nothing else. A tester who joined "Mental Wellness" and reopened the app
// found they had never joined anything.
//
// Two of the three tabs were ENTIRELY that material, so both panels and both
// tabs are gone (ExploreScreen.tsx and CommunityHubScreen.tsx are deleted).
// That leaves one panel, and a segmented control with one segment is chrome
// pretending to be a choice — so the tab bar went too. What remains is what the
// backend actually serves: a list of approved, published posts.
//
// Every removal is recorded in docs/api/README.md so none of it is lost.
//
// ============================================================================
// A FlatList, NOT A ScrollView — because the feed is PAGED now
// ============================================================================
// `/feed` takes `limit`/`offset` and returns `next_offset`, null on the last
// page, and the client was reading page one and calling it the feed. A
// ScrollView has no end-reached signal, so load-on-scroll would have had to be
// hand-rolled out of `onScroll` arithmetic. `getNextPageParam` returns
// `lastPage.nextOffset` VERBATIM: the server proves a next page exists by
// fetching `limit + 1` rows and discarding the extra, and a client that instead
// infers "a full page means more" loops forever when the total is an exact
// multiple of the limit.
//
// ============================================================================
// SAVED POSTS IS REACHED FROM HERE
// ============================================================================
// The bookmark button lives on the card in this list, so the list of what it
// saved belongs one tap away from the same screen — not buried in Settings,
// which is an account/appearance page whose own header records that it holds
// nothing else. A screen with no entry point is the `/(app)/onboarding-status`
// mistake, and a bookmark with nowhere to read it back is the same defect a
// layer down.
//
// ============================================================================
// SHELL MIGRATION — the inline app bar is gone
// ============================================================================
// This was one of the last three hand-rolled patient app bars. It drew an
// avatar on the LEFT of a re-typeset "MedApp" <Text> wordmark with a bell on
// the right — which docs/BRAND.md §App shell forbids twice over ("logo on the
// left; avatar + notifications grouped on the right", and §Logo rules forbid
// re-typesetting the mark as text). It is now <PatientShell activeTab="community">.
//
// Scroll reserve UNCHANGED at 140: PatientShell renders BottomNav as an
// `absolute bottom-0` overlay (see the LAYOUT NOTE in PatientShell.tsx), so it
// still occupies no layout space and this screen still pads for it itself.
//
// This is a TAB ROOT, so `hideBack` keeps its `true` default — no back button.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useCallback, useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Card, Icon } from "@/components/ui";
import { PatientShell } from "@/components/shell";
import { Toast, useToast } from "@/components/feedback";
import { useTokenColor } from "@/lib/tokens";
import { useCurrentUser } from "@/hooks/use-current-user";
import { communityApi, socialKeys, PAGE_LIMIT, type Page, type Post } from "./api";
import { PostCard, toFeedPost, type FeedPost } from "./PostCard";

// Re-exported so the share helper keeps ONE import path for callers and tests
// while its definition sits beside the card that uses it.
export { buildPostShareText } from "./PostCard";
export type { FeedPost } from "./PostCard";

/** Where the Saved list lives. Named so the entry point is assertable. */
export const SAVED_POSTS_HREF = "/(app)/saved-posts";
// Declared here rather than imported from `features/qa`, matching the line
// above: importing the constant would pull that screen's whole module graph
// into the feed for the sake of a string.
export const ASK_A_DOCTOR_HREF = "/(app)/ask-a-doctor";

/**
 * The feed's shared infinite-query options.
 *
 * Exported so the Saved screen's loading/error/empty treatment can be read
 * against the same shape, and so the paging contract is stated once.
 */
export function useFeedQuery(viewerId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: socialKeys.feed(viewerId),
    queryFn: ({ pageParam }) => communityApi.listFeed({ limit: PAGE_LIMIT, offset: pageParam }),
    initialPageParam: 0,
    // `nextOffset` verbatim. `undefined` is react-query's "no more pages", and
    // `null` from the server means exactly that — see the header for why a full
    // page is NOT the same signal.
    getNextPageParam: (lastPage: Page<Post>) => lastPage.nextOffset ?? undefined,
  });
}

export function CommunityScreen() {
  const user = useCurrentUser();
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";
  const viewerId = user?.id ?? null;

  const {
    data,
    isPending,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeedQuery(viewerId);

  const spinner = useTokenColor("primary");
  const muted = useTokenColor("on-surface-variant");
  const { message: toastMessage, tone: toastTone, show: showToast, clear: clearToast } = useToast();

  // Every mutation on a card reports failure through here. Passed down rather
  // than raised per card so there is one chip on screen, not one per row.
  const onError = useCallback((message: string) => showToast("error", message), [showToast]);

  const posts: FeedPost[] = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page.items.map((p) => toFeedPost(p, viewerId))),
    [data, viewerId],
  );

  const loadMore = () => {
    // `hasNextPage` is false the moment a page comes back with `nextOffset:
    // null`, so this stops cleanly instead of re-requesting the last offset.
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  };

  return (
    <PatientShell
      activeTab="community"
      avatarUri={user?.avatarUrl}
      avatarInitials={firstName[0]}
      avatarLabel={user?.displayName ?? "Your profile"}
    >
      <FlatList
        data={isPending || isError ? [] : posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => (
          <PostCard post={item} viewerId={viewerId} onError={onError} />
        )}
        // paddingBottom 140 is KEPT — the shell's BottomNav is still an
        // absolute overlay and reserves no layout space.
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        // md (24), not lg (48): 48 is the section-separation step, and between
        // cards that already carry a border, a surface fill and a 24 radius it
        // reads as a gap rather than a rhythm. PO called it on the skeletons.
        ItemSeparatorComponent={() => <View className="h-md" />}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        // Half a screen of runway. Lower and the spinner is the first thing the
        // user sees at the bottom; higher and every scroll prefetches.
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View className="mb-lg">
            {/* The heading was "Practitioner Insights" / "Stay updated with
                verified health professionals". The feed endpoint takes no
                author-role filter and patients publish to it too, so both lines
                described a curated clinician feed that does not exist — and
                "verified" is a trust claim with no field behind it. */}
            <View className="mt-md flex-row items-start justify-between gap-sm">
              <View className="flex-1">
                <Text className="font-headline-md text-on-surface" style={{ fontSize: 24 }}>
                  Community
                </Text>
                <Text className="mt-xs font-body-md text-body-md text-on-surface-variant">
                  Posts from health professionals and other members.
                </Text>
              </View>
              {/* Ask a doctor sits HERE, beside the feed it belongs to, because
                  a route nothing links to is a screen nobody can use — this
                  codebase already carries several. The QA backend has worked
                  since before the feed did and had no surface at all. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ask a doctor"
                onPress={() =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  router.push(ASK_A_DOCTOR_HREF as any)
                }
                className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
              >
                <Icon chrome="help" size={22} color={muted} />
              </Pressable>
              {/* The Saved entry point — see the header for why it is here and
                  not in Settings. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Saved posts"
                onPress={() =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  router.push(SAVED_POSTS_HREF as any)
                }
                className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
              >
                <Icon chrome="bookmarks" size={22} color={muted} />
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          isPending ? (
            <View className="items-center py-2xl">
              <ActivityIndicator color={spinner} />
            </View>
          ) : isError ? (
            <View className="items-center gap-sm py-2xl">
              <Text className="font-headline-md text-headline-md text-on-surface">
                Couldn&apos;t load the feed
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading the feed"
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
            <EmptyFeed />
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
      {/* 96, not the Toast default: BottomNav floats `absolute bottom-0` over an
          80px band on a tab root, and a chip at 30 parks behind it. */}
      <Toast message={toastMessage} tone={toastTone} onDismiss={clearToast} bottom={96} />
    </PatientShell>
  );
}

// The feed really is empty — social has no seed data (docs/api/README.md
// §"Seed coverage"), so this is the first thing most testers see. The copy said
// "Follow specialists and communities to see their posts", which pointed at two
// features that do not exist and made an empty feed look like the user's fault.
function EmptyFeed() {
  const primary = useTokenColor("primary");
  return (
    <Card className="items-center gap-sm">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-container/15">
        <Icon chrome="forum" size={28} color={primary} />
      </View>
      <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
        No posts yet
      </Text>
      <Text className="text-center font-body-md text-on-surface-variant" style={{ fontSize: 14 }}>
        Posts from health professionals and other members will appear here.
      </Text>
    </Card>
  );
}
