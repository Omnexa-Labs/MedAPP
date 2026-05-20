import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function ChatScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-slate-900">Chat</Text>
        <Text className="text-slate-500 mt-2 text-center">
          Conversations with your care team will appear here.
        </Text>
      </View>
    </SafeAreaView>
  );
}
