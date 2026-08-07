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
import { ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { AvatarWithFallback } from "@/components/ui";
import { communityApi, type Post } from "./api";
import { useTokenColor } from "@/lib/tokens";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
// No expo-router import: this screen's only navigation was the bottom-nav
// switch, which now lives in PatientShell.
import { MaterialIcons } from "@expo/vector-icons";
import { Card } from "@/components/ui";
import { PatientShell } from "@/components/shell";
import { shareText } from "@/lib/share";
import { useAuthStore } from "@/store/auth-store";
import { ExploreScreen } from "@/features/community/ExploreScreen";
import { CommunityHubScreen } from "@/features/community/CommunityHubScreen";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// "Following" is GONE for v1, and its absence is the honest option.
//
// The tab filtered the feed to authors the user follows. There is no follow
// graph anywhere in the backend - no table, no endpoint, no concept - so the
// tab could only ever show everything (a lie) or nothing (a dead tab). Three
// tabs that work beat four where one is pretending. It comes back when
// following is a real feature rather than a tab that needs filling.
const FEED_TABS = ["For You", "Explore", "Community"] as const;
type FeedTab = (typeof FEED_TABS)[number];

// ---------------------------------------------------------------------------
// SUGGESTED GROUPS STRIP — 360dp DEVICE FIX (2026-08-03)
//
// On an Itel S25 Ultra at 360dp the strip cut its SECOND card vertically: a
// 200dp card, a 16dp gap and no inset of its own, laid out inside the screen's
// 16dp gutter, so at rest the card boundaries were
//
//   card 1   x  16 -> 216      (fully visible)
//   card 2   x 232 -> 432      visible = 328 - 216 = **112 of 200 = 56%**
//
// i.e. sliced through its middle, with the glyph plate and half the group name
// showing and the Join button chopped. docs/BRAND.md §"Horizontal strips and
// carousels" forbids that outright: "Nothing is half-sliced in the resting
// state ... either every item fits the content width, or the strip scrolls with
// a deliberate partial peek (roughly a third to a half of the next item)".
//
// Fitting is not an option here — this is a browse carousel over a list that
// grows from the group catalogue, so there is no N to fit — which leaves the
// peek, and a peek is a WIDTH CALCULATION, not a hope. Unlike the chip rows in
// FindCareScreen these items are a FIXED width, so the resting boundary is fully
// determined and can be put where BRAND wants it.
//
// The strip goes full-bleed (`marginHorizontal: -SCREEN_GUTTER`) and re-applies
// the gutter as its own content inset, which is also what gives it the trailing
// inset BRAND requires ("a trailing inset matching the leading gutter") — inside
// the parent's padding the last card previously ended flush at the padding edge
// with nothing after it. At 360dp:
//
//   screen                    360
//   leading inset              16   (= the screen gutter, so card 1 still lines
//                                     up with "Suggested Groups" above it)
//   card                      240
//   gap                        16
//   card 1                x  16 -> 256      fully visible
//   card 2                x 272 -> 512      visible = 360 - 272 = 88dp
//   peek                   88 / 240 = **36.7%**   -> inside BRAND's 1/3..1/2
//   trailing inset             16   (at the end of the scroll)
//
// Sanity at the 393dp design width: peek = 393 - 272 = 121 / 240 = 50.4%, i.e.
// the top of BRAND's range rather than the 72.5% near-whole card 200dp gave
// there. One width is correct at both, so there is no per-width branch.
//
// The card also gets WIDER, not narrower, which is the counter-intuitive half of
// the fix: 240 - 2x24 (Card's `p-md` inset) = 192dp of content, up from 152, so
// "Mental Wellness" and "12.5k Members" have more room than before, not less.
// ---------------------------------------------------------------------------

/** BRAND §"Spacing, radius, layout": the screen gutter is 16. */
const SCREEN_GUTTER = 16;

/** Derived above. Do not tune this without redoing the peek arithmetic. */
const GROUP_CARD_WIDTH = 240;

/** BRAND spacing scale. */
const GROUP_CARD_GAP = 16;

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
  /** Absent for a live post: nobody has an avatar yet, so initials render. */
  avatarUri?: string;
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

// ---------------------------------------------------------------------------
// Feed authors are SEEDED CLINICIANS, not invented ones (2026-08-05).
//
// This shipped with "Dr. Sarah Jenkins" (Clinical Nutritionist), "Marcus Chen,
// RN" (Pediatric Care) and "Dr. Elena Ross" (Cardiology). None of the three
// exists in scripts/seed_dev_data.py, which is the roster of record, so a tester
// who had just scrolled Find Care met three more clinicians who could not be
// booked, messaged or found anywhere else in the product. Same defect and the
// same fix as PractitionerSocialProfileScreen and ActiveScriptViewScreen.
//
// It stopped being cosmetic when the post Share action became functional: the
// share text includes `post.author`, so an invented clinician now LEAVES THE
// DEVICE in a message someone else reads.
//
// Each post was mapped onto the seeded doctor whose real specialty the post body
// already describes — not re-labelled at random, which would have produced a
// cardiologist writing about gut microbiome:
//
//   p1  gut-brain axis, plant fibres, microbiome  -> Abena Owusu, Nutrition & Dietetics
//   p2  toddler allergies vs. common cold         -> Efua Asante, Paediatrics
//   p3  hypertension home BP logging              -> Adjoa Boateng, Cardiology
//
// p3 is the neatest fit: Adjoa Boateng's seeded bio IS hypertension management
// and heart-failure follow-up.
//
// Specialty strings are the seed's own spellings ("Paediatrics", "Nutrition &
// Dietetics"), so the feed, Find Care and the booking flow agree.
//
// FLAGGED, not fixed here: p1 and p3 still share ONE avatarUri, so two different
// named doctors wear the same stock photograph. The honest fix is not deleting
// the URI — line ~578 renders it through a raw <Image>, so a missing source
// gives a blank box, and docs/BRAND.md requires "avatars always need a real
// fallback". PostCard should adopt <AvatarWithFallback /> first; that is a
// separate change from a rename and is logged rather than half-done.
// ---------------------------------------------------------------------------

const FEED_POSTS: FeedPost[] = [
  {
    id: "p1",
    author: "Dr. Abena Owusu",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC1F9YZ9jEQ7LqHXwwZfzFIS1Tke2IyLooPSWu5-ASvK0f2jCBFRzjmXWtTKSHsJvQeDHGklLiflFAD8QwTxxpG17snWQf8hGxQcSk1O6UfUp7vhtcdKIqt0mZB-YrzRa6T4Kd3ypPHwIy9X0uYNVt1XxGcYucN1CNf_o8oCYj8SDqxpQSYOKsMrmnxUj_Eq-DwJWHxwDcw-VmbYplmj0HOPrPFYFvZMWstx8LSj7bDQchjgaVDmemWlGujBbGsBZCbP1YOAeYXeiSV",
    role: "Nutrition & Dietetics",
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
    author: "Dr. Efua Asante",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBeDSZTRWbfzneMe8FW0JDMPgrXyQ5HpKiZ66RZsrChlx5zwi4wgAl2dniZ7hT08oy3i1ZF6w_dPlfv8KK2tJefxkSDLJM-VxvIDnfyji4RSIXTbakQTIhv8rGY2bKCRiJ7XCjMFWF-28ZdPAommHVrMS_AVPhFNNMiL91TIef4MQ-_FKqeAiPMB6B1mhcpZPjGWVss1xPNLmm8bjtEIM1ZWiXyITCM7qLPMuwLkcP8hWVFsQc99k-nlKEQoBig6WwkM8U5zWEr3KUk",
    role: "Paediatrics",
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
    author: "Dr. Adjoa Boateng",
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

/** Short relative time for the byline. */
function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

/**
 * `Post` (wire) -> `FeedPost` (what this screen draws).
 *
 * `authorName` is null in TWO cases that must not be conflated: the post is
 * anonymous, and the write-time lookup failed. Anonymous gets "Anonymous";
 * a failed lookup gets "MedApp member". Neither ever falls back to
 * `authorUserId` - a raw UUID as a byline is worse than no byline, and on an
 * anonymous post printing it would deanonymise the author outright.
 *
 * No avatar: nothing in the backend stores one for a patient, so `avatarUri` is
 * left undefined and `AvatarWithFallback` renders initials (PO decision, v1).
 *
 * `followedByUser` is false for every live post. There is no follow graph, and
 * the tab that consumed it has been removed.
 */
/**
 * Open the post detail screen.
 *
 * Both the "Read more" link and the comment count land here. They were the two
 * live-looking controls on this card with no `onPress` at all — the defect this
 * codebase has been clearing out — and they lead to the same place because
 * "read the rest" and "read the replies" are the same destination.
 *
 * `push`, not `navigate`: a detail screen is a genuine stack entry, and back
 * must return to the feed at its scroll position.
 */
function openPost(id: string) {
  router.push({
    // Route added this pass — typedRoutes regenerates on dev server start.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pathname: "/(app)/post-detail" as any,
    params: { id },
  });
}

function toFeedPost(p: Post): FeedPost {
  const author = p.isAnonymous ? "Anonymous" : (p.authorName ?? "MedApp member");
  return {
    id: p.id,
    author,
    role: p.authorRole,
    ago: timeAgo(p.createdAtIso),
    body: p.body,
    likes: p.likeCount,
    comments: p.commentCount,
    followedByUser: false,
  };
}

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
  // `GET /v1/social/feed`. Returns only approved, published posts - moderation
  // is enforced server-side, so this screen does not filter on it.
  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: ["social", "feed"],
    queryFn: () => communityApi.listFeed(),
  });

  const spinner = useTokenColor("primary");

  const visiblePosts = useMemo(() => (data ?? []).map(toFeedPost), [data]);

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
              {/* Full-bleed out of the screen gutter, then the gutter re-applied
                  as the content inset — see the arithmetic block at the top of
                  this file. The negative margin is the whole reason the trailing
                  inset can exist. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                // The seam CommunityScreen.layout.test.tsx asserts the peek
                // arithmetic through — see that file for why it asserts props
                // rather than pixels.
                testID="suggested-groups-strip"
                style={{ marginHorizontal: -SCREEN_GUTTER }}
                contentContainerStyle={{
                  gap: GROUP_CARD_GAP,
                  paddingHorizontal: SCREEN_GUTTER,
                  paddingBottom: 8,
                }}
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
              {isPending ? (
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
              ) : visiblePosts.length > 0 ? (
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
    // Width through `style`, not a `w-[240px]` arbitrary class: when one
    // arbitrary NativeWind value fails to compile the WHOLE className is dropped
    // for that element (the failure mode documented in FindCareScreen's CTA), and
    // a card that silently loses its width is precisely the defect being fixed.
    // It is also the value the peek arithmetic depends on, so it reads as a
    // derivation rather than a magic number in a string.
    <Card
      className="overflow-hidden"
      style={{ width: GROUP_CARD_WIDTH }}
      testID={`group-card-${group.id}`}
    >
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

/**
 * The text body behind a post's Share action.
 *
 * TEXT, via React Native's own sheet — not a file. A post is a paragraph
 * somebody pastes into a chat; wrapping it in a `.txt` attachment would make
 * the recipient open a document to read three sentences. See @/lib/share for
 * the full argument.
 *
 * WHAT IS DELIBERATELY LEFT OUT:
 *
 *   * A LINK. There is no permalink to share. The social backend does not exist
 *     yet (see `followedByUser` above — the follow graph is modelled locally),
 *     so there is no canonical URL for a post and no route that would resolve a
 *     post id. Synthesising something like `medapp.app/p/p1` would be a link
 *     that 404s for whoever taps it. When the feed endpoint lands, the URL goes
 *     at the end of this string.
 *
 *   * `post.ago` ("2h ago"). It is relative to the moment the reader opened the
 *     app, and the share is read later and elsewhere. There is no absolute
 *     timestamp on `FeedPost` to substitute, so the share carries no date at
 *     all rather than a wrong one.
 *
 *   * `imageUri` / `imageBadge`. A text share cannot carry the image, and the
 *     badge ("Medical Journal") without it is a provenance claim about content
 *     the recipient cannot see.
 *
 *   * The like and comment counts. Engagement on our feed is not part of what
 *     the reader is being told.
 *
 * The info card IS included: it is post content the reader sees inline, and on
 * p2 it carries the actual clinical distinction the post is about — dropping it
 * would ship the "swipe through for the breakdown" pointer without the
 * breakdown.
 */
export function buildPostShareText(post: FeedPost): string {
  const attribution = `${post.author} · ${post.role}`;
  const parts = [attribution, post.body];
  if (post.infoCard) parts.push(`${post.infoCard.title}: ${post.infoCard.text}`);
  parts.push("Shared from the MedApp community.");
  return parts.join("\n\n");
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
        {/* Initials when there is no photo, which for a live post is always:
            nothing in the backend stores an avatar for a patient. Passing an
            undefined uri to <Image> renders a broken box, so the fallback is
            explicit. */}
        {post.avatarUri ? (
          <Image
            source={{ uri: post.avatarUri }}
            className="h-12 w-12 rounded-full border border-surface-variant"
          />
        ) : (
          <AvatarWithFallback size={48} uri={null} initials={null} label={post.author} />
        )}
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Read more: ${post.author}`}
            hitSlop={6}
            className="mt-sm self-start"
            onPress={() => openPost(post.id)}
          >
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
            onPress={() => openPost(post.id)}
          >
            <MaterialIcons name="chat-bubble-outline" size={22} color="#3d4947" />
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              {post.comments}
            </Text>
          </Pressable>
          {/* Was a Pressable with no `onPress` at all — a live-looking control
              that did nothing. It now opens the OS share sheet with the post's
              own text; see buildPostShareText above for what it carries and
              what it refuses to invent. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share"
            onPress={() => {
              void shareText(buildPostShareText(post), {
                dialogTitle: "Share post",
                subject: `${post.author} on MedApp`,
              });
            }}
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
