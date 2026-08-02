// Inbox (Messages Overview) screen — translated from the Stitch HTML
// "Messages Overview" design.
//
// This is a root tab screen — reached via the BottomNav "Inbox" tab from
// any screen. It is NOT a pushed screen, so there is no back arrow.
//
// ============================================================================
// SHELL MIGRATION — the inline app bar is gone
// ============================================================================
// This screen drew its OWN top bar, and it disagreed with the shared one two
// taps away on Patient Dashboard: avatar on the LEFT of a re-typeset "MedApp"
// wordmark, bell on the right, inside a bordered + shadowed band. docs/BRAND.md
// §App shell is explicit — "logo on the left; avatar + notifications grouped on
// the right" — and §Logo rules forbid re-typesetting the mark as <Text>. So the
// chrome is not this screen's to draw: it now renders <PatientShell
// activeTab="inbox">.
//
// Deleted with the bar:
//   * `appBarShadow` (Platform.select) and its literal `#000000` tint. Figma's
//     101:142 carries no effects and docs/BRAND.md §Elevation forbids inventing
//     one for a bar.
//   * the `<Text>MedApp</Text>` wordmark + avatar lockup and its
//     `border-2 border-primary/20` ring — PatientAppBar draws the real <Logo />
//     and an AvatarWithFallback (photo → initials → silhouette).
//   * the bell Pressable and its literal `color="#00685f"` glyph (the LIGHT
//     value of color/primary, frozen in JS).
//   * `StatusBar style="dark"`, likewise frozen to one mode — the shell resolves
//     it from the active scheme.
//   * the local <SafeAreaView>/<BottomNav> scaffolding the shell now owns. The
//     BottomNav's `onTabPress` routing moved onto the shell verbatim.
//
// Translation calls:
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
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Card, ChoiceChip, ChoiceChipRow, SearchField } from "@/components/ui";
import { PatientShell } from "@/components/shell";
import { useAuthStore } from "@/store/auth-store";
import { useResolvedScheme } from "@/lib/theme";
import { blendTokens, tokenColor, useTokenShadow } from "@/lib/tokens";

/**
 * This screen's scroll gutter and BRAND's screen gutter. Named so the
 * full-bleed pull on the filter row reads as intent rather than a bare `-16`.
 */
const GUTTER = 16;

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

  // FAB colours, by token name rather than the `#00685f` / `#005049` / `#ffffff`
  // this screen froze — all three were LIGHT-mode values baked into JS.
  const { scheme } = useResolvedScheme();
  const fabFill = tokenColor("primary", scheme);
  const fabFillPressed = blendTokens("primary", "on-primary", PRESSED_STATE_LAYER, scheme);
  const onPrimary = tokenColor("on-primary", scheme);
  const fabShadow = useTokenShadow("shadow", FLOATING_SHADOW);

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
        (c) => c.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q),
      );
    }

    return result;
  }, [activeFilter, query]);

  return (
    <PatientShell
      activeTab="inbox"
      avatarUri={user?.avatarUrl}
      avatarInitials={firstName[0]}
      avatarLabel={user?.displayName ?? "Your profile"}
      // No `onTabPress`: PatientShell's default routes every tab through PATIENT_TAB_HREFS with
      // `replace`, and already no-ops on the active tab. The hand-rolled switch this replaces
      // mixed `replace` for Home with `push` for the rest, which is how the back stack grew.
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Page title + search */}
        <Text
          className="mb-sm mt-md font-headline-xl text-on-surface"
          style={{ fontSize: 32, fontWeight: "700", letterSpacing: -0.32 }}
        >
          Messages
        </Text>
        {/* Search — the shared SearchField (Figma 396:538), a composition over
              the canonical Input. Deletes a private <TextInput> row whose height
              was emergent from `paddingVertical: 14` rather than the frame's 52,
              whose fill was `bg-surface-container-lowest` (the same colour as the
              conversation cards below it, where 396:538 mandates the recessed
              `color/field-surface`), which carried a `cardShadow`
              (docs/BRAND.md §Elevation forbids it), had no focus or error border,
              and froze `#6d7a77` into the glyph and placeholder and `#171d1c`
              into the TYPED VALUE — so in dark mode the user typed near-black
              text on a dark field.

              It also gains 396:530's State=Has query clear button, which this
              screen simply never had. */}
        <View className="mb-md">
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
            placeholder="Search conversations…"
            accessibilityLabel="Search conversations"
          />
        </View>

        {/* Filter tabs — the shared ChoiceChip (Figma 11:104). `role="radio"`
              because exactly one filter is active at a time.

              `filterActiveShadow` went with it: the active chip cast a teal glow,
              which docs/BRAND.md §Elevation scopes out ("Separation comes from
              surface tone and a hairline, never from a blur"; only
              sheets/menus/dialogs/toasts/FABs may, and a chip is none of those).
              11:104 carries no effect either.

              `marginHorizontal: -GUTTER` breaks the row out of this screen's 16px
              scroll gutter so the scrollable ChoiceChipRow can apply that gutter
              as its own CONTENT inset — BRAND §"Horizontal strips and carousels"
              wants a trailing inset matching the leading one, not a clip at a
              padded edge. */}
        <View style={{ marginHorizontal: -GUTTER, marginBottom: 16 }}>
          <ChoiceChipRow scrollable>
            {FILTER_TABS.map((t) => (
              <ChoiceChip
                key={t.key}
                label={t.label}
                role="radio"
                selected={activeFilter === t.key}
                onPress={() => setActiveFilter(t.key)}
              />
            ))}
          </ChoiceChipRow>
        </View>

        {/* Conversation list */}
        <View className="gap-base">
          {filtered.length === 0 ? (
            <EmptyInbox query={query} />
          ) : (
            filtered.map((c) => <ConversationItem key={c.id} conv={c} />)
          )}
        </View>
      </ScrollView>

      {/* Floating compose button — z-40, sits above BottomNav (z-50 at bottom: 0).
          A FAB is one of the four roles docs/BRAND.md §Elevation still allows a
          shadow ("a bottom sheet, a menu, a dialog, a toast" — and the FAB that
          sits with them), so this one is RETOKENISED rather than deleted: the
          `shadow` token at 8% over a 2/6 offset-blur pair, not a 12px teal glow
          at 35% tinted with a literal `#00685f`. */}
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
              backgroundColor: pressed ? fabFillPressed : fabFill,
            },
            fabShadow,
          ]}
          onPress={() => {
            // TODO: open new conversation composer once the messaging
            // service exposes POST /v1/threads.
          }}
        >
          <MaterialIcons name="edit" size={28} color={onPrimary} />
        </Pressable>
      </View>
    </PatientShell>
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
      className="active:scale-[0.99]"
      onPress={() => {
        router.push({
          // Route was added recently — typedRoutes regenerates on dev server start.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pathname: "/(app)/chat-thread" as any,
          params: { name: conv.name },
        });
      }}
    >
      {/* The shared Card (docs/BRAND.md §Elevation), not a hand-rolled bordered
          View. This row was the screen's `cardShadow` call site — a 20px grey
          `#475569` haze, exactly the "soft grey haze" the product owner rejected.
          Card cannot carry one: it strips elevation keys structurally.

          The padding is unchanged (Card's default `p-md` is the 24px this row
          already used). What does change, deliberately, is the treatment BRAND
          mandates for a card: radius 12 -> `rounded-card` 24, the hairline from
          `outline-variant/30` to full strength (with no shadow the hairline IS
          the separation), and the fill from the fixed `surface-container-lowest`
          step to the `card-surface` ROLE — identical white in light mode, and in
          dark mode a card that lifts off the page instead of receding below it. */}
      <Card className="flex-row items-center gap-md">
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
            // The separation ring must match the card it sits on. It named the
            // old fixed `surface-container-lowest` fill; the Card now uses the
            // `card-surface` role, so the ring follows it rather than drawing a
            // near-white halo on a dark-mode card.
            <View className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-card-surface bg-primary" />
          ) : null}
        </View>

        {/* Content */}
        <View className="min-w-0 flex-1">
          {/* Name row */}
          <View className="mb-xs flex-row items-center justify-between">
            <View className="mr-sm min-w-0 flex-1 flex-row items-center gap-xs">
              <Text
                className="shrink font-headline-md text-on-surface"
                style={{ fontSize: 17, fontWeight: "700" }}
                numberOfLines={1}
              >
                {conv.name}
              </Text>
              {conv.badge ? (
                <View
                  className="shrink-0 rounded px-xs py-xs"
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
              className={`shrink-0 font-label-sm text-label-sm ${
                isUnread ? "font-bold text-primary" : "text-on-surface-variant"
              }`}
            >
              {conv.timestamp}
            </Text>
          </View>

          {/* Preview + unread badge row */}
          <View className="flex-row items-center justify-between gap-sm">
            <Text
              className={`flex-1 font-body-md text-body-md ${
                isUnread ? "font-semibold text-on-surface" : "text-on-surface-variant"
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
      </Card>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyInbox({ query }: { query: string }) {
  return (
    <View className="items-center justify-center gap-sm py-xl">
      <MaterialIcons name="mark-chat-unread" size={40} color="#bcc9c6" />
      <Text className="font-label-md text-label-md text-on-surface-variant">
        {query.trim() ? "No conversations match your search" : "No messages yet"}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Elevation
//
// Three `Platform.select` shadow tables used to live here. Two are GONE, not
// softened, per docs/BRAND.md §Elevation:
//
//   cardShadow        applied to every conversation row — a 20px `#475569` grey
//                     haze. A row is a CARD; a card casts no shadow. The rows
//                     render through the shared <Card>, which cannot carry one.
//   appBarShadow      applied to the hand-rolled top bar. A bar casts no shadow
//                     either — Figma 101:142 has zero effects — and the bar
//                     itself is gone to <PatientShell>.
//   filterActiveShadow  (deleted in an earlier pass) — the active filter chip's
//                     teal glow, dropped with the move to the shared ChoiceChip.
//
// The FAB's survives, because a FAB is one of the roles BRAND still grants a
// shadow. It is retokenised, not kept: `useTokenShadow("shadow", …)` below,
// resolved per mode, instead of a literal teal at 35%.
// ---------------------------------------------------------------------------

/**
 * BRAND's sanctioned `elevation/floating` spec — "a tight `0 1px 2px` /
 * `0 2px 6px` pair at <=8%, tinted with the `shadow` token, never grey". RN
 * takes a single shadow, so this is the outer half of the pair.
 */
const FLOATING_SHADOW = { y: 2, blur: 6, opacity: 0.08 } as const;

/** Material 3's pressed state layer, the same 0.12 Button and ChoiceChip use. */
const PRESSED_STATE_LAYER = 0.12;
