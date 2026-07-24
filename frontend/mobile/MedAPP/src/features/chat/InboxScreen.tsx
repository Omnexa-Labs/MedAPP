// Inbox (Messages Overview) screen — translated from the Stitch HTML
// "Messages Overview" design.
//
// This is a root tab screen — reached via the BottomNav "Inbox" tab from
// any screen. It is NOT a pushed screen, so there is no back arrow; the
// app bar mirrors HomeScreen's avatar + MedApp + notifications pattern.
//
// Translation calls:
//   - backdrop-blur header → opaque bg-surface/80 + border + shadow.
//   - hover:*, group-hover:* → dropped (no hover in RN).
//   - overflow-x-auto filter tabs → horizontal ScrollView.
//   - online dot (absolute rounded-full) → absolutely-positioned View on
//     the avatar stack, matching the HomeScreen status-dot convention.
//   - Unread badge number → small circular View with count Text.
//   - Group / Support avatars use MaterialIcons instead of img tags.
//   - fixed FAB (bottom-24 right-6) → absolutely-positioned Pressable
//     at zIndex 40, bottom 82 (clears BottomNav ~80px + 2px gap).
//   - scrollbar-hide → showsHorizontalScrollIndicator={false}.
//   - Filtering is client-side over seed data. Replace SEED_CONVERSATIONS
//     with useQuery(["inbox"]) once the /v1/messages or /v1/threads
//     endpoint is ready.
//   - support_agent icon → headset-mic (nearest MaterialIcons equivalent).
//   - edit_square icon → edit (compose new message).
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useMemo, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuthStore } from "@/store/auth-store";
import { BottomNav } from "@/features/home/components/BottomNav";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];
type FilterTab = "all" | "doctors" | "groups" | "private";
type ConversationKind = "person" | "group" | "support";
type BadgeTint = "primary" | "tertiary" | "secondary";

interface Conversation {
  id: string;
  kind: ConversationKind;
  // person kind
  avatarUri?: string;
  // group / support kind
  avatarIcon?: IconName;
  avatarBgClass?: string; // NativeWind class for the icon bg
  avatarFgColor?: string; // hex for the icon color
  name: string;
  badge?: { label: string; tint: BadgeTint };
  isOnline?: boolean;
  unreadCount?: number;
  lastMessage: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Seed data — mirrors the Stitch comp. Replace with an API call once the
// messaging service exposes GET /v1/threads.
// ---------------------------------------------------------------------------

const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    kind: "person",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDeJpe2eyE7VBbPwXD7m2u2so2Q3OUNPtsrGrSFmYPgs-ebEdihstJSB8oCR4b47ByY3B_O0tXJvybxrQFcMdbXyy9xqS7U_kZ8nFPNvIRhmjvEdFwtFcHJV0XGrYK9jh0GeoJZ1vPacpmlGzjtsCd5RCBzska_0hXM0ZEU9ysDTcXuwGisPFsqxaJkEiaMkAZ9kics4W18HE6lSAYeAoyEI8J_niTdEBQuVwViQn55GrLPUW-D2piEuATB6NuuoRLh-IK3SrUgmo-b",
    name: "Sarah Miller",
    isOnline: true,
    unreadCount: 2,
    lastMessage: "I've attached the new lab results for review.",
    timestamp: "12:45 PM",
  },
  {
    id: "c2",
    kind: "group",
    avatarIcon: "groups",
    avatarBgClass: "bg-tertiary-container",
    avatarFgColor: "#fefcff",
    name: "Cardiology Dept.",
    badge: { label: "Group", tint: "tertiary" },
    lastMessage: "Dr. Aris: Patient #402 is ready for discharge.",
    timestamp: "11:20 AM",
  },
  {
    id: "c3",
    kind: "support",
    avatarIcon: "headset-mic",
    avatarBgClass: "bg-secondary-container",
    avatarFgColor: "#57657a",
    name: "IT Help Desk",
    badge: { label: "Support", tint: "secondary" },
    lastMessage: "Your access to the MRI portal has been restored.",
    timestamp: "Yesterday",
  },
  {
    id: "c4",
    kind: "person",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBUTvo_vK-LY786nB9Qm8QiGjqsasFuR2oU7WApcRWvQ0on_UAABBqqsQFdzCINcrdvD58_y1rz0hZ8cwUUbsPKcOA8-Abv6QQ34Sv5Ge7dlq443hA1m6pD16C7g6e7HbIOTqKzNTgjRceQTwRpV_dlXc_d7CF2aHF6eF0LwCMXN1v7csE-m-WyZwzlBqWiTUb3AVMWogTUFh5hZKKDh7HbJKqZ3OSRYbsucTW2N2niIkZK0l0qLP9G2r-tYdezp3iR4TioNqVV2J4h",
    name: "Dr. James Carter",
    badge: { label: "Doctor", tint: "primary" },
    lastMessage: "Let's schedule a follow-up for next Tuesday.",
    timestamp: "Yesterday",
  },
  {
    id: "c5",
    kind: "person",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCpQnYgmwJbUk1kc8GBBLGM0SQ8zHoVjaMjhlL8897rN83BcrCivpKpPaRODmJ5mVEdlJsycVW9dHJ-9d1wdtxUfewV-RUevP1FnI5MoNTSPLpQY1GJL9fgYiqqbGPM2vPGUMjJXt6qa5O4cCiZ9Ms-lluB78dSrjxXHD70umRHDUtuS350B2snrOxD2huqHz95c5X-19CDnJp_XJOVA9TZIkfu-2711VGs9Yysu8-omOv8BwVbiDE2PcYzwRzAYs8U-wB1uz0PKBwj",
    name: "Michael Chen",
    lastMessage: "Thank you for the prescription refill request.",
    timestamp: "Oct 24",
  },
];

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "doctors", label: "Doctors" },
  { key: "groups", label: "Groups" },
  { key: "private", label: "Private" },
];

// Badge background colours are semi-transparent and can't be expressed as
// NativeWind classes with dynamic opacity, so use inline hex + alpha.
const BADGE_STYLES: Record<BadgeTint, { bg: string; text: string }> = {
  primary: { bg: "rgba(0,131,120,0.15)", text: "#00685f" },
  tertiary: { bg: "rgba(33,112,228,0.15)", text: "#0058be" },
  secondary: { bg: "rgba(213,227,252,0.6)", text: "#515f74" },
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function InboxScreen() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";

  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let result = SEED_CONVERSATIONS;

    if (activeFilter === "doctors") {
      result = result.filter((c) => c.badge?.label === "Doctor");
    } else if (activeFilter === "groups") {
      result = result.filter((c) => c.kind === "group" || c.kind === "support");
    } else if (activeFilter === "private") {
      result = result.filter((c) => c.kind === "person" && !c.badge);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.lastMessage.toLowerCase().includes(q),
      );
    }

    return result;
  }, [activeFilter, query]);

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* App bar — root tab, no back button; mirrors HomeScreen pattern */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-gutter py-sm"
          style={appBarShadow}
        >
          <View className="flex-row items-center gap-sm">
            <View className="h-10 w-10 overflow-hidden rounded-full border-2 border-primary/20">
              {user?.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  className="h-full w-full"
                  accessibilityLabel="Your profile"
                />
              ) : (
                <View className="h-full w-full items-center justify-center bg-primary-container">
                  <Text className="font-label-md text-label-md text-on-primary-container">
                    {firstName[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
            </View>
            <Text className="font-headline-md text-headline-md text-primary">MedApp</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            hitSlop={8}
            className="rounded-full p-sm active:scale-95"
          >
            <MaterialIcons name="notifications" size={24} color="#00685f" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Page title + search */}
          <Text
            className="font-headline-xl text-on-surface mt-md mb-sm"
            style={{ fontSize: 32, fontWeight: "700", letterSpacing: -0.32 }}
          >
            Messages
          </Text>
          <View
            className="flex-row items-center rounded-xl border border-outline-variant bg-surface-container-lowest px-md mb-md"
            style={cardShadow}
          >
            <MaterialIcons name="search" size={20} color="#6d7a77" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search conversations…"
              placeholderTextColor="#6d7a77"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={{
                flex: 1,
                marginLeft: 12,
                paddingVertical: 14,
                color: "#171d1c",
                fontSize: 16,
                lineHeight: 20,
              }}
              accessibilityLabel="Search conversations"
            />
          </View>

          {/* Filter tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 4, marginBottom: 16 }}
          >
            {FILTER_TABS.map((t) => (
              <Pressable
                key={t.key}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: activeFilter === t.key }}
                onPress={() => setActiveFilter(t.key)}
                className={`rounded-full px-md py-sm active:scale-95 ${
                  activeFilter === t.key
                    ? "bg-primary"
                    : "bg-surface-container-highest"
                }`}
                style={activeFilter === t.key ? filterActiveShadow : undefined}
              >
                <Text
                  className={`font-label-md text-label-md ${
                    activeFilter === t.key
                      ? "text-on-primary"
                      : "text-on-surface-variant"
                  }`}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Conversation list */}
          <View className="gap-base">
            {filtered.length === 0 ? (
              <EmptyInbox query={query} />
            ) : (
              filtered.map((c) => <ConversationItem key={c.id} conv={c} />)
            )}
          </View>
        </ScrollView>

        {/* Floating compose button — z-40, sits above BottomNav (z-50 at bottom: 0) */}
        <View
          style={{
            position: "absolute",
            right: 16,
            bottom: 82,
            zIndex: 40,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compose new message"
            style={({ pressed }) => [
              {
                height: 56,
                width: 56,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "#005049" : "#00685f",
              },
              fabShadow,
            ]}
            onPress={() => {
              // TODO: open new conversation composer once the messaging
              // service exposes POST /v1/threads.
            }}
          >
            <MaterialIcons name="edit" size={28} color="#ffffff" />
          </Pressable>
        </View>

        <BottomNav
          active="inbox"
          onTabPress={(key) => {
            if (key === "home") router.replace("/(app)" as Href);
            else if (key === "overview") router.push("/(app)/overview" as Href);
            else if (key === "community") router.push("/(app)/community" as Href);
            else if (key === "lifestyle") router.push("/(app)/lifestyle" as Href);
          }}
        />
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Conversation list item
// ---------------------------------------------------------------------------

function ConversationItem({ conv }: { conv: Conversation }) {
  const isUnread = (conv.unreadCount ?? 0) > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${conv.name}. ${conv.lastMessage}`}
      className="flex-row items-center gap-md rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md active:scale-[0.99]"
      style={cardShadow}
      onPress={() => {
        router.push({
          // Route was added recently — typedRoutes regenerates on dev server start.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pathname: "/(app)/chat-thread" as any,
          params: { name: conv.name },
        });
      }}
    >
      {/* Avatar */}
      <View className="relative shrink-0">
        {conv.kind === "person" && conv.avatarUri ? (
          <Image
            source={{ uri: conv.avatarUri }}
            className="h-14 w-14 rounded-full"
            accessibilityLabel={conv.name}
          />
        ) : (
          <View
            className={`h-14 w-14 items-center justify-center rounded-full ${conv.avatarBgClass ?? "bg-surface-container"}`}
          >
            <MaterialIcons
              name={conv.avatarIcon ?? "person"}
              size={32}
              color={conv.avatarFgColor ?? "#3d4947"}
            />
          </View>
        )}
        {/* Online status dot */}
        {conv.isOnline ? (
          <View className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-surface-container-lowest bg-primary" />
        ) : null}
      </View>

      {/* Content */}
      <View className="flex-1 min-w-0">
        {/* Name row */}
        <View className="flex-row items-center justify-between mb-xs">
          <View className="flex-1 flex-row items-center gap-xs min-w-0 mr-sm">
            <Text
              className="font-headline-md text-on-surface shrink"
              style={{ fontSize: 17, fontWeight: "700" }}
              numberOfLines={1}
            >
              {conv.name}
            </Text>
            {conv.badge ? (
              <View
                className="rounded px-xs py-xs shrink-0"
                style={{ backgroundColor: BADGE_STYLES[conv.badge.tint].bg }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: BADGE_STYLES[conv.badge.tint].text,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {conv.badge.label}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            className={`font-label-sm text-label-sm shrink-0 ${
              isUnread ? "font-bold text-primary" : "text-on-surface-variant"
            }`}
          >
            {conv.timestamp}
          </Text>
        </View>

        {/* Preview + unread badge row */}
        <View className="flex-row items-center justify-between gap-sm">
          <Text
            className={`font-body-md text-body-md flex-1 ${
              isUnread ? "text-on-surface font-semibold" : "text-on-surface-variant"
            }`}
            numberOfLines={1}
            style={{ fontWeight: isUnread ? "600" : "400" }}
          >
            {conv.lastMessage}
          </Text>
          {conv.unreadCount ? (
            <View className="h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary">
              <Text style={{ color: "#ffffff", fontSize: 10, fontWeight: "700" }}>
                {conv.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyInbox({ query }: { query: string }) {
  return (
    <View className="items-center justify-center py-xl gap-sm">
      <MaterialIcons name="mark-chat-unread" size={40} color="#bcc9c6" />
      <Text className="font-label-md text-label-md text-on-surface-variant">
        {query.trim() ? "No conversations match your search" : "No messages yet"}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local primitives. Promote to components/ui once a second screen needs them.
// ---------------------------------------------------------------------------

const cardShadow =
  Platform.select({
    ios: {
      shadowColor: "#475569",
      shadowOpacity: 0.05,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 4 },
    },
    web: { boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.05)" },
    android: { elevation: 2 },
  }) || {};

const appBarShadow =
  Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    web: { boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.04)" },
    android: { elevation: 3 },
  }) || {};

const filterActiveShadow =
  Platform.select({
    ios: {
      shadowColor: "#00685f",
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    web: { boxShadow: "0px 2px 6px rgba(0, 104, 95, 0.2)" },
    android: { elevation: 3 },
  }) || {};

const fabShadow =
  Platform.select({
    ios: {
      shadowColor: "#00685f",
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    web: { boxShadow: "0px 6px 12px rgba(0, 104, 95, 0.35)" },
    android: { elevation: 8 },
  }) || {};
