import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function SignUpScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-slate-900">Sign up</Text>
        <Text className="text-slate-500 mt-2">Coming soon.</Text>
      </View>
    </SafeAreaView>
  );
}
