// Authenticated home screen — translated from the Stitch HTML.
//
// Translation calls:
//   - glass-card (rgba bg + backdrop-filter blur(12px)) → bg-white/80 with a
//     light border. RN can't backdrop-blur cheaply; identical at this opacity.
//   - ai-pulse keyframe → reanimated shared-value loop on the hero blob.
//   - horizontal scroll-snap → ScrollView horizontal with hidden scrollbar.
//   - hover:* / hover:bg-* / hover:text-* → dropped.
//   - The HTML uses a hard-coded "Good morning, Alex" — we greet by the
//     authenticated user's first name, falling back to "there".
//   - "Bottom Navigation Bar" → BottomNav component. Only Home is wired;
//     the other 4 tabs are visual stubs until their features ship.

import { useEffect } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useAuthStore } from "@/store/auth-store";
import { BottomNav } from "@/features/home/components/BottomNav";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

export function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";

  // ai-pulse: scale 1 → 1.1 → 1 over 3s, infinite. Matches the Stitch keyframe.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* Top app bar */}
        <View className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-gutter py-sm">
          <View className="flex-row items-center gap-sm">
            <View className="h-10 w-10 overflow-hidden rounded-full border-2 border-primary/20">
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} className="h-full w-full" />
              ) : (
                <View className="h-full w-full items-center justify-center bg-primary-container">
                  <Text className="font-label-md text-label-md text-on-primary-container">
                    {firstName[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
            </View>
            <Text className="font-headline-md text-headline-md text-primary">MedApp</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            hitSlop={8}
            className="rounded-full p-sm active:scale-95"
          >
            <MaterialIcons name="notifications" size={24} color="#00685f" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
        >
          {/* MedAI hero card */}
          <View className="mt-md overflow-hidden rounded-3xl bg-primary-container p-md">
            <Animated.View
              pointerEvents={Platform.OS === "web" ? undefined : "none"}
              style={[
                {
                  position: "absolute",
                  right: -40,
                  top: -40,
                  height: 160,
                  width: 160,
                  borderRadius: 80,
                  backgroundColor: "rgba(255,255,255,0.10)",
                  ...(Platform.OS === "web" ? { pointerEvents: "none" } : {}),
                },
                pulseStyle,
              ]}
            />
            <View
              pointerEvents={Platform.OS === "web" ? undefined : "none"}
              style={Platform.OS === "web" ? { pointerEvents: "none" } : undefined}
              className="absolute -bottom-5 -left-5 h-24 w-24 rounded-full bg-primary/20"
            />
            <View className="z-10 gap-sm">
              <View className="flex-row items-center gap-sm">
                <View className="rounded-xl bg-white/20 p-sm">
                  <MaterialIcons name="auto-awesome" size={22} color="#ffffff" />
                </View>
                <Text className="font-headline-md text-headline-md text-white">
                  MedAI Health Assistant
                </Text>
              </View>
              <Text className="font-body-md text-body-md text-white/90">
                Good morning, {firstName}. Based on your heart rate variability today, I
                recommend a lighter workout.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Talk to MedAI"
                onPress={() => router.push("/(app)/ai-assistant" as Href)}
                className="mt-sm w-fit flex-row items-center gap-sm self-start rounded-full bg-white px-md py-sm active:scale-95"
                style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 3,
                }}
              >
                <MaterialIcons name="chat-bubble" size={18} color="#00685f" />
                <Text className="font-label-md text-label-md text-primary">Talk to MedAI</Text>
              </Pressable>
            </View>
          </View>

          {/* Quick Services */}
          <Section title="Quick Services" actionLabel="View All">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 16, paddingHorizontal: 4, paddingBottom: 8 }}
            >
              <QuickService
                icon="medical-services"
                label="Find Care"
                tint="secondary"
                // The route exists at src/app/(app)/find-care.tsx — the
                // cast is here only because expo-router's typed-routes
                // generator runs at `expo start`, so the cached
                // .expo/types/router.d.ts may not list the new route
                // until the dev server is restarted. Safe to drop once
                // the union refreshes.
                onPress={() => router.push("/(app)/find-care" as Href)}
              />
              <QuickService
                icon="groups"
                label="Socials"
                tint="tertiary"
                onPress={() => router.push("/(app)/community" as Href)}
              />
              <QuickService icon="sync-alt" label="Smart Sync" tint="primary" />
              <QuickService icon="mail" label="Inbox" tint="neutral" />
              <QuickService icon="emergency" label="SOS" tint="error" />
            </ScrollView>
          </Section>

          {/* Health Insights */}
          <Section title="Your Health Insights">
            <View
              className="flex-row gap-sm rounded-3xl border border-outline-variant/30 bg-white p-md"
              style={cardShadow}
            >
              <Image
                source={{
                  uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuDitKmhL06lFouSTOJt1Irmj544WMCKIgxf_NX_hxvCqshakEhux4DoyutgVlXK9iiLMIcQIPw5P1dnG_sxJ7nKtl8fxQpZ7kn_rjsB5gzqskq40tduayv6XvHHtvxIxMMOa3yCks1CT4hrUwDPMn1rA2_gI0SrBlz1ea8huRnZBYzytlhGuRxwNBJDZp7DFLhe4N3CG9Dv-sVOyHPLs4Ww-H99IxQuIMyt8RyDrZIuKcCHFxH129slmuub1jcR9cjaIRLLPceA_UCa",
                }}
                className="h-20 w-20 rounded-2xl"
              />
              <View className="flex-1 justify-center gap-xs">
                <View className="w-fit flex-row items-center gap-xs self-start rounded-full bg-primary-container/20 px-sm py-xs">
                  <MaterialIcons name="bedtime" size={12} color="#008378" />
                  <Text className="font-label-sm text-label-sm uppercase tracking-wider text-primary">
                    Insight
                  </Text>
                </View>
                <Text className="font-headline-md text-on-surface" style={{ fontSize: 16 }}>
                  Focus on Recovery
                </Text>
                <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 14 }}>
                  MedAI suggests a 10-minute meditation based on your last 3 days of sleep.
                </Text>
              </View>
            </View>
          </Section>

          {/* Daily Wellness */}
          <Section title="Daily Wellness">
            <View className="gap-sm">
              <GlassRow
                icon="medication"
                tint="secondary"
                eyebrow="Next Medication"
                title="Vitamin D3 · 12:00 PM"
              />
              <GlassRow
                icon="restaurant"
                tint="tertiary"
                eyebrow="Lunch Recommendation"
                title="Grilled Salmon Salad"
              />
              <View className="mt-xs flex-row gap-sm">
                <InputTrigger icon="bedtime" label="Log Sleep" />
                <InputTrigger icon="fitness-center" label="Log Activity" />
              </View>
            </View>
          </Section>

          {/* Upcoming Appointments */}
          <Section
            title="Upcoming Appointments"
            actionLabel="View All"
            onAction={() => router.push("/(app)/appointments" as Href)}
          >
            <View
              className="gap-sm rounded-3xl border border-outline-variant/30 bg-white p-md"
              style={cardShadow}
            >
              <View className="flex-row items-center gap-sm">
                <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <MaterialIcons name="video-camera-front" size={30} color="#00685f" />
                </View>
                <View className="flex-1 flex-row items-start justify-between">
                  <View>
                    <Text
                      className="font-headline-md text-on-surface"
                      style={{ fontSize: 16 }}
                    >
                      Dr. Sarah Jenkins
                    </Text>
                    <Text className="font-label-md text-label-md text-on-surface-variant">
                      Cardiologist
                    </Text>
                  </View>
                  <View className="rounded-full bg-secondary-container px-sm py-xs">
                    <Text className="font-label-sm text-label-sm text-on-secondary-container">
                      Virtual
                    </Text>
                  </View>
                </View>
              </View>
              <View className="gap-xs rounded-2xl bg-surface-container-low p-sm">
                <View className="flex-row items-center gap-sm">
                  <MaterialIcons name="calendar-today" size={16} color="#3d4947" />
                  <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 14 }}>
                    Today, 2:30 PM
                  </Text>
                </View>
                <View className="flex-row items-center gap-sm">
                  <MaterialIcons name="location-on" size={16} color="#3d4947" />
                  <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 14 }}>
                    Virtual Consultation
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Join video call"
                onPress={() =>
                  // Route was added in this iteration. Expo Router's typedRoutes
                  // regenerates the union on next dev server start — cast bypasses
                  // the strict pathname check until then.
                  router.push({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    pathname: "/(app)/waiting-room" as any,
                    params: {
                      doctorName: "Dr. Sarah Jenkins",
                      doctorSpecialty: "Cardiologist • 15 Years Exp.",
                    },
                  })
                }
                className="w-full flex-row items-center justify-center gap-sm rounded-full bg-primary py-sm active:scale-95"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "#008378" : "#00685f",
                  shadowColor: "#00685f",
                  shadowOpacity: 0.25,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 6,
                })}
              >
                <MaterialIcons name="videocam" size={20} color="#ffffff" />
                <Text className="font-label-md text-label-md text-white">Join Call</Text>
              </Pressable>
            </View>
          </Section>
        </ScrollView>

        <BottomNav
          active="home"
          onTabPress={(key) => {
            // Overview, Community, and Lifestyle have shipped; Inbox still a stub.
            if (key === "overview") router.push("/(app)/overview" as Href);
            else if (key === "inbox") router.push("/(app)/inbox" as Href);
            else if (key === "community") router.push("/(app)/community" as Href);
            else if (key === "lifestyle") router.push("/(app)/lifestyle" as Href);
          }}
        />
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local primitives. Promote to components/ui once a second screen needs them.
// ---------------------------------------------------------------------------

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#475569",
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
  },
  web: {
    boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.05)",
  },
  android: {
    elevation: 2,
  },
}) || {};

function Section({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-lg">
      <View className="mb-sm flex-row items-center justify-between px-xs">
        <Text className="font-headline-md text-on-surface-variant" style={{ fontSize: 18 }}>
          {title}
        </Text>
        {actionLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel} ${title}`}
            hitSlop={6}
            onPress={onAction}
            className="active:scale-95"
          >
            <Text className="font-label-md text-label-md text-primary">{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

type Tint = "primary" | "secondary" | "tertiary" | "neutral" | "error";

const TINTS: Record<Tint, { bg: string; fg: string }> = {
  primary: { bg: "bg-primary/10", fg: "#00685f" },
  secondary: { bg: "bg-secondary-container", fg: "#3a485b" },
  tertiary: { bg: "bg-tertiary-fixed", fg: "#0058be" },
  neutral: { bg: "bg-surface-container-high", fg: "#3d4947" },
  error: { bg: "bg-error-container", fg: "#ba1a1a" },
};

function QuickService({
  icon,
  label,
  tint,
  onPress,
}: {
  icon: IconName;
  label: string;
  tint: Tint;
  onPress?: () => void;
}) {
  const t = TINTS[tint];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="items-center gap-sm active:scale-95"
    >
      <View
        className={`h-16 w-16 items-center justify-center rounded-2xl ${t.bg}`}
        style={cardShadow}
      >
        <MaterialIcons name={icon} size={28} color={t.fg} />
      </View>
      <Text className="font-label-md text-label-md text-on-surface-variant">{label}</Text>
    </Pressable>
  );
}

function GlassRow({
  icon,
  tint,
  eyebrow,
  title,
}: {
  icon: IconName;
  tint: Tint;
  eyebrow: string;
  title: string;
}) {
  const t = TINTS[tint];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}: ${title}`}
      className="flex-row items-center justify-between rounded-2xl border border-outline-variant/30 bg-white/80 p-sm active:scale-[0.99]"
    >
      <View className="flex-row items-center gap-sm">
        <View className={`h-12 w-12 items-center justify-center rounded-full ${t.bg}`}>
          <MaterialIcons name={icon} size={22} color={t.fg} />
        </View>
        <View>
          <Text className="font-label-md text-label-md text-on-surface-variant">{eyebrow}</Text>
          <Text className="font-headline-md text-on-surface" style={{ fontSize: 16 }}>
            {title}
          </Text>
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#6d7a77" />
    </Pressable>
  );
}

function InputTrigger({ icon, label }: { icon: IconName; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center justify-center gap-sm rounded-2xl border border-outline-variant/20 bg-surface-container-low py-md active:scale-95"
    >
      <MaterialIcons name={icon} size={28} color="#00685f" />
      <Text className="font-label-md text-label-md text-on-surface-variant">{label}</Text>
    </Pressable>
  );
}
