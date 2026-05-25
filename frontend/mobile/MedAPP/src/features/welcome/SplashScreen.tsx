// Splash screen — translation of the Stitch HTML to React Native.
//
// Class strings stay as close to the Stitch source as possible so future
// design tweaks paste back with minimal edits. The exceptions, called out
// inline below, are the things RN can't render through Tailwind:
//   - linear-gradient → expo-linear-gradient
//   - shadow-[0px_4px_20px_...] → platform shadow props
//   - blur-3xl → low-opacity solid (cheap, visually equivalent here)
//   - hover:/group-hover: → dropped (no hover on touch)
//   - active:scale-95 → Pressable `pressed` state

import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useWelcomeStore } from "@/store/welcome-store";

interface Props {
  onGetStarted?: () => void;
}

export function SplashScreen({ onGetStarted }: Props) {
  const completeWelcome = useWelcomeStore((s) => s.completeWelcome);

  const handlePress = () => {
    void completeWelcome();
    onGetStarted?.();
  };

  return (
    <View className="splash-gradient relative h-full w-full flex-1 overflow-hidden bg-background">
      <StatusBar style="dark" />

      {/* Replaces the Stitch `splash-gradient` CSS:
          background: linear-gradient(to bottom, transparent 0%, rgba(0,104,95,0.05) 100%) */}
      <LinearGradient
        colors={["transparent", "rgba(0,104,95,0.05)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        pointerEvents="none"
      />

      {/* Decorative top blob — Stitch uses `blur-3xl` over `bg-primary/10`. RN
          can't blur cheaply, so we use a low-opacity solid circle which reads
          the same at this scale. */}
      <View
        pointerEvents="none"
        className="pointer-events-none absolute left-1/2 top-0 w-full max-w-container-max -translate-x-1/2 px-gutter pt-xl opacity-20"
      >
        <View className="mx-auto h-64 w-64 rounded-full bg-primary/10" />
      </View>

      {/* SafeAreaView replaces the implicit viewport padding Stitch gets for free. */}
      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        <View className="relative flex-1 flex-col items-center justify-between">
          {/* Center branding */}
          <View className="z-10 flex-1 flex-col items-center justify-center">
            {/* The icon "card" — Stitch:
                p-lg rounded-[32px] bg-white shadow-[0px_4px_20px_rgba(71,85,105,0.05)] border border-outline-variant/30 */}
            <View
              className="mb-md rounded-[32px] border border-outline-variant/30 bg-white p-lg"
              style={{
                // Stitch shadow → RN platform shadow.
                shadowColor: "#475569",
                shadowOpacity: 0.05,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
              }}
            >
              <MaterialIcons name="health-and-safety" size={64} color="#00685f" />
            </View>

            <View className="items-center">
              <Text className="font-headline-xl text-headline-xl tracking-tight text-primary">
                MedApp
              </Text>
              <Text className="font-body-lg text-body-lg mt-sm max-w-[280px] text-center text-on-surface-variant">
                Personalized care for a modern world.
              </Text>
            </View>
          </View>

          {/* Bottom action */}
          <View className="z-10 w-full max-w-[400px] px-gutter pb-xl">
            <View className="flex-col items-center space-y-md">
              <Pressable
                testID="splash.getStarted"
                accessibilityRole="button"
                accessibilityLabel="Get started"
                onPress={handlePress}
                // Stitch: w-full py-4 px-lg bg-primary text-on-primary rounded-full shadow-lg
                //         hover:bg-primary-container active:scale-95
                className="w-full flex-row items-center justify-center gap-base rounded-full bg-primary px-lg py-4 active:scale-95"
                style={({ pressed }) => ({
                  // bg-primary → bg-primary-container on press (hover→press substitution).
                  backgroundColor: pressed ? "#008378" : "#00685f",
                  // shadow-lg ≈ this drop shadow on iOS; elevation 6 on Android.
                  shadowColor: "#00685f",
                  shadowOpacity: 0.25,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 6,
                })}
              >
                <Text className="font-label-md text-label-md text-on-primary">Get Started</Text>
                <MaterialIcons name="arrow-forward" size={18} color="#ffffff" />
              </Pressable>

              <Text className="font-label-sm text-label-sm mt-md text-outline">
                Trusted by 2M+ medical professionals
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
