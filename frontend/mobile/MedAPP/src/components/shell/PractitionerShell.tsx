// PractitionerShell — app bar + body + bottom nav, in one wrapper.
//
// Screens own their content, not their chrome (docs/BRAND.md §App shell). This
// composes the two approved practitioner components — PractitionerAppBar
// (Figma 656:850) and PractitionerBottomNav (Figma 381:628) — so that the next
// practitioner screen cannot accidentally ship a fourth tab, a left-aligned
// logo, or a differently-sized bell.
//
// FLAGGED — frame 72:117 carries BOTH a back button and the bottom nav, which
// docs/BRAND.md §App shell forbids ("Detail screens don't get the bottom nav —
// they get a back button in the app bar instead"). The practitioner AppBar's own
// Figma description says back is "always available", i.e. the practitioner shell
// is specified as back + tabs together. Followed the frame; BRAND.md's rule is
// written for the patient shell and needs a practitioner carve-out.
//
// `children` is the body and is given `flex-1`, so a screen passes its own
// ScrollView (with its own gutter and content padding) straight in.

import { View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { Href } from "expo-router";
import { useResolvedScheme } from "@/lib/theme";
import { PractitionerAppBar } from "./PractitionerAppBar";
import { PractitionerBottomNav, type PractitionerTab } from "./PractitionerBottomNav";
import { WebColumn } from "./WebColumn";

interface Props extends Pick<ViewProps, "testID"> {
  /** Which tab renders as selected. */
  activeTab?: PractitionerTab;
  /** Use for a tab root; drill-down screens should retain the normal back action. */
  hideBack?: boolean;
  backFallbackHref?: Href;
  onBackPress?: () => void;
  unreadCount?: number;
  onNotificationsPress?: () => void;
  /**
   * Forwarded to PractitionerBottomNav. Every practitioner screen reaches the
   * nav through this Shell, so without the passthrough the nav's documented
   * escape hatch — intercept a tab to warn about unsaved work, return `true` to
   * mean "handled, don't navigate" — is unreachable in practice.
   */
  onTabPress?: (key: PractitionerTab) => boolean | void;
  children: React.ReactNode;
}

export function PractitionerShell({
  activeTab = "home",
  hideBack = false,
  backFallbackHref,
  onBackPress,
  unreadCount,
  onNotificationsPress,
  onTabPress,
  children,
  testID,
}: Props) {
  const { scheme } = useResolvedScheme();

  return (
    <View className="flex-1 bg-background" testID={testID}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {/* The bottom edge is handled inside PractitionerBottomNav, which needs the
          inset as padding so its own `surface` fill runs under the gesture bar
          instead of leaving a strip of canvas. */}
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* Web only; renders nothing on native. See WebColumn's header. */}
        <WebColumn>
          <PractitionerAppBar
            hideBack={hideBack}
            backFallbackHref={backFallbackHref}
            onBackPress={onBackPress}
            unreadCount={unreadCount}
            onNotificationsPress={onNotificationsPress}
          />
          <View className="flex-1">{children}</View>
          <PractitionerBottomNav active={activeTab} onTabPress={onTabPress} />
        </WebColumn>
      </SafeAreaView>
    </View>
  );
}
