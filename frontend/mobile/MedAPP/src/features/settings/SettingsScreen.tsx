// SettingsScreen — Figma 1047:1427 (light) / 1048:17523 (dark proof).
//
// ============================================================================
// WHY A PAGE AND NOT THE POPOVER IT REPLACES
// ============================================================================
// `AccountMenu` carried a flag against itself, and this screen is the answer to
// it: "at 393 a 320 panel leaves 57dp of scrim on its left and reads as a menu.
// At 360 it leaves 24dp and reads as a sheet. Same component, two different
// affordances, because the selector's intrinsic width is a fixed 298 while the
// screen is not. Either the selector gets a compact variant or this becomes a
// real bottom sheet — that is a design call, and the plain build below is the
// interim."
//
// A full page is the third answer and it deletes the arithmetic rather than
// tuning it. `<AppearanceSelector />` needs 298dp of intrinsic width; here it
// gets 361 (393 - 16 - 16), so the popover's two workarounds — `PANEL_PAD = 4`
// instead of 12, and the `MENU_MAX_WIDTH` clamp — stop being load-bearing.
//
// ============================================================================
// WHAT IS DELIBERATELY *NOT* HERE
// ============================================================================
// A settings page would normally also hold Notifications, Privacy & Security,
// Language and About. None of those screens or preferences exist in this app, so
// a row for any of them would be a designed promise the product cannot keep —
// the same defect class as the dead 44pt avatar this screen's own route was
// created to fix. The page has obvious room for them when they land.
//
// ============================================================================
// SIGN OUT REUSES <AccountMenu initialView="confirm-sign-out" />
// ============================================================================
// NOT a second confirmation. The whole reason `AccountMenu` is parameterised
// rather than duplicated is that a second sign-out flow is a second thing to
// keep in step with the rules that component exists to enforce: the
// `router.replace` BEFORE `signOut()` ordering, the cancel-first button order,
// and the copy. `PractitionerProfileScreen` already opens it this way — its own
// affordance is a destructive button, so the menu opens straight onto the
// confirmation instead of showing a second identical "Sign out" row.
//
// This screen is in exactly that position. The row below IS the "Sign out"
// affordance, so `initialView="confirm-sign-out"`, and `profileHref={null}`
// because the menu never reaches its menu view from here.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. Only expo-router is used.

import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { AppearanceSelector, AvatarWithFallback, Icon } from "@/components/ui";
import { ACCOUNT_MENU_PROFILE_HREF, AccountMenu, DetailShell } from "@/components/shell";
import { useTokenColor } from "@/lib/tokens";
import { useCurrentUser } from "@/hooks/use-current-user";

/** docs/MOBILE_UX.md: 44 is the floor, 48 is "the target to beat". */
const ROW_MIN_HEIGHT = 56;
const IDENTITY_AVATAR = 56;
const GLYPH = 20;

/**
 * A plain section label. NOT the shared `SectionHeader`, for the same reason
 * `AccountMenu` gave: that component is 44 tall and carries a trailing action
 * slot, which is the wrong role above a two-row settings group. The Figma frame
 * instances `Section Header` with `Show action = false`, and this is what that
 * reduces to.
 */
function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="font-label-md text-label-md text-on-surface-variant">{children}</Text>
  );
}

export function SettingsScreen() {
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const error = useTokenColor("error");

  // Unlike `AccountMenu`, this screen CAN read the user directly. That file
  // avoids the auth store because the shell mounts it on every patient screen,
  // so a static import would put `@/lib/config`'s require-time throw into ~10
  // unrelated suites. This screen is mounted by one route and its own suite, so
  // the constraint does not apply and the identity can be read rather than
  // threaded down through props.
  const user = useCurrentUser();
  const displayName = user?.displayName?.trim() || "Your account";
  // The selector has no `initials` field — every caller derives it. HomeScreen
  // takes `firstName[0]`; the same first letter of the display name is that,
  // without needing the name split.
  const initials = displayName[0]?.toUpperCase() ?? null;

  return (
    <DetailShell
      title="Settings"
      // No `actions`. The Figma frame hides `Detail AppBar`'s trailing slot:
      // Settings is a leaf reached from the avatar and there is nothing here to
      // share. An icon that looks live and does nothing is the defect the
      // tooltip pass existed to remove.
      testID="settings-screen"
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-lg px-md py-md"
        keyboardShouldPersistTaps="handled"
      >
        {/* Identity — this IS the Profile affordance. In the popover, identity
            and Profile were two stacked things (a non-interactive header row and
            a "Profile" menu row below it) because a 320dp panel had no room to
            merge them. A full-width card does, and one target that shows you
            whose account this is and opens it reads better than two. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${displayName}. View and edit your profile`}
          onPress={() => router.navigate(ACCOUNT_MENU_PROFILE_HREF)}
          className="flex-row items-center gap-3 rounded-card border border-outline-variant bg-card-surface p-md active:opacity-70"
        >
          <AvatarWithFallback
            size={IDENTITY_AVATAR}
            uri={user?.avatarUrl ?? null}
            initials={initials}
            label={displayName}
            // The Pressable already announces the name; labelling the avatar too
            // would read it twice.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <View className="flex-1">
            <Text className="font-label-md text-label-md text-on-surface" numberOfLines={1}>
              {displayName}
            </Text>
            {/* 13, not `text-body-md`'s 16. The frame specifies 13 and the
                device proved why: at 16 this line truncated to "View and edit
                your profi…" inside the 229dp the card leaves after the 56pt
                avatar, the 12 gaps and the chevron. Set through `style` because
                13 is not a step on the type scale — the same escape hatch
                HomeScreen uses — rather than inventing a `body-sm` utility that
                tailwind.config.js does not define and NativeWind would drop
                SILENTLY, falling back to unstyled system text. */}
            <Text
              className="font-body-md text-on-surface-variant"
              style={{ fontSize: 13 }}
              numberOfLines={1}
            >
              View and edit your profile
            </Text>
          </View>
          <Icon chrome="chevron-right" size={GLYPH} color={onSurfaceVariant} />
        </Pressable>

        {/* Appearance — the control this screen exists to give room to. */}
        <View className="gap-sm">
          <SectionLabel>Appearance</SectionLabel>
          <AppearanceSelector />
        </View>

        {/* Session. A centred `error`-toned row on its own card, not a filled
            red slab: the filled destructive treatment belongs to the CONFIRM
            dialog, which is still the second of the two guards. This row only
            opens it. */}
        <View className="gap-sm">
          <SectionLabel>Session</SectionLabel>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            accessibilityHint="Asks you to confirm first"
            onPress={() => setConfirmSignOut(true)}
            className="items-center justify-center rounded-card border border-outline-variant bg-card-surface px-md active:opacity-70"
            style={{ minHeight: ROW_MIN_HEIGHT }}
          >
            <Text className="font-label-md text-label-md" style={{ color: error }}>
              Sign out
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Confirmation only — see the header. `profileHref={null}` because the
          menu view is never reached from here. */}
      <AccountMenu
        visible={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        initialView="confirm-sign-out"
        profileHref={null}
        accountName={displayName}
        avatarInitials={initials}
        avatarUri={user?.avatarUrl ?? null}
      />
    </DetailShell>
  );
}
