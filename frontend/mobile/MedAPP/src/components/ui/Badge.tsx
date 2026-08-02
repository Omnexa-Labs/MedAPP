// Badge — the small, uppercase, high-letter-spacing tag: status/role chips like
// "Specialist", "Online", "Synced Live". Background is a 10% tint of the tone
// colour with matching text.
//
// Two docs/BRAND.md violations fixed here while the form treatment was being
// landed, because both are the same class of bug as the card's grey shadow:
//
//  1. The tone table carried hardcoded icon hexes (`#00685f`, `#0058be`,
//     `#ba1a1a`, `#3d4947`) — light-mode values frozen into JS. In dark mode the
//     `bg-primary/10` tint and the `text-primary` label both flipped while the
//     ICON stayed dark teal, so a badge in dark mode showed a near-invisible
//     glyph next to a bright label. Icon colours now resolve by TOKEN NAME for
//     the current mode via src/lib/tokens.ts.
//  2. It imported MaterialIcons directly. Per docs/BRAND.md, icons/Icon.tsx is
//     the only file allowed to touch an icon library; the glyph now goes through
//     <Icon />. The `icon` prop still takes the same chrome names, so no call
//     site changes.

import { Text, View, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";
import { useResolvedScheme } from "@/lib/theme";
import { tokenColor, type ColorToken } from "@/lib/tokens";
import { Icon, type ChromeIconName } from "./icons/Icon";

export type BadgeTone = "primary" | "success" | "info" | "error" | "neutral";

interface Props extends ViewProps {
  label: string;
  /** UI-chrome glyph, forwarded to <Icon chrome=… />. */
  icon?: ChromeIconName;
  tone?: BadgeTone;
  className?: string;
}

/**
 * `bg`/`text` are Tailwind classes (NativeWind themes those for free); `icon` is
 * a TOKEN NAME, resolved to the current mode at render because <Icon /> takes a
 * colour string. It always matches the `text` class's token — the glyph and the
 * label are one piece of content and must never drift apart per mode.
 *
 * `success` and `primary` share the brand teal in this palette; kept as separate
 * tones so call sites read intent rather than colour.
 */
const TONE: Record<BadgeTone, { bg: string; text: string; icon: ColorToken }> = {
  primary: { bg: "bg-primary/10", text: "text-primary", icon: "primary" },
  success: { bg: "bg-primary/10", text: "text-primary", icon: "primary" },
  info: { bg: "bg-tertiary/10", text: "text-tertiary", icon: "tertiary" },
  error: { bg: "bg-error/10", text: "text-error", icon: "error" },
  neutral: {
    bg: "bg-surface-container-high",
    text: "text-on-surface-variant",
    icon: "on-surface-variant",
  },
};

export function Badge({ label, tone = "primary", icon, className, ...rest }: Props) {
  const t = TONE[tone];
  const { scheme } = useResolvedScheme();

  return (
    <View
      className={cn(
        "flex-row items-center gap-xs self-start rounded-full px-sm py-xs",
        t.bg,
        className,
      )}
      {...rest}
    >
      {icon && <Icon chrome={icon} size={12} color={tokenColor(t.icon, scheme)} />}
      {/* caption ramp = 10px/600/uppercase tracking — the badge rule. */}
      <Text className={cn("font-inter-semibold text-[10px] uppercase tracking-[0.05em]", t.text)}>
        {label}
      </Text>
    </View>
  );
}
