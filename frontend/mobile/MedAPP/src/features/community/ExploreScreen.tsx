// Explore tab content for the Community screen. Translated from the
// Stitch "Explore - MedApp" HTML.
//
// NOT a route. The Community screen's segmented control swaps this in as
// the body when the "Explore" tab is active (the comp keeps the same top
// tab bar + bottom nav on Explore, so it's a panel, not a separate
// screen). CommunityScreen owns the app bar, tabs, and BottomNav; this
// component renders only the scrollable Explore sections.
//
// Translation rules (same as the sibling screens):
//   - gradient overlay on the hero (bg-gradient-to-t from-black/80) →
//     expo-linear-gradient vertical fill (transparent → black).
//   - line-clamp-2 → numberOfLines={2}.
//   - hover:* / group-hover:scale / focus:ring → dropped.
//   - shadows → Platform.select (ios/web/android).
//   - Interactions are LOCAL only (no backend): the search box is a
//     controlled input, topic chips fill it, Follow / Join toggle local
//     state. When the social backend lands, Follow here mutates the same
//     follow-graph the "Following" tab reads, and the search box queries
//     a discovery endpoint.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useState } from "react";
import { Image, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// ---------------------------------------------------------------------------
// Static seed content mirroring the comp. No backend in this design pass.
// ---------------------------------------------------------------------------

const HERO = {
  badge: "TRENDING NOW",
  title: "Unlocking the Future of Heart Health",
  subtitle:
    "New cardiovascular techniques are revolutionizing patient recovery times globally.",
  imageUri:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuCxTJfV6KNzcfrR3DCj3JwPdII8IzNyazwFz9LWOElZB591cTw7Ee7SOMYAZOxX3lRuWtD9x32g2LrFjHOnOu5zy1OsjeKj3CIFbgzO2pDLAYGmC1Itu5lrhpjqAjaGzNz7COIBLvBb5p31ljBoiVXxFEcCctcVqU8b_NnD84Go_kW_ywm5kMiZfQK4D0kcDYJxept5fVaScixqVf58alQ1NZ6tUKjg9h9VV667eQydor7lKGcnU5ArJ79DFlL5CpdXvYTo7bFuwFj-",
};

interface Specialist {
  id: string;
  name: string;
  role: string;
  bio: string;
  avatarUri: string;
}

const SPECIALISTS: Specialist[] = [
  {
    id: "s1",
    name: "Dr. Elena Rossi",
    role: "Cardiologist",
    bio: "Leading expert in non-invasive cardiac procedures and longevity science.",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDBDrJ_bLoKqNh7OsbHEXh90o3P0QJ-P5m4BhsdbTiG2MvVUHjqcDOpVDLWp_6Wrnv2SU46mI7X3eY9kM8ugPbWzKbt6_qlvU3gwhrlvU4Gl-Wjczn3PfuLfSiQRoIqztqSjodQr1wXpo5CMic3NUjIPIXyS_PLXMAV4W50MyX60AO4cRmygfk0NROkQN7KQwQkFzHcxKK-T1RQInxiB_qAJ9-_YVe77ZZDWRhUIe2OkQ-Wuml8eZ6ZhcPc_42gOz26qzRVvY661Kxa",
  },
  {
    id: "s2",
    name: "Dr. Marcus Chen",
    role: "Neurologist",
    bio: "Specializing in neuroplasticity and cognitive wellness strategies.",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAW3qjEWINt8sFCfPMMpz5wqyrUSGIc36R-1RnQit2jIoIzDK9D2zadwd5fX5qv5wyLTaBBR-roQw2CmF14Z4l5u5SNPC2XLCqftecWmfrYFWzMhQNeq2yGcaszMZ3kOlFw78x1AQBPPMmSXLcjbcB2UxDjOzCNy80BsjHkJ3pqGsSAQN_ayrAJiLo118gCl7KwiCM5Mxybn9mWVn6TzvFDU93s0z6Z3ed_xD64Z6lwHSE0R4FVmeVEMqXs0uKMF37C7D5HJpwwbnNv",
  },
  {
    id: "s3",
    name: "Dr. Sarah Luvon",
    role: "Nutrition Scientist",
    bio: "Advocating for gut health through evidence-based dietary interventions.",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC4CBPHDlgAzPCFrQP3Wi3OMhrbIhK72mJtXM8pjrJ6rGVb90jQEXASnM9zJ01WU9Hou6-XSpis4F0TDNymId4iqj5NV5ydTWMron5jUNgEirPRlTVS-7LTpjKl9lBYWisku0NorXvIAA9ADIJIDpbXROCwx_7aBgLR7tTJlsg3veD6iz3tiNhsZpUrajArn0IRJ-_4ID1u-VtPjztvzSAZ7NlC3xbDuWmp6gsVmUCD4FmHgvbUmnc9iiyrNvfKNuMKhLhOoiGcch8F",
  },
];

const TRENDING_TOPICS = [
  "#MentalWellness",
  "#NutritionTips",
  "#CardioHealth",
  "#TechInMedicine",
  "#Biohacking",
  "#SleepOptimization",
];

const SUGGESTED_COMMUNITY = {
  name: "Yoga & Mindfulness",
  blurb:
    "A holistic space for physical movement and mental clarity. Share routines, meditate together, and find balance.",
  extraMembers: "+12k",
  coverUri:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuC_R0LjLIQy9Ue523ZRmnOyPDfKAo5Zxz9X_ndd6rSpIOlYcRFoR_QNd-rYZk4CmTsG__v0IhI_E4RloCnc_KuPiH4FMmznsWnkFv18F9-TBLlls6n-AhCBUNwL6DtUhLr_LhWFJl2Ki46CuYEbex5RHU_tYy7MVVXDMzC52dInF5l0Ro-s-giqqJByS1JwxGjq-z18WcbsqYSG-oQaOG7O7c2lINGC6Xly0EXKGnn1dihexW1OBhIROD7-v2SjvzMkJ_gmDXd4VwHd",
  avatarUris: [
    "https://lh3.googleusercontent.com/aida-public/AB6AXuAYqj5DHwE2SjcM36vayr1mj5Os3mdoMOcsB4_tOn-g1qttpeER6WyIc7Exe6Tq7sa8bY2TgVNw_pswYrOk3pkdTafDcDGx9Lj0E4RRek9_ECfqVyAvSIkY1VhP2ofkoVjeIgfKoHwt7Vd3Aeej0ix1CyC_xfJUSKIAK64jbqOreXfJlM1C1ei6VlVFrp0bNNEqHyJqNbcgBJ5QYSHU5hOLvb0hVU195aDTgwPhF89zAQpti4s5VfVc6y0jgWjZbPVYZCX1RXjQFxke",
    "https://lh3.googleusercontent.com/aida-public/AB6AXuAofCnL-6ND3S6bs_RxWV_GhkDe5CH01r99v9sgrHP45TZDUYGF1ptfpQ262ekOToHFt3oikx0p0NOcDAfZOzSfCkrym9XTekjZ2Salt-UYm6AFNsDba-T-zHTdVV40WJBuYEtNrxQb1cUImEaGfbuKLNDrorxacfw-fgFLEK5ZsoqYahpOgqy8iMavx8eT5EMEVltnzySg7bvlQ-cqYnGFSa0OUr94zUnfL7yV99WXSe6MPkxUwsKNUzkI86QD-OSn4Zc-1xP-u8h-",
  ],
};

const HERO_OVERLAY = ["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.8)"] as const;

export function ExploreScreen() {
  const [query, setQuery] = useState("");
  // Specialists the user follows (local; would post to the follow graph).
  const [following, setFollowing] = useState<Set<string>>(() => new Set());
  const [joinedCommunity, setJoinedCommunity] = useState(false);

  const toggleFollow = (id: string) => {
    setFollowing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <View>
      {/* Search */}
      <View className="mt-md flex-row items-center rounded-xl bg-surface-container-lowest px-md" style={cardShadow}>
        <MaterialIcons name="search" size={22} color="#6d7a77" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search topics, doctors, or groups"
          placeholderTextColor="#6d7a7799"
          returnKeyType="search"
          className="flex-1 py-md pl-sm font-body-md text-body-md text-on-surface"
          accessibilityLabel="Search Explore"
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            onPress={() => setQuery("")}
          >
            <MaterialIcons name="close" size={20} color="#6d7a77" />
          </Pressable>
        ) : null}
      </View>

      {/* Hero — Trending Now */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Trending: ${HERO.title}`}
        className="mt-lg h-64 overflow-hidden rounded-2xl active:opacity-95"
        style={heroShadow}
      >
        <Image
          source={{ uri: HERO.imageUri }}
          className="absolute inset-0 h-full w-full"
          resizeMode="cover"
        />
        <LinearGradient
          colors={HERO_OVERLAY}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: "absolute", inset: 0 }}
        />
        <View className="flex-1 justify-end p-md">
          <View className="mb-sm self-start rounded-full bg-primary px-sm py-xs">
            <Text className="font-label-sm text-label-sm text-on-primary">{HERO.badge}</Text>
          </View>
          <Text className="font-headline-md text-white" style={{ fontSize: 24, fontWeight: "700" }}>
            {HERO.title}
          </Text>
          <Text className="mt-xs font-body-md text-white/80" numberOfLines={2}>
            {HERO.subtitle}
          </Text>
        </View>
      </Pressable>

      {/* Top Specialists to Follow */}
      <View className="mt-lg">
        <View className="mb-sm flex-row items-end justify-between">
          <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
            Top Specialists to Follow
          </Text>
          <Pressable accessibilityRole="button" hitSlop={6}>
            <Text className="font-label-md text-label-md text-primary">View All</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, paddingBottom: 8 }}
        >
          {SPECIALISTS.map((s) => (
            <SpecialistCard
              key={s.id}
              specialist={s}
              following={following.has(s.id)}
              onToggleFollow={() => toggleFollow(s.id)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Trending Topics */}
      <View className="mt-lg">
        <Text className="mb-sm font-headline-md text-on-surface" style={{ fontSize: 18 }}>
          Trending Topics
        </Text>
        <View className="flex-row flex-wrap gap-sm">
          {TRENDING_TOPICS.map((topic) => {
            const isActive = query === topic;
            return (
              <Pressable
                key={topic}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`Search ${topic}`}
                onPress={() => setQuery(topic)}
                className={`rounded-full px-md py-sm active:scale-95 ${
                  isActive ? "bg-primary" : "bg-surface-container-high"
                }`}
              >
                <Text
                  className={`font-label-md text-label-md ${
                    isActive ? "text-on-primary" : "text-primary"
                  }`}
                >
                  {topic}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Suggested Community */}
      <View className="mt-lg">
        <Text className="mb-sm font-headline-md text-on-surface" style={{ fontSize: 18 }}>
          Suggested Community
        </Text>
        <View
          className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest"
          style={cardShadow}
        >
          <Image
            source={{ uri: SUGGESTED_COMMUNITY.coverUri }}
            className="h-48 w-full"
            resizeMode="cover"
          />
          <View className="p-md">
            <View className="mb-sm flex-row items-start justify-between">
              <Text className="flex-1 font-headline-md text-on-surface" style={{ fontSize: 18 }}>
                {SUGGESTED_COMMUNITY.name}
              </Text>
              {/* Overlapping member avatars + overflow count. */}
              <View className="flex-row items-center">
                {SUGGESTED_COMMUNITY.avatarUris.map((uri, i) => (
                  <Image
                    key={uri}
                    source={{ uri }}
                    className="h-8 w-8 rounded-full border-2 border-surface-container-lowest"
                    style={{ marginLeft: i === 0 ? 0 : -8 }}
                  />
                ))}
                <View
                  className="h-8 w-8 items-center justify-center rounded-full border-2 border-surface-container-lowest bg-primary/20"
                  style={{ marginLeft: -8 }}
                >
                  <Text className="font-label-sm text-primary" style={{ fontSize: 10, fontWeight: "700" }}>
                    {SUGGESTED_COMMUNITY.extraMembers}
                  </Text>
                </View>
              </View>
            </View>
            <Text className="mb-md font-body-md text-body-md text-on-surface-variant">
              {SUGGESTED_COMMUNITY.blurb}
            </Text>
            <View className="flex-row gap-sm">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: joinedCommunity }}
                accessibilityLabel={
                  joinedCommunity
                    ? `Leave ${SUGGESTED_COMMUNITY.name}`
                    : `Join ${SUGGESTED_COMMUNITY.name}`
                }
                onPress={() => setJoinedCommunity((v) => !v)}
                className={`flex-1 flex-row items-center justify-center gap-xs rounded-xl py-sm active:scale-95 ${
                  joinedCommunity ? "bg-primary-container" : "bg-primary"
                }`}
              >
                {joinedCommunity ? <MaterialIcons name="check" size={16} color="#f4fffc" /> : null}
                <Text
                  className={`font-label-md text-label-md ${
                    joinedCommunity ? "text-on-primary-container" : "text-on-primary"
                  }`}
                >
                  {joinedCommunity ? "Joined" : "Join Community"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View community details"
                className="rounded-xl bg-surface-container-high px-md py-sm active:scale-95"
              >
                <Text className="font-label-md text-label-md text-primary">View Details</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Specialist card
// ---------------------------------------------------------------------------

function SpecialistCard({
  specialist,
  following,
  onToggleFollow,
}: {
  specialist: Specialist;
  following: boolean;
  onToggleFollow: () => void;
}) {
  return (
    <View
      className="w-64 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-md"
      style={cardShadow}
    >
      <View className="mb-md flex-row items-center gap-sm">
        <Image
          source={{ uri: specialist.avatarUri }}
          className="h-16 w-16 rounded-full border-2 border-primary/10"
        />
        <View className="flex-1">
          <Text className="font-label-md text-label-md text-on-surface">{specialist.name}</Text>
          <Text className="font-label-sm text-label-sm text-on-surface-variant">
            {specialist.role}
          </Text>
        </View>
      </View>
      <Text className="mb-md font-label-sm text-label-sm text-on-surface-variant" numberOfLines={2}>
        {specialist.bio}
      </Text>
      <View className="flex-row gap-sm">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: following }}
          accessibilityLabel={following ? `Unfollow ${specialist.name}` : `Follow ${specialist.name}`}
          onPress={onToggleFollow}
          className={`flex-1 flex-row items-center justify-center gap-xs rounded-xl py-sm active:scale-95 ${
            following ? "bg-surface-container-high" : "bg-primary"
          }`}
        >
          {following ? <MaterialIcons name="check" size={16} color="#00685f" /> : null}
          <Text
            className={`font-label-md text-label-md ${
              following ? "text-primary" : "text-on-primary"
            }`}
          >
            {following ? "Following" : "Follow"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${specialist.name}'s profile`}
          className="flex-1 items-center rounded-xl border border-primary py-sm active:scale-95"
        >
          <Text className="font-label-md text-label-md text-primary">Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shadows — same Platform.select pattern as the other screens.
// ---------------------------------------------------------------------------

const cardShadow =
  Platform.select({
    ios: { shadowColor: "#475569", shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 4 } },
    web: { boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.05)" },
    android: { elevation: 2 },
  }) || {};

const heroShadow =
  Platform.select({
    ios: { shadowColor: "#000000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
    web: { boxShadow: "0px 8px 16px rgba(0, 0, 0, 0.18)" },
    android: { elevation: 6 },
  }) || {};
