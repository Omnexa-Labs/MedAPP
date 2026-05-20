import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/authStore";

export function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-bold text-slate-900">Profile</Text>
        <Text className="text-slate-500 mt-1">Manage your account.</Text>

        <View className="bg-slate-50 rounded-2xl p-4 mt-6">
          <Text className="text-xs uppercase tracking-wide text-slate-400">Name</Text>
          <Text className="text-base text-slate-900 mt-1">{user?.fullName ?? "—"}</Text>

          <Text className="text-xs uppercase tracking-wide text-slate-400 mt-4">Email</Text>
          <Text className="text-base text-slate-900 mt-1">{user?.email ?? "—"}</Text>

          <Text className="text-xs uppercase tracking-wide text-slate-400 mt-4">Role</Text>
          <Text className="text-base text-slate-900 mt-1 capitalize">{user?.role ?? "—"}</Text>
        </View>

        <Pressable
          onPress={signOut}
          className="mt-10 border border-red-200 rounded-lg py-3 items-center active:opacity-80"
        >
          <Text className="text-red-600 font-semibold">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
