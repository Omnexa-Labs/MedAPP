// Community Hub — the group-management panel for the Community screen.
// Translated from the Stitch "Community Hub" HTML.
//
// NOT a route, and NOT the bottom-nav landing view. CommunityScreen swaps
// this in as its body when the "Community" segmented tab is active (the
// comp keeps the same top tab bar + bottom nav, so it's a panel like
// Explore). Reached via:
//   - the "Community" tab inside the Community screen's segmented control;
//   - "View All" on the Suggested Groups carousel.
// It is deliberately NOT reached by tapping "Community" in the bottom nav —
// that lands on the default feed (For You). CommunityScreen owns the app
// bar, tabs, and BottomNav; this renders only the scrollable Hub sections.
//
// Membership is shared with the rest of CommunityScreen: this panel takes
// the same joinedGroups Set + toggleJoin handler, so a group joined here
// also counts as joined in the carousel and feeds the Community feed.
//
// Translation rules (same as the sibling screens):
//   - bento grid (grid-cols-1/2/3) → single-column stack on a phone.
//   - line-clamp-2 → numberOfLines={2}.
//   - hover:* / focus:ring / active:translate → dropped or active:scale.
//   - shadows → DELETED. Every surface on this panel is a card, a panel or a
//     list row, and docs/BRAND.md §Elevation is binding: "A CARD casts NO
//     shadow. Separation is surface tone + a 1px `outline-variant` hairline +
//     `radius/24`." Nothing here is a sheet, menu, dialog, toast or FAB, so
//     nothing here is allowed the sanctioned floating pair either. The card
//     surfaces now go through the shared <Card /> instead, which is what stops
//     the hand-roll growing a shadow back.
//   - Interactions are LOCAL only (no backend): search filters the
//     in-memory catalog; Join toggles the shared membership Set.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Card, ChoiceChip, ChoiceChipRow, SearchField } from "@/components/ui";
import { formatMembers } from "@/features/community/CommunityScreen";

/**
 * CommunityScreen's scroll gutter (CommunityScreen.tsx:246) and BRAND's screen
 * gutter. Named here only so the full-bleed pull on the category row below is
 * self-documenting rather than a bare `-16`.
 */
const GUTTER = 16;

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// ---------------------------------------------------------------------------
// Hub group catalog. Richer than the carousel's SuggestedGroup (category,
// posts-today, unread count), so it has its own shape. Shares only the
// membership Set with CommunityScreen, keyed by `id`.
// ---------------------------------------------------------------------------

type Category = "Recovery" | "Mental Health" | "Nutrition";

interface HubGroup {
  id: string;
  name: string;
  blurb: string;
  icon: IconName;
  // [icon container bg class, icon color].
  tint: { bg: string; fg: string };
  memberBase: number;
  category: Category;
  // Optional discovery metadata shown on the Discover rows.
  postsToday?: string;
  // Optional unread badge shown on My Groups cards.
  newPosts?: number;
}

const HUB_GROUPS: HubGroup[] = [
  {
    id: "h1",
    name: "Heart Healthy Living",
    blurb: "Daily tips, recipes, and support for cardiovascular wellness.",
    icon: "monitor-heart",
    tint: { bg: "bg-primary/10", fg: "#00685f" },
    memberBase: 1_200,
    category: "Recovery",
    newPosts: 3,
  },
  {
    id: "h2",
    name: "Diabetes Management",
    blurb: "A supportive space for tracking and discussing life with diabetes.",
    icon: "water-drop",
    tint: { bg: "bg-tertiary/10", fg: "#0058be" },
    memberBase: 850,
    category: "Nutrition",
  },
  {
    id: "h3",
    name: "Post-Op Recovery",
    blurb: "Share recovery milestones and find encouragement after surgery.",
    icon: "healing",
    tint: { bg: "bg-surface-container", fg: "#00685f" },
    memberBase: 3_400,
    category: "Recovery",
    postsToday: "50+ posts today",
  },
  {
    id: "h4",
    name: "Mindfulness & Meditation",
    blurb: "Techniques for stress reduction and mental clarity in daily life.",
    icon: "self-improvement",
    tint: { bg: "bg-surface-container", fg: "#515f74" },
    memberBase: 5_100,
    category: "Mental Health",
    postsToday: "120+ posts today",
  },
];

const CATEGORIES: ("All Categories" | Category)[] = [
  "All Categories",
  "Recovery",
  "Mental Health",
  "Nutrition",
];

export function CommunityHubScreen({
  joinedGroups,
  onToggleJoin,
}: {
  joinedGroups: Set<string>;
  onToggleJoin: (groupId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All Categories");

  const q = query.trim().toLowerCase();

  // My Groups = catalog entries the user has joined (matched by search).
  const myGroups = useMemo(
    () =>
      HUB_GROUPS.filter(
        (g) =>
          joinedGroups.has(g.id) &&
          (q === "" || g.name.toLowerCase().includes(q) || g.blurb.toLowerCase().includes(q)),
      ),
    [joinedGroups, q],
  );

  // Discover = everything else, filtered by category + search.
  const discoverGroups = useMemo(
    () =>
      HUB_GROUPS.filter(
        (g) =>
          !joinedGroups.has(g.id) &&
          (category === "All Categories" || g.category === category) &&
          (q === "" || g.name.toLowerCase().includes(q) || g.blurb.toLowerCase().includes(q)),
      ),
    [joinedGroups, category, q],
  );

  return (
    <View>
      {/* Header */}
      <View className="mt-md">
        <Text className="font-headline-md text-on-background" style={{ fontSize: 28, fontWeight: "700" }}>
          Community Hub
        </Text>
        <Text className="mt-xs font-body-md text-body-md text-on-surface-variant">
          Connect with others and find support in specialized health-interest groups.
        </Text>
      </View>

      {/* Search — the shared SearchField (Figma 396:538), a composition over the
          canonical Input. Deletes a bare <TextInput> row that was this screen's
          private field: fill `bg-surface-container-low` (so the field was barely
          distinguishable from the card it sat in, where 396:538 mandates the
          recessed `color/field-surface`), height emergent from `py-sm` instead of
          52, no focus or error border at all, a 22px glyph off BRAND's 24/20
          ramp, a ~36pt clear target (the frame names its node
          "clear-button (44x44)"), and `#3d4947` frozen into the glyph, the
          placeholder AND the clear button — the LIGHT value of
          on-surface-variant, so in dark mode you typed against a dark field with
          dark chrome. */}
      <View className="mt-md">
        <SearchField
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery("")}
          placeholder="Search groups or topics"
          accessibilityLabel="Search groups"
        />
      </View>

      {/* My Groups */}
      <View className="mt-lg">
        <View className="mb-sm flex-row items-center justify-between">
          <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
            My Groups
          </Text>
          <Pressable accessibilityRole="button" hitSlop={6}>
            <Text className="font-label-md text-label-md text-primary">View All</Text>
          </Pressable>
        </View>
        {myGroups.length > 0 ? (
          <View className="gap-md">
            {myGroups.map((g) => (
              <MyGroupCard key={g.id} group={g} />
            ))}
          </View>
        ) : (
          <Card className="items-center gap-xs">
            <MaterialIcons name="group-add" size={28} color="#00685f" />
            <Text className="font-label-md text-label-md text-on-surface">
              You haven't joined any groups yet
            </Text>
            <Text className="text-center font-body-md text-on-surface-variant" style={{ fontSize: 14 }}>
              Join a group below to see it here.
            </Text>
          </Card>
        )}
      </View>

      {/* Discover Groups */}
      <View className="mt-lg">
        <Text className="mb-sm font-headline-md text-on-surface" style={{ fontSize: 18 }}>
          Discover Groups
        </Text>

        {/* Category filter row — the shared ChoiceChip (Figma 11:104), replacing
            one of the ten private chips. `role="radio"` because category is
            one-of-N (the old `button` role announced no group semantics).

            `marginHorizontal: -GUTTER` deliberately breaks this row OUT of
            CommunityScreen's 16px scroll gutter (CommunityScreen.tsx:246) so the
            scrollable ChoiceChipRow can apply that gutter as its own CONTENT
            inset. That is docs/BRAND.md §"Horizontal strips and carousels":
            items scroll edge to edge with "a trailing inset matching the leading
            gutter", instead of being clipped at a padded edge the way the old
            row was. The derivation now lives in ChoiceChipRow, not here. */}
        <View style={{ marginHorizontal: -GUTTER, marginBottom: 12 }}>
          <ChoiceChipRow scrollable>
            {CATEGORIES.map((c) => (
              <ChoiceChip
                key={c}
                label={c}
                role="radio"
                selected={c === category}
                onPress={() => setCategory(c)}
              />
            ))}
          </ChoiceChipRow>
        </View>

        {discoverGroups.length > 0 ? (
          <View className="gap-md">
            {discoverGroups.map((g) => (
              <DiscoverGroupRow key={g.id} group={g} onJoin={() => onToggleJoin(g.id)} />
            ))}
          </View>
        ) : (
          <Card className="items-center">
            <Text className="text-center font-body-md text-on-surface-variant" style={{ fontSize: 14 }}>
              No groups match your search.
            </Text>
          </Card>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// My Groups card (joined)
// ---------------------------------------------------------------------------

// FLAGGED for a later pass: this is a card but it is also the tap target, and
// the shared <Card /> is a plain View with no press handling. Rather than nest a
// Card inside a Pressable (two surfaces, two radii, a doubled hairline), it
// stays hand-rolled — but it now carries the SAME treatment the primitive
// applies: `rounded-card` + a full-strength `outline-variant` hairline +
// `card-surface`, and no shadow. The `/30`-style faint hairline and the
// `surface-container-lowest` fill both went: with the shadow gone the hairline
// and the fill step are the entire separation, and `surface-container-lowest`
// resolves DARKER than the page in dark mode, so the card receded.
function MyGroupCard({ group }: { group: HubGroup }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${group.name}`}
      className="gap-sm rounded-card border border-outline-variant bg-card-surface p-md active:scale-[0.99]"
    >
      <View className="flex-row items-start justify-between">
        <View className={`h-12 w-12 items-center justify-center rounded-lg ${group.tint.bg}`}>
          <MaterialIcons name={group.icon} size={24} color={group.tint.fg} />
        </View>
        <View className="flex-row items-center gap-sm">
          {group.newPosts ? (
            <View className="rounded-full bg-primary/10 px-sm py-xs">
              <Text className="font-label-sm text-label-sm text-primary">
                {group.newPosts} New Posts
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Group options"
            hitSlop={6}
            className="rounded-full p-xs active:bg-surface-container-high"
          >
            <MaterialIcons name="more-vert" size={20} color="#3d4947" />
          </Pressable>
        </View>
      </View>
      <View className="mt-xs gap-xs">
        <Text className="font-label-md text-on-surface" style={{ fontSize: 16 }}>
          {group.name}
        </Text>
        <Text className="font-body-md text-on-surface-variant" numberOfLines={2}>
          {group.blurb}
        </Text>
      </View>
      <View className="mt-sm border-t border-surface-variant/50 pt-sm">
        <Text className="font-label-sm text-label-sm text-on-surface-variant">
          {formatMembers(group.memberBase + 1)}
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Discover Groups row (not joined)
// ---------------------------------------------------------------------------

function DiscoverGroupRow({ group, onJoin }: { group: HubGroup; onJoin: () => void }) {
  return (
    <Card className="gap-md">
      <View className="flex-row items-start gap-md">
        <View className={`h-16 w-16 items-center justify-center rounded-xl ${group.tint.bg}`}>
          <MaterialIcons name={group.icon} size={32} color={group.tint.fg} />
        </View>
        <View className="flex-1 gap-xs">
          <Text className="font-label-md text-on-surface" style={{ fontSize: 16 }}>
            {group.name}
          </Text>
          <Text className="font-body-md text-on-surface-variant">{group.blurb}</Text>
          <View className="mt-xs flex-row items-center gap-xs">
            <MaterialIcons name="group" size={16} color="#6d7a77" />
            <Text className="font-label-sm text-label-sm text-outline">
              {formatMembers(group.memberBase)}
              {group.postsToday ? ` • ${group.postsToday}` : ""}
            </Text>
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Join ${group.name}`}
        onPress={onJoin}
        className="items-center rounded-lg bg-primary py-sm active:scale-95"
      >
        <Text className="font-label-md text-label-md text-on-primary">Join Group</Text>
      </Pressable>
    </Card>
  );
}
