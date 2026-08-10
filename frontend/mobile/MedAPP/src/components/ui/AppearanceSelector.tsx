// AppearanceSelector — the dark-mode control.
//
// Lives in Settings → Appearance (see docs/BRAND.md). Deliberately a 3-way
// segmented control rather than an on/off switch: "System" has to be reachable,
// and it's the default, so a binary toggle would strand users who want the app
// to follow the OS.
//
// Icons go through the shared <Icon />, like every other glyph in the app.
// Light/dark/auto are UI chrome, and Health Icons ships no chrome, so these are
// `chrome=` names — see docs/BRAND.md > Iconography. This file used to import
// MaterialIcons directly with a "revisit once the icon library is chosen"
// comment; the library has been chosen, and `icons/Icon.tsx` is the single place
// an icon library may be imported.

import { Pressable, Text, View, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";
import { Icon, type ChromeIconName } from "@/components/ui/icons/Icon";
import { useTokenColor } from "@/lib/tokens";
import { APPEARANCE_OPTIONS, useAppearanceStore, type Appearance } from "@/lib/theme";

const META: Record<Appearance, { label: string; icon: ChromeIconName; hint: string }> = {
  system: { label: "System", icon: "brightness-auto", hint: "Match device setting" },
  light: { label: "Light", icon: "light-mode", hint: "Always light" },
  dark: { label: "Dark", icon: "dark-mode", hint: "Always dark" },
};

export function AppearanceSelector({ className, ...rest }: ViewProps & { className?: string }) {
  const appearance = useAppearanceStore((s) => s.appearance);
  const setAppearance = useAppearanceStore((s) => s.setAppearance);
  const onPrimary = useTokenColor("on-primary");
  const onSurfaceVariant = useTokenColor("on-surface-variant");

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Appearance"
      className={cn(
        "flex-row rounded-xl border border-outline-variant/40 bg-surface-container p-xs",
        className,
      )}
      {...rest}
    >
      {APPEARANCE_OPTIONS.map((opt) => {
        const active = appearance === opt;
        const meta = META[opt];
        return (
          <Pressable
            key={opt}
            onPress={() => setAppearance(opt)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={meta.label}
            accessibilityHint={meta.hint}
            // 44pt min target per BRAND.md.
            className={cn(
              "min-h-[44px] flex-1 flex-row items-center justify-center gap-xs rounded-lg px-sm py-xs active:opacity-80",
              active ? "bg-primary" : "bg-transparent",
            )}
          >
            <Icon
              chrome={meta.icon}
              size={18}
              // Selected sits on `primary`, so it must use on-primary — which
              // flips to a dark tone in dark mode, per the M3 tone mapping.
              // Resolved through the token map rather than a className: no
              // cssInterop is registered for icon components, so a Tailwind
              // colour class on a glyph was relying on generic interop instead
              // of the resolved-token path every other <Icon /> uses.
              color={active ? onPrimary : onSurfaceVariant}
            />
            <Text
              className={cn(
                "font-label-md text-label-md",
                active ? "text-on-primary" : "text-on-surface-variant",
              )}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
