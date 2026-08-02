import { Text, View, type ViewProps } from "react-native";
import { Icon, type ChromeIconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useTokenColor, type ColorToken } from "@/lib/tokens";

export type HardwareKind = "microphone" | "camera" | "connection";
export type HardwareStatus = "ready" | "off" | "blocked" | "checking";

export interface HardwareCheckRowProps extends ViewProps {
  kind: HardwareKind;
  label: string;
  status: HardwareStatus;
  detail?: string;
  className?: string;
}

const HARDWARE_ICON: Record<HardwareKind, ChromeIconName> = {
  microphone: "mic",
  camera: "videocam",
  connection: "wifi",
};

const STATUS_COPY: Record<HardwareStatus, string> = {
  ready: "Ready",
  off: "Off",
  blocked: "Permission blocked",
  checking: "Checking…",
};

export function HardwareCheckRow({
  kind,
  label,
  status,
  detail,
  className,
  ...rest
}: HardwareCheckRowProps) {
  const isReady = status === "ready";
  const isChecking = status === "checking";
  const contentToken: ColorToken = isReady ? "success" : isChecking ? "secondary" : "error";
  const content = useTokenColor(contentToken);

  return (
    <View className={cn("min-h-[44px] flex-row items-center gap-3 py-2", className)} {...rest}>
      <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-low">
        <Icon chrome={HARDWARE_ICON[kind]} size={22} color={content} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
        {detail ? (
          <Text className="mt-1 font-label-sm text-label-sm text-on-surface-variant">{detail}</Text>
        ) : null}
      </View>
      <View className="max-w-[45%] flex-row items-center justify-end gap-1">
        <Icon
          chrome={isReady ? "check-circle" : isChecking ? "hourglass-empty" : "error-outline"}
          size={18}
          color={content}
        />
        <Text
          className={cn(
            "font-label-sm text-label-sm",
            isReady ? "text-success" : isChecking ? "text-secondary" : "text-error",
          )}
        >
          {STATUS_COPY[status]}
        </Text>
      </View>
    </View>
  );
}
