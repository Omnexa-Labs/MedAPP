import { Pressable, Text, View, type PressableProps } from "react-native";
import { Icon, type ChromeIconName, type HealthIconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useTokenColor, type ColorToken } from "@/lib/tokens";

export type MediaControlKind = "microphone" | "camera" | "settings" | "message" | "end";
export type MediaControlAppearance = "page" | "call";

export interface MediaControlProps extends Omit<PressableProps, "children" | "style"> {
  kind: MediaControlKind;
  active?: boolean;
  appearance?: MediaControlAppearance;
  label: string;
  showLabel?: boolean;
  size?: 44 | 48 | 56 | 64;
  className?: string;
}

type Glyph = { chrome: ChromeIconName } | { name: HealthIconName };

function glyphFor(kind: MediaControlKind, active: boolean): Glyph {
  if (kind === "microphone") return { chrome: active ? "mic" : "mic-off" };
  if (kind === "camera") return { chrome: active ? "videocam" : "videocam-off" };
  if (kind === "settings") return { name: "settings" };
  if (kind === "message") return { name: "message" };
  return { chrome: "call-end" };
}

export function MediaControl({
  kind,
  active = true,
  appearance = "page",
  label,
  showLabel = false,
  size = 48,
  disabled,
  className,
  ...pressableProps
}: MediaControlProps) {
  const destructive = kind === "end";
  const fillToken: ColorToken = destructive
    ? "error"
    : !active
      ? "error-container"
      : appearance === "call"
        ? "surface-container-high"
        : "surface-container-low";
  const contentToken: ColorToken = destructive
    ? "on-error"
    : !active
      ? "on-error-container"
      : appearance === "call"
        ? "on-surface"
        : "primary";
  const fill = useTokenColor(fillToken);
  const content = useTokenColor(contentToken);
  const glyph = glyphFor(kind, active);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: active }}
      disabled={disabled}
      className={cn("items-center gap-1", className)}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.72 : 1 })}
      {...pressableProps}
    >
      <View
        className="items-center justify-center rounded-full"
        style={{ width: size, height: size, backgroundColor: fill }}
      >
        {"chrome" in glyph ? (
          <Icon chrome={glyph.chrome} size={size >= 56 ? 28 : 24} color={content} />
        ) : (
          <Icon name={glyph.name} size={size >= 56 ? 28 : 24} color={content} />
        )}
      </View>
      {showLabel ? (
        <Text
          className={cn(
            "font-label-sm text-label-sm",
            appearance === "call" ? "text-inverse-on-surface" : "text-on-surface-variant",
          )}
          numberOfLines={1}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
