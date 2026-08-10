import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";
import { useTokenShadow } from "@/lib/tokens";
import { MediaControl, type MediaControlAppearance } from "./MediaControl";

export interface CallControlsBarProps extends ViewProps {
  microphoneOn: boolean;
  cameraOn: boolean;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
  onOpenSettings?: () => void;
  onOpenMessages?: () => void;
  appearance?: MediaControlAppearance;
  className?: string;
}

export function CallControlsBar({
  microphoneOn,
  cameraOn,
  onToggleMicrophone,
  onToggleCamera,
  onEndCall,
  onOpenSettings,
  onOpenMessages,
  appearance = "call",
  className,
  style,
  ...rest
}: CallControlsBarProps) {
  const floatingShadow = useTokenShadow("shadow", { y: 2, blur: 6, opacity: 0.08 });

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Call controls"
      className={cn(
        "min-h-[80px] flex-row items-center justify-center gap-3 rounded-card border border-outline-variant bg-card-surface p-3",
        className,
      )}
      style={[floatingShadow, style]}
      {...rest}
    >
      <MediaControl
        kind="microphone"
        appearance={appearance}
        active={microphoneOn}
        label={microphoneOn ? "Mute microphone" : "Unmute microphone"}
        onPress={onToggleMicrophone}
      />
      <MediaControl
        kind="camera"
        appearance={appearance}
        active={cameraOn}
        label={cameraOn ? "Turn camera off" : "Turn camera on"}
        onPress={onToggleCamera}
      />
      {onOpenSettings ? (
        <MediaControl
          kind="settings"
          appearance={appearance}
          label="Device settings"
          onPress={onOpenSettings}
        />
      ) : null}
      {onOpenMessages ? (
        <MediaControl
          kind="message"
          appearance={appearance}
          label="Open messages"
          onPress={onOpenMessages}
        />
      ) : null}
      <MediaControl
        kind="end"
        appearance={appearance}
        label="End call"
        size={56}
        onPress={onEndCall}
      />
    </View>
  );
}
