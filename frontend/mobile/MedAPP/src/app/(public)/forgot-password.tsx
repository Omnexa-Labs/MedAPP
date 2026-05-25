// Placeholder. Real screen lands when you send the Stitch dump.

import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";

export default function ForgotPasswordRoute() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-gutter">
        <Text className="font-headline-lg text-headline-lg text-on-surface">Forgot password</Text>
        <Text className="font-body-md text-body-md mt-sm text-center text-on-surface-variant">
          Coming next.
        </Text>
        <Link
          href="/(public)/sign-in"
          className="font-label-md text-label-md mt-lg text-primary"
        >
          Back to sign in
        </Link>
      </View>
    </SafeAreaView>
  );
}
