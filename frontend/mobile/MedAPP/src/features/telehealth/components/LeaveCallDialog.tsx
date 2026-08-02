import { Modal, Pressable, Text, View } from "react-native";
import { Button } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

export type LeaveCallDialogMode = "waiting-room" | "active-call";

export interface LeaveCallDialogProps {
  visible: boolean;
  mode: LeaveCallDialogMode;
  onCancel: () => void;
  onConfirm: () => void;
  participantName?: string;
}

const DIALOG_COPY: Record<
  LeaveCallDialogMode,
  { title: string; body: (participantName?: string) => string; confirm: string; cancel: string }
> = {
  "waiting-room": {
    title: "Leave the waiting room?",
    body: (name) =>
      name
        ? `You’ll leave ${name}’s waiting room. You can return from your appointment.`
        : "You’ll leave this waiting room. You can return from your appointment.",
    confirm: "Leave waiting room",
    cancel: "Keep waiting",
  },
  "active-call": {
    title: "End this call?",
    body: () => "The consultation will end for you. This action cannot be undone.",
    confirm: "End call",
    cancel: "Stay on call",
  },
};

export function LeaveCallDialog({
  visible,
  mode,
  onCancel,
  onConfirm,
  participantName,
}: LeaveCallDialogProps) {
  const copy = DIALOG_COPY[mode];
  const error = useTokenColor("error");
  const onError = useTokenColor("on-error");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close confirmation"
        className="flex-1 items-center justify-center bg-scrim/40 px-4"
        onPress={onCancel}
      >
        <Pressable
          accessibilityViewIsModal
          accessibilityRole="none"
          className="w-full max-w-[361px] rounded-card border border-outline-variant bg-card-surface p-6"
          onPress={(event) => event.stopPropagation()}
        >
          <Text className="font-headline-md text-headline-md text-on-surface">{copy.title}</Text>
          <Text className="mt-3 font-body-md text-body-md text-on-surface-variant">
            {copy.body(participantName)}
          </Text>
          <View className="mt-6 gap-3">
            <Button label={copy.cancel} variant="outline" shadow={false} onPress={onCancel} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.confirm}
              onPress={onConfirm}
              className="min-h-[48px] w-full items-center justify-center rounded-full px-4 py-3"
              style={({ pressed }) => ({
                backgroundColor: error,
                opacity: pressed ? 0.78 : 1,
              })}
            >
              <Text className="font-label-md text-label-md" style={{ color: onError }}>
                {copy.confirm}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
