// Splash / Welcome — rebuilt from the approved Figma frame
// "Onboarding & Auth / Splash / Welcome" (node 50:105).
//
// The frame is laid out absolutely on a 375×812 canvas; it's reproduced here as
// a fluid column so it also fills the canonical 393px viewport and taller
// devices:
//   - Center Zone (flex-1, centred, 24px gaps): app-icon mark → "MedApp"
//     (headline-xl / primary) → 280px-wide subtitle (body-md)
//   - Bottom Zone (24px gutter, 48px bottom inset, 24px gaps): full-width pill
//     CTA → "Trusted by…" caption → "Already have an account? Sign In"
//
// Product-owner revisions to the original frame (frame 50:105 updated to match):
//   - the decorative 256px blob behind the mark is removed.
//   - the 160px surface tile that framed the mark is removed; the app-icon
//     already has its own rounded-square container, so the extra tile read as a
//     stray background panel. The mark now sits at 128px on the background.

import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Button, Logo } from "@/components/ui";
import { useWelcomeStore } from "@/store/welcome-store";

interface Props {
  onGetStarted?: () => void;
  onSignIn?: () => void;
}

export function SplashScreen({ onGetStarted, onSignIn }: Props) {
  const completeWelcome = useWelcomeStore((s) => s.completeWelcome);

  // Preserved from the previous implementation: leaving the splash marks the
  // welcome flow as seen, so the root layout stops routing back here.
  const handleGetStarted = () => {
    void completeWelcome();
    onGetStarted?.();
  };

  const handleSignIn = () => {
    void completeWelcome();
    onSignIn?.();
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="auto" />

      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        {/* Center Zone — node 51:109 */}
        <View className="flex-1 items-center justify-center gap-md">
          {/* The app-icon mark, presented directly on the background.
              Per the product owner: the decorative blob (was node 51:108) and
              the surface tile that used to sit behind the mark (was node
              51:110) are both removed — the mark carries its own rounded-square
              container, so wrapping it in a second box read as a stray
              background panel. Frame 50:105 is updated to match. */}
          <Logo variant="icon" height={128} />

          <Text className="text-center font-headline-xl text-headline-xl text-primary">MedApp</Text>

          <Text className="w-[280px] text-center font-body-md text-body-md text-on-surface-variant">
            Personalized care for a modern world.
          </Text>
        </View>

        {/* Bottom Zone — node 51:113 */}
        <View className="items-center justify-center gap-md px-md pb-lg">
          <Button
            testID="splash.getStarted"
            label="Get Started"
            variant="primary"
            size="cta"
            trailingIcon="arrow-forward"
            onPress={handleGetStarted}
          />

          <Text className="text-center font-label-sm text-label-sm text-on-surface-variant">
            Trusted by 2M+ medical professionals
          </Text>

          {/* The frame gives this link 12px padding around 12px text, which is a
              ~36pt target. The padding is kept for fidelity and the row is
              floored at the 44pt minimum instead. */}
          <Pressable
            testID="splash.signIn"
            accessibilityRole="link"
            accessibilityLabel="Already have an account? Sign in"
            onPress={handleSignIn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ minHeight: 44 }}
            className="items-center justify-center p-sm active:opacity-70"
          >
            <Text className="text-center font-label-sm text-label-sm text-primary">
              Already have an account? Sign In
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
