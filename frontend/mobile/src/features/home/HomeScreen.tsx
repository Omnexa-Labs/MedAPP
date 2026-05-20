import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text className="text-2xl font-bold text-slate-900">Home</Text>
        <Text className="text-slate-500 mt-1">Your health snapshot.</Text>
        <View className="bg-white rounded-2xl p-4 mt-6 shadow-sm">
          <Text className="text-base font-semibold text-slate-900">Upcoming appointment</Text>
          <Text className="text-slate-500 mt-1">No appointments scheduled.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
