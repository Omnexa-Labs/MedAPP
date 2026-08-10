import { Image, Text, View, type ViewProps } from "react-native";
import { AvatarWithFallback, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useTokenColor } from "@/lib/tokens";

export interface VideoParticipantProps extends ViewProps {
  name: string;
  videoUri?: string | null;
  avatarUri?: string | null;
  initials?: string | null;
  cameraOn?: boolean;
  microphoneOn?: boolean;
  local?: boolean;
  compact?: boolean;
  className?: string;
}

export function VideoParticipant({
  name,
  videoUri,
  avatarUri,
  initials,
  cameraOn = true,
  microphoneOn = true,
  local = false,
  compact = false,
  className,
  ...rest
}: VideoParticipantProps) {
  const inverseContent = useTokenColor("inverse-on-surface");

  return (
    <View
      accessibilityLabel={`${local ? "Your" : name} video${cameraOn ? "" : ", camera off"}`}
      className={cn(
        "overflow-hidden border border-outline-variant bg-inverse-surface",
        compact ? "rounded-md" : "rounded-card",
        className,
      )}
      {...rest}
    >
      {cameraOn && videoUri ? (
        <Image source={{ uri: videoUri }} className="h-full w-full" resizeMode="cover" />
      ) : (
        <View className="flex-1 items-center justify-center gap-3 bg-inverse-surface">
          <AvatarWithFallback
            uri={avatarUri}
            initials={initials}
            label={name}
            size={compact ? 44 : 72}
            tone="neutral"
          />
          {!compact && !cameraOn ? (
            <Text className="font-label-md text-label-md text-inverse-on-surface">
              Camera is off
            </Text>
          ) : null}
        </View>
      )}
      <View className="absolute bottom-2 left-2 flex-row items-center gap-1 rounded-full bg-scrim/60 px-2 py-1">
        <Icon chrome={microphoneOn ? "mic" : "mic-off"} size={14} color={inverseContent} />
        <Text
          className="max-w-[160px] font-label-sm text-label-sm text-inverse-on-surface"
          numberOfLines={1}
        >
          {local ? "You" : name}
        </Text>
      </View>
    </View>
  );
}
