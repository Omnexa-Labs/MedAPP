import { Text, View, type ViewProps } from "react-native";
import { Icon, type ChromeIconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useTokenColor, type ColorToken } from "@/lib/tokens";

export type ConnectionStatusTone = "connected" | "reconnecting" | "offline" | "failed";

export interface ConnectionStatusProps extends ViewProps {
  tone: ConnectionStatusTone;
  title?: string;
  detail?: string;
  compact?: boolean;
  className?: string;
}

const COPY: Record<ConnectionStatusTone, { title: string; icon: ChromeIconName }> = {
  connected: { title: "Connected", icon: "wifi" },
  reconnecting: { title: "Reconnecting…", icon: "sync" },
  offline: { title: "You’re offline", icon: "wifi-off" },
  failed: { title: "Call connection failed", icon: "error-outline" },
};

export function ConnectionStatus({
  tone,
  title,
  detail,
  compact = false,
  className,
  ...rest
}: ConnectionStatusProps) {
  const isError = tone === "offline" || tone === "failed";
  const isPending = tone === "reconnecting";
  const contentToken: ColorToken = isError
    ? "on-error-container"
    : isPending
      ? "on-secondary-container"
      : "on-success-container";
  const content = useTokenColor(contentToken);

  return (
    <View
      accessibilityLiveRegion={tone === "connected" ? "polite" : "assertive"}
      className={cn(
        "flex-row items-center gap-2 rounded-md",
        compact ? "px-3 py-2" : "p-3",
        isError
          ? "bg-error-container"
          : isPending
            ? "bg-secondary-container"
            : "bg-success-container",
        className,
      )}
      {...rest}
    >
      <Icon chrome={COPY[tone].icon} size={20} color={content} />
      <View className="min-w-0 flex-1">
        <Text
          className={cn(
            "font-label-md text-label-md",
            isError
              ? "text-on-error-container"
              : isPending
                ? "text-on-secondary-container"
                : "text-on-success-container",
          )}
        >
          {title ?? COPY[tone].title}
        </Text>
        {detail && !compact ? (
          <Text
            className={cn(
              "mt-1 font-label-sm text-label-sm",
              isError
                ? "text-on-error-container"
                : isPending
                  ? "text-on-secondary-container"
                  : "text-on-success-container",
            )}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
