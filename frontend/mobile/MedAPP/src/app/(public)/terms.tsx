// Placeholder legal page. Will likely link to an external URL via expo-web-browser.

import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";

export default function TermsRoute() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-gutter">
        <Text className="font-headline-lg text-headline-lg text-on-surface">Terms of Service</Text>
        <Text className="font-body-md text-body-md mt-sm text-center text-on-surface-variant">
          Coming next.
        </Text>
        <Link href="/(public)/sign-in" className="font-label-md text-label-md mt-lg text-primary">
          Back
        </Link>
      </View>
    </SafeAreaView>
  );
}
