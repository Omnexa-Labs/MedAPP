// Community / Social Hub screen. Translated from the Stitch
// "Social Hub" HTML.
//
// Reached from TWO entry points:
//   - BottomNav "Community" tab (from Home and Overview).
//   - Home screen's "Socials" quick service tile.
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
// Deleted with the bar:
//   * the avatar/wordmark/bell lockup and its `border-2 border-primary/20`
//     ring — PatientAppBar draws the real <Logo /> and an AvatarWithFallback
//     (photo → initials → silhouette).
//   * the bell's literal `color="#3d4947"` glyph — the LIGHT value of
//     `on-surface-variant`, frozen in JS. The shared bar tints the bell with
//     the `primary` TOKEN (Figma 101:109), resolved per mode.
//   * `StatusBar style="dark"`, likewise frozen to one mode — the shell
//     resolves it from the active scheme.
//   * the local <SafeAreaView> / <BottomNav> scaffolding the shell now owns.
//     The BottomNav's `onTabPress` routing moved onto the shell verbatim.
//   * the `appBarShadow` note — that constant was already gone; the comment
//     describing it went with the bar it described.
//
// Scroll reserve UNCHANGED at 140: PatientShell renders BottomNav as an
// `absolute bottom-0` overlay (see the LAYOUT NOTE in PatientShell.tsx), so it
// still occupies no layout space and this screen still pads for it itself.
//
// This is a TAB ROOT, so `hideBack` keeps its `true` default — no back button.
//
// Translation rules (same as the other screens):
//   - The comp ships a desktop SideNav + a mobile BottomNav. On a phone
//     we keep the BottomNav (this is a browse destination, like Overview /
//     Find Care — back-arrow chat screens are the exception). The desktop
//     SideNav is dropped.
//   - card / tile / segmented-thumb shadows → all DELETED, and the card
//     surfaces now go through the shared <Card />. None of them is a sheet,
//     menu, dialog, toast or FAB, so none qualifies for the sanctioned
//     floating pair.
//   - hover:* / group-hover:* / focus:ring / active:translate → dropped or
//     mapped to active:scale-95.
//   - bg-gradient-to-br ... opacity-20 corner wash on group cards →
//     expo-linear-gradient absolute fill at low opacity.
//   - line-clamp-3 → numberOfLines={3} on the post body Text.
//   - Feed toggle segmented control + like/comment/bookmark are interactive
//     but LOCAL only (no backend) — design-only pass.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
// No expo-router import: this screen's only navigation was the bottom-nav
// switch, which now lives in PatientShell.
import { MaterialIcons } from "@expo/vector-icons";
import { Card } from "@/components/ui";
import { PatientShell } from "@/components/shell";
import { useAuthStore } from "@/store/auth-store";
import { ExploreScreen } from "@/features/community/ExploreScreen";
import { CommunityHubScreen } from "@/features/community/CommunityHubScreen";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

const FEED_TABS = ["For You", "Following", "Explore", "Community"] as const;
type FeedTab = (typeof FEED_TABS)[number];

// ---------------------------------------------------------------------------
// Static seed content mirroring the comp. No backend in this design pass.
// ---------------------------------------------------------------------------

interface SuggestedGroup {
  id: string;
  name: string;
  // Base member count. The displayed figure is this +1 while the user is
  // a member (see formatMembers). Stored as a number so Join can bump it.
  memberBase: number;
  icon: IconName;
  // [container bg class, icon color] + gradient wash colors.
  bg: string;
  fg: string;
  wash: readonly [string, string];
}

const SUGGESTED_GROUPS: SuggestedGroup[] = [
  {
    id: "g1",
    name: "Holistic Nutrition",
    memberBase: 12_000,
    icon: "restaurant",
    bg: "bg-tertiary-container",
    fg: "#fefcff",
    wash: ["#d8e2ff", "transparent"],
  },
  {
    id: "g2",
    name: "Physical Therapy",
    memberBase: 8_500,
    icon: "fitness-center",
    bg: "bg-primary-container",
    fg: "#f4fffc",
    wash: ["#89f5e7", "transparent"],
  },
  {
    id: "g3",
    name: "Mental Wellness",
    memberBase: 24_000,
    icon: "psychology",
    bg: "bg-secondary-container",
    fg: "#57657a",
    wash: ["#d5e3fc", "transparent"],
  },
];

// "12.5k Members" / "980 Members" — compact member-count formatting.
// Exported so the Community Hub panel renders counts identically.
export function formatMembers(n: number): string {
  const label = n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${n}`;
  return `${label} Members`;
}

interface FeedPost {
  id: string;
  author: string;
  avatarUri: string;
  role: string;
  ago: string;
  body: string;
  clampBody?: boolean;
  readMore?: boolean;
  imageUri?: string;
  imageBadge?: string;
  // Optional inline info card (the "Key Differentiator" tertiary callout).
  infoCard?: { title: string; text: string };
  likes: number;
  comments: number;
  // Whether the signed-in user follows this author. Drives the "Following"
  // feed: that tab shows only posts where this is true. Modelled locally
  // here; once the social backend lands this comes from a follow-graph
  // lookup (e.g. GET /v1/community/following).
  followedByUser: boolean;
  // The group/community this post originated in, if any. Retained as
  // provenance for the future backend feed (e.g. a per-group timeline
  // opened from the Hub); the in-screen tabs no longer filter on it since
  // the Community tab now shows the group Hub rather than a post feed.
  groupId?: string;
}

const FEED_POSTS: FeedPost[] = [
  {
    id: "p1",
    author: "Dr. Sarah Jenkins",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC1F9YZ9jEQ7LqHXwwZfzFIS1Tke2IyLooPSWu5-ASvK0f2jCBFRzjmXWtTKSHsJvQeDHGklLiflFAD8QwTxxpG17snWQf8hGxQcSk1O6UfUp7vhtcdKIqt0mZB-YrzRa6T4Kd3ypPHwIy9X0uYNVt1XxGcYucN1CNf_o8oCYj8SDqxpQSYOKsMrmnxUj_Eq-DwJWHxwDcw-VmbYplmj0HOPrPFYFvZMWstx8LSj7bDQchjgaVDmemWlGujBbGsBZCbP1YOAeYXeiSV",
    role: "Clinical Nutritionist",
    ago: "2h ago",
    body: "Understanding the gut-brain axis is crucial for managing systemic inflammation. Recent studies show that incorporating diverse plant fibers can shift microbiome composition in just 48 hours. Here's a simple graphic breaking down the best sources.",
    clampBody: true,
    readMore: true,
    imageUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCYKhQF4KoUWiGLOeH3J9UEs5AhluseOwnD_BW5AaLfGcizcyj-PN-oMMC7wLnF0Ta8IUpcxoKvT70eMgagmpt2lt_3jgYlTXG3ccPU5k1q16x3VpwMW9h1ChA87V-OVOMC6wib5W0-JWwOObP1td-1TppFHTI_P4QPomvpn08fcBbJxVqkPdNjPPUrSCUuniEKfu7_lX-Yac2Zt_6l5jH6t3Yjcjsml6YxqcIa3gSk0AtSDii3geReN6YUQ6HrrllT1FHZbT9XPUHe",
    imageBadge: "Medical Journal",
    likes: 342,
    comments: 48,
    followedByUser: true,
    groupId: "g1", // Holistic Nutrition
  },
  {
    id: "p2",
    author: "Marcus Chen, RN",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBeDSZTRWbfzneMe8FW0JDMPgrXyQ5HpKiZ66RZsrChlx5zwi4wgAl2dniZ7hT08oy3i1ZF6w_dPlfv8KK2tJefxkSDLJM-VxvIDnfyji4RSIXTbakQTIhv8rGY2bKCRiJ7XCjMFWF-28ZdPAommHVrMS_AVPhFNNMiL91TIef4MQ-_FKqeAiPMB6B1mhcpZPjGWVss1xPNLmm8bjtEIM1ZWiXyITCM7qLPMuwLkcP8hWVFsQc99k-nlKEQoBig6WwkM8U5zWEr3KUk",
    role: "Pediatric Care",
    ago: "5h ago",
    body: "Seasonal allergies are starting early this year. Here is a quick checklist for parents to differentiate between common cold symptoms and allergic rhinitis in toddlers. Swipe through for the breakdown.",
    infoCard: {
      title: "Key Differentiator",
      text: "Itchy, watery eyes are highly indicative of allergies, whereas a low-grade fever almost always points to a viral infection.",
    },
    likes: 89,
    comments: 12,
    // Recommended specialist the user does NOT follow — surfaces in
    // "For You"/"Explore" but is hidden from "Following".
    followedByUser: false,
  },
  {
    id: "p3",
    author: "Dr. Elena Ross",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC1F9YZ9jEQ7LqHXwwZfzFIS1Tke2IyLooPSWu5-ASvK0f2jCBFRzjmXWtTKSHsJvQeDHGklLiflFAD8QwTxxpG17snWQf8hGxQcSk1O6UfUp7vhtcdKIqt0mZB-YrzRa6T4Kd3ypPHwIy9X0uYNVt1XxGcYucN1CNf_o8oCYj8SDqxpQSYOKsMrmnxUj_Eq-DwJWHxwDcw-VmbYplmj0HOPrPFYFvZMWstx8LSj7bDQchjgaVDmemWlGujBbGsBZCbP1YOAeYXeiSV",
    role: "Cardiology",
    ago: "1d ago",
    body: "A reminder for hypertension patients: consistent home blood-pressure logging at the same time each day gives your care team far better signal than a single in-clinic reading. Aim for morning and evening, before medication.",
    likes: 210,
    comments: 31,
    // Followed specialist — appears in both "For You" and "Following".
    followedByUser: true,
    groupId: "g2", // Physical Therapy
  },
];

export function CommunityScreen() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";
  const [activeTab, setActiveTab] = useState<FeedTab>("For You");

  // Groups the user belongs to. Seeded with "Holistic Nutrition" so the
  // Community feed isn't empty on first open; the user can join/leave the
  // rest via the Join buttons. Once the social backend lands this is the
  // membership list from GET /v1/community/memberships, and toggleJoin
  // becomes a POST/DELETE on /v1/community/groups/{id}/membership.
  // Seeded with the Holistic Nutrition carousel group ("g1") and the
  // Heart Healthy Living hub group ("h1") so both the Community feed and
  // the Hub's "My Groups" have content on first open. Carousel ids are
  // "g*", Hub catalog ids are "h*" — they share this one membership Set.
  const [joinedGroups, setJoinedGroups] = useState<Set<string>>(() => new Set(["g1", "h1"]));

  const toggleJoin = (groupId: string) => {
    setJoinedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // The feed is only shown on the For You / Following tabs; Explore and
  // Community render their own panels (discovery / group hub).
  //   For You  → everything (algorithmic recommendations + follows).
  //   Following→ only authors the user follows.
  // Once the social backend lands, each becomes a distinct query
  // (e.g. ?feed=following) rather than a client-side filter.
  const visiblePosts = useMemo(
    () => (activeTab === "Following" ? FEED_POSTS.filter((p) => p.followedByUser) : FEED_POSTS),
    [activeTab],
  );

  return (
    <PatientShell
      activeTab="community"
      // Same source the local lockup read: the auth store's user. The bar's
      // fallback chain (photo → initials → silhouette) subsumes the hand-rolled
      // `firstName[0]?.toUpperCase() ?? "?"` branch.
      avatarUri={user?.avatarUrl}
      avatarInitials={firstName[0]}
      avatarLabel={user?.displayName ?? "Your profile"}
      // Routing moved off the deleted <BottomNav> unchanged.
      // No `onTabPress`: PatientShell owns the tab map now. The switch that was
      // here handled three of five — `inbox` fell through with a comment calling
      // it "still a stub", but /(app)/inbox has shipped, so the tab was dead for
      // no reason. See PatientShell.tsx.
      // No `unreadCount` / `onNotificationsPress`: the local bell was an inert
      // Pressable with no handler and no count, so there is nothing to forward.
      // No `onAvatarPress`: the local avatar was a plain <Image>, not a button.
    >
      {/* paddingBottom 140 is KEPT — the shell's BottomNav is still an
          absolute overlay and reserves no layout space. */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Feed toggle (segmented control). The active thumb carried a
            `segmentShadow`; it is gone. A segmented-control thumb is not one
            of docs/BRAND.md's floating roles (sheet, menu, dialog, toast,
            FAB) — it is a tile inside a track, and the surface-tone step from
            `surface-container-low` to `surface-container-lowest` plus the
            `text-primary` label is what marks it selected. */}
        <View className="mt-md flex-row rounded-full bg-surface-container-low p-xs">
          {FEED_TABS.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveTab(tab)}
                className={`flex-1 rounded-full py-sm ${
                  isActive ? "bg-surface-container-lowest" : ""
                }`}
              >
                <Text
                  className={`text-center font-label-md text-label-md ${
                    isActive ? "text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {tab}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === "Explore" ? (
          /* Explore is its own discovery layout (search, trending hero,
             specialists, topics, suggested community) — it replaces the
             insights header + groups + feed entirely. */
          <ExploreScreen />
        ) : activeTab === "Community" ? (
          /* Community tab → the Community Hub (group management). Shares
             the same membership state as the carousel. Note: reaching
             THIS view requires selecting the in-screen Community tab; the
             bottom-nav Community button lands on the default feed. */
          <CommunityHubScreen joinedGroups={joinedGroups} onToggleJoin={toggleJoin} />
        ) : (
          <>
            {/* Header */}
            <View className="mt-md">
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 24 }}>
                Practitioner Insights
              </Text>
              <Text className="mt-xs font-body-md text-body-md text-on-surface-variant">
                Stay updated with verified health professionals.
              </Text>
            </View>

            {/* Suggested Groups carousel */}
            <View className="mt-lg">
              <View className="mb-sm flex-row items-center justify-between">
                <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
                  Suggested Groups
                </Text>
                {/* "View All" opens the Community Hub (the full group
                    browser) by switching to the Community tab. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="View all groups"
                  hitSlop={6}
                  onPress={() => setActiveTab("Community")}
                >
                  <Text className="font-label-md text-label-md text-primary">View All</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 16, paddingBottom: 8 }}
              >
                {SUGGESTED_GROUPS.map((g) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    joined={joinedGroups.has(g.id)}
                    onToggleJoin={() => toggleJoin(g.id)}
                  />
                ))}
              </ScrollView>
            </View>

            {/* Recommended banner — a "For You" discovery affordance, so it's
                hidden once the user narrows to Following/Community. */}
            {activeTab === "For You" ? (
              <View className="mt-lg rounded-xl border border-primary/20 bg-primary-container/10 p-md">
                <Text className="mb-xs font-label-md text-label-md text-primary">
                  Recommended for You
                </Text>
                <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 14 }}>
                  Discover insights from experts in your circle of interest.
                </Text>
              </View>
            ) : null}

            {/* Feed — sliced by the active tab. */}
            <View className="mt-lg gap-lg">
              {visiblePosts.length > 0 ? (
                visiblePosts.map((post) => <PostCard key={post.id} post={post} />)
              ) : (
                <EmptyFeed />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </PatientShell>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function GroupCard({
  group,
  joined,
  onToggleJoin,
}: {
  group: SuggestedGroup;
  joined: boolean;
  onToggleJoin: () => void;
}) {
  // Joining bumps the displayed count by one (the user themselves).
  const memberLabel = formatMembers(group.memberBase + (joined ? 1 : 0));
  return (
    <Card className="w-[200px] overflow-hidden">
      {/* Corner gradient wash (bg-gradient-to-br ... opacity-20). */}
      <LinearGradient
        colors={group.wash}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", inset: 0, opacity: 0.2 }}
        pointerEvents="none"
      />
      {/* The 48px glyph plate carried its own `iconShadow`. An icon plate is a
          tile, not a floating surface — its own tonal fill is the separation. */}
      <View className={`mb-sm h-12 w-12 items-center justify-center rounded-lg ${group.bg}`}>
        <MaterialIcons name={group.icon} size={24} color={group.fg} />
      </View>
      <Text className="mb-xs font-label-md text-label-md text-on-surface">{group.name}</Text>
      <Text className="mb-sm font-label-sm text-label-sm text-on-surface-variant">
        {memberLabel}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: joined }}
        accessibilityLabel={joined ? `Leave ${group.name}` : `Join ${group.name}`}
        onPress={onToggleJoin}
        className={`w-full flex-row items-center justify-center gap-xs rounded-full py-xs active:scale-95 ${
          joined ? "bg-primary-container" : "border border-primary"
        }`}
      >
        {joined ? <MaterialIcons name="check" size={14} color="#f4fffc" /> : null}
        <Text
          className={`font-label-sm text-label-sm ${
            joined ? "text-on-primary-container" : "text-primary"
          }`}
        >
          {joined ? "Joined" : "Join"}
        </Text>
      </Pressable>
    </Card>
  );
}

function PostCard({ post }: { post: FeedPost }) {
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const likeCount = post.likes + (liked ? 1 : 0);

  return (
    // FLAGGED for a later pass, NOT adopted onto the shared <Card />: this card
    // is edge-to-edge — the media band and the action bar bleed to the border
    // and each section carries its own padding — while <Card /> applies a single
    // 24px inset to everything inside it. Adopting it here would be a layout
    // rewrite, which is out of scope for a shadow sweep. The shadow is gone
    // regardless, and the hairline is now full-strength `outline-variant`
    // (BRAND's hairline token) since it is the only separation left.
    <View className="overflow-hidden rounded-[20px] border border-outline-variant bg-card-surface">
      {/* Header */}
      <View className="flex-row items-start gap-sm p-md">
        <Image
          source={{ uri: post.avatarUri }}
          className="h-12 w-12 rounded-full border border-surface-variant"
        />
        <View className="flex-1">
          <View className="flex-row items-center gap-xs">
            <Text className="font-label-md text-label-md text-on-surface">{post.author}</Text>
            <MaterialIcons name="verified" size={16} color="#00685f" />
          </View>
          <Text className="font-label-sm text-label-sm text-on-surface-variant">
            {post.role} • {post.ago}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More options"
          hitSlop={6}
          className="rounded-full p-xs active:bg-surface-container-low"
        >
          <MaterialIcons name="more-vert" size={22} color="#3d4947" />
        </Pressable>
      </View>

      {/* Body */}
      <View className="px-md pb-sm">
        <Text
          className="font-body-md text-body-md text-on-surface"
          numberOfLines={post.clampBody ? 3 : undefined}
        >
          {post.body}
        </Text>
        {post.readMore ? (
          <Pressable accessibilityRole="button" hitSlop={6} className="mt-sm self-start">
            <Text className="font-label-sm text-label-sm text-primary">Read more</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Optional media with glass badge */}
      {post.imageUri ? (
        <View className="relative aspect-video w-full bg-surface-container-low">
          <Image source={{ uri: post.imageUri }} className="h-full w-full" resizeMode="cover" />
          {post.imageBadge ? (
            <View className="absolute bottom-3 right-3 flex-row items-center gap-xs rounded-full border border-surface-variant/50 bg-surface/90 px-sm py-xs">
              <MaterialIcons name="article" size={14} color="#00685f" />
              <Text className="font-label-sm text-label-sm text-on-surface">{post.imageBadge}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Optional inline info card */}
      {post.infoCard ? (
        <View className="mx-md mb-md mt-xs rounded-xl border border-tertiary-fixed-dim/30 bg-tertiary-fixed p-md">
          <View className="flex-row items-start gap-sm">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-tertiary">
              <MaterialIcons name="info" size={18} color="#ffffff" />
            </View>
            <View className="flex-1">
              <Text className="mb-xs font-label-md text-label-md text-on-tertiary-fixed">
                {post.infoCard.title}
              </Text>
              <Text className="font-body-md text-on-tertiary-fixed/80" style={{ fontSize: 14 }}>
                {post.infoCard.text}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Actions */}
      <View className="flex-row items-center justify-between border-t border-surface-variant p-md">
        <View className="flex-row gap-lg">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={liked ? "Unlike" : "Like"}
            onPress={() => setLiked((v) => !v)}
            className="flex-row items-center gap-xs active:scale-95"
          >
            <MaterialIcons
              name={liked ? "favorite" : "favorite-border"}
              size={22}
              color={liked ? "#ba1a1a" : "#3d4947"}
            />
            <Text className="font-label-sm text-label-sm text-on-surface-variant">{likeCount}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Comment"
            className="flex-row items-center gap-xs active:scale-95"
          >
            <MaterialIcons name="chat-bubble-outline" size={22} color="#3d4947" />
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              {post.comments}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share"
            className="flex-row items-center active:scale-95"
          >
            <MaterialIcons name="share" size={22} color="#3d4947" />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={bookmarked ? "Remove bookmark" : "Bookmark"}
          onPress={() => setBookmarked((v) => !v)}
          className="active:scale-95"
        >
          <MaterialIcons
            name={bookmarked ? "bookmark" : "bookmark-border"}
            size={22}
            color={bookmarked ? "#00685f" : "#3d4947"}
          />
        </Pressable>
      </View>
    </View>
  );
}

// Shown when the Following feed is empty (the user follows no one yet).
// For You always has posts, and Explore/Community render their own panels,
// so Following is the only tab that reaches this.
function EmptyFeed() {
  const copy = {
    icon: "person-add" as IconName,
    title: "Nothing here yet",
    body: "Follow specialists and communities to see their posts in this feed.",
  };
  return (
    <Card className="items-center gap-sm">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-container/15">
        <MaterialIcons name={copy.icon} size={28} color="#00685f" />
      </View>
      <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
        {copy.title}
      </Text>
      <Text className="text-center font-body-md text-on-surface-variant" style={{ fontSize: 14 }}>
        {copy.body}
      </Text>
    </Card>
  );
}
