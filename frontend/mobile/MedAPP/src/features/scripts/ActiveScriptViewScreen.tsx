// Active Script — View (Digital Prescription) screen. Translated from
// the Stitch "Digital Prescription" HTML.
//
// Reached from the Overview screen's Active Scripts → "View Rx" action.
// Sibling to ActiveScriptShareScreen — same naming family so future
// per-script surfaces stay parallel. The "Share Prescription" button
// here routes onward to the share screen, carrying the same params.
//
// Translation rules (same as the other screens):
//   - backdrop-blur glass header → opaque bg-surface + border + shadow.
//   - hover:* / group-hover:* / focus:ring / desktop mouse-parallax →
//     dropped (no hover/mouse on RN).
//   - The web "watermark" (rotated diagonal MEDAPP SECURE text) and the
//     "clinical-texture" dot grid are decorative; reproduced at the
//     same low opacity. The dot grid is a single faint repeating row
//     approximation — a full radial-dot tile would need an SVG/image,
//     not worth the weight for a 3% texture.
//   - The 2-column document body collapses to a single column on
//     mobile, matching the comp's md: breakpoints.
//   - Download triggers a fade+slide success toast via Animated,
//     mirroring the comp's #toast.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { BottomNav } from "@/features/home/components/BottomNav";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

export function ActiveScriptViewScreen() {
  const params = useLocalSearchParams<{
    drug?: string;
    patient?: string;
    scriptId?: string;
    prescriber?: string;
    issuedDate?: string;
    // Optional richer clinical fields. Fall back to the comp's sample
    // values when the caller only passes the core set.
    rxNumber?: string;
    dob?: string;
    clinic?: string;
    license?: string;
    quantity?: string;
    refills?: string;
    instructions?: string;
    indication?: string;
  }>();

  const drug = params.drug ?? "Lisinopril 10mg";
  const patient = params.patient ?? "Alex Rivers";
  const scriptId = params.scriptId ?? "#8829-X";
  const prescriber = params.prescriber ?? "Dr. Sarah Jenkins";
  const issuedDate = params.issuedDate ?? "Oct 12, 2023";
  const rxNumber = params.rxNumber ?? "#RX-992-Rivers";
  const dob = params.dob ?? "12/05/1988";
  const clinic = params.clinic ?? "Central Cardiology Center";
  const license = params.license ?? "MD-99283-A";
  const quantity = params.quantity ?? "30 Tablets";
  const refills = params.refills ?? "3 Remaining";
  const instructions = params.instructions ?? "Once daily in the morning";
  const indication = params.indication ?? "Hypertension management";

  // Download success toast — fade + slide, auto-dismiss after 3s.
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslate = useRef(new Animated.Value(16)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showDownloadToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(toastTranslate, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
    toastTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(toastTranslate, { toValue: 16, duration: 220, useNativeDriver: true }),
      ]).start();
    }, 3000);
  };

  const goShare = () => {
    router.push({
      pathname: "/(app)/active-script-share",
      params: { drug, patient, scriptId, prescriber, issuedDate },
    } as unknown as Href);
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* Top app bar — back + title + "Verified document" badge */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-md py-sm"
          style={appBarShadow}
        >
          <View className="flex-row items-center gap-sm">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={() => router.back()}
              className="rounded-full p-xs active:scale-95"
            >
              <MaterialIcons name="arrow-back" size={24} color="#00685f" />
            </Pressable>
            <Text className="font-headline-md text-headline-md text-primary">
              Digital Prescription
            </Text>
          </View>
          <View
            className="flex-row items-center gap-xs rounded-full bg-primary-container/10 px-sm py-xs"
            style={verifiedGlow}
          >
            <MaterialIcons name="verified" size={16} color="#00685f" />
            <Text className="font-label-md text-label-md text-primary">Verified</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 140, paddingTop: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Document card */}
          <View
            className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest"
            style={cardShadow}
          >
            {/* Watermark — rotated, very faint. Behind content (zIndex 0). */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: "44%",
                left: -40,
                right: -40,
                alignItems: "center",
                transform: [{ rotate: "-45deg" }],
                opacity: 0.04,
              }}
            >
              <Text
                className="font-headline-xl"
                style={{ fontSize: 64, fontWeight: "800", color: "#00685f" }}
              >
                MEDAPP SECURE
              </Text>
            </View>

            <View style={{ position: "relative", zIndex: 10, padding: 24 }}>
              {/* Document header */}
              <View className="flex-row items-start justify-between border-b border-outline-variant pb-md">
                <View>
                  <Text
                    className="font-headline-md text-primary"
                    style={{ fontSize: 24, fontWeight: "800", letterSpacing: -0.3 }}
                  >
                    MedApp
                  </Text>
                  <Text
                    className="font-label-sm text-label-sm uppercase text-on-surface-variant"
                    style={{ letterSpacing: 2 }}
                  >
                    Digital Prescription Rx
                  </Text>
                </View>
                <View className="items-end gap-xs">
                  <View className="rounded-lg bg-surface-container px-sm py-xs">
                    <Text className="font-label-md text-label-md text-outline">No. {rxNumber}</Text>
                  </View>
                  <Text className="font-body-md text-body-md text-on-surface-variant">
                    Issued: {issuedDate}
                  </Text>
                </View>
              </View>

              {/* Patient */}
              <Section label="Patient Information">
                <View className="rounded-lg bg-surface-container-low p-md">
                  <Text className="font-headline-md text-on-surface" style={{ fontSize: 22 }}>
                    {patient}
                  </Text>
                  <Text className="font-body-md text-body-md text-on-surface-variant">
                    ID: {scriptId} • DOB: {dob}
                  </Text>
                </View>
              </Section>

              {/* Prescriber */}
              <Section label="Prescriber Information">
                <Text className="font-headline-md text-on-surface" style={{ fontSize: 22 }}>
                  {prescriber}
                </Text>
                <Text className="font-body-md text-body-md font-semibold text-primary">
                  {clinic}
                </Text>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  License: {license}
                </Text>
              </Section>

              {/* Medication details — bordered tinted box */}
              <Section label="Medication Details">
                <View className="overflow-hidden rounded-xl border-2 border-primary/20 bg-primary/5 p-md">
                  <MaterialIcons
                    name="medication"
                    size={100}
                    color="rgba(0,104,95,0.10)"
                    style={{ position: "absolute", right: -12, top: -12 }}
                  />
                  <Text className="font-headline-md text-on-primary-fixed-variant" style={{ fontSize: 22 }}>
                    {drug}
                  </Text>
                  <View className="mt-sm flex-row gap-md">
                    <View className="flex-1">
                      <Text className="font-label-sm text-label-sm text-outline">Quantity</Text>
                      <Text className="font-body-md text-body-md font-bold text-on-surface">
                        {quantity}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-label-sm text-label-sm text-outline">Refills</Text>
                      <Text className="font-body-md text-body-md font-bold text-on-surface">
                        {refills}
                      </Text>
                    </View>
                  </View>
                </View>
              </Section>

              {/* Instructions */}
              <Section label="Instructions">
                <View className="flex-row items-start gap-sm rounded-lg bg-surface-container-low p-md">
                  <MaterialIcons name="schedule" size={22} color="#00685f" />
                  <Text
                    className="font-body-md text-body-md flex-1 text-on-surface"
                    style={{ fontStyle: "italic" }}
                  >
                    "{instructions}"
                  </Text>
                </View>
              </Section>

              {/* Indication + Pharmacy instructions */}
              <View className="mt-md border-t border-outline-variant pt-md">
                <Text className="font-label-md text-label-md mb-xs text-outline">Indication</Text>
                <Text className="font-body-md text-body-md text-on-surface">{indication}</Text>

                <View className="mt-md rounded-lg bg-surface-container p-md">
                  <Text className="font-label-md text-label-md mb-sm text-outline">
                    Pharmacy Instructions
                  </Text>
                  <Bullet>Dispense as written</Bullet>
                  <Bullet>Patient to monitor BP weekly</Bullet>
                </View>
              </View>

              {/* Digital sign & integrity */}
              <View className="mt-md flex-row items-center justify-between gap-md rounded-xl border border-outline-variant/30 bg-surface-container-high/30 p-md">
                <View className="flex-1 flex-row items-center gap-md">
                  <View className="h-16 w-16 items-center justify-center rounded-lg bg-white" style={cardShadow}>
                    <Image
                      source={{
                        uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuCO7czg_wrLN_fFOUZ-uRsXB6r-pnVQXduveqA4uuGvIaRtUgS71tbhh3ABZp3E_VFF6xODnsJKM8blNMnx0eFLovUf2ZVxcmWzpeqAHpkzngcKwx0gyCvE_s315tnn8JyBPVoX3K_xzi_XGTBUpmEo2pYMEXZ2eTUCckqZqPWZOpFNw-yq6_yfA-gK7-DzPw7YqNKZSecjL-UzRhgMOV9oKRNrqpOCK9rx0O76h0o80QGuTseZX4Sv3kl9iIBl8MEMgESnt1LQJFk6",
                      }}
                      style={{ width: 48, height: 48 }}
                      accessibilityLabel="Signature QR code"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-label-md text-label-md text-on-surface">
                      Security & Integrity
                    </Text>
                    <Text className="font-label-sm text-label-sm text-outline">
                      Digitally signed, timestamped, and end-to-end encrypted for your safety.
                    </Text>
                  </View>
                </View>
              </View>
              <View className="mt-sm items-start">
                <Text className="font-label-sm text-label-sm mb-xs text-outline">Signature Hash</Text>
                <Text
                  className="rounded bg-surface-container-highest px-xs py-xs text-on-surface-variant"
                  style={{ fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }), fontSize: 10 }}
                >
                  SHA-256: f1e2d3c4b5a6…
                </Text>
              </View>
            </View>
          </View>

          {/* Primary actions */}
          <View className="mt-lg gap-md">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share prescription"
              onPress={goShare}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 16,
                borderRadius: 12,
                backgroundColor: pressed ? "#005049" : "#00685f",
              })}
            >
              <MaterialIcons name="send" size={20} color="#ffffff" />
              <Text className="font-label-md text-label-md text-white">Share Prescription</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Download PDF"
              onPress={showDownloadToast}
              className="flex-row items-center justify-center gap-xs rounded-xl border border-outline-variant bg-surface-container-highest py-md active:scale-[0.98]"
            >
              <MaterialIcons name="download" size={20} color="#171d1c" />
              <Text className="font-label-md text-label-md text-on-surface">Download PDF</Text>
            </Pressable>
          </View>

          {/* Options bento */}
          <View className="mt-lg gap-md">
            <OptionCard
              icon="local-pharmacy"
              title="Send to Pharmacy"
              body="Directly integrate with local CVS or Walgreens."
              onPress={goShare}
            />
            <OptionCard
              icon="qr-code-2"
              title="One-Time QR"
              body="Generate a temporary code for physical scanning."
              onPress={goShare}
            />
            <OptionCard
              icon="print"
              title="Print Script"
              body="Standard format for physical pharmacy copies."
            />
          </View>
        </ScrollView>

        {/* Pushed from Overview — keep Overview highlighted. */}
        <BottomNav
          active="overview"
          onTabPress={(key) => {
            if (key === "home") router.back();
          }}
        />
      </SafeAreaView>

      {/* Download success toast */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 110,
          alignSelf: "center",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: "#2c3130",
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 999,
          opacity: toastOpacity,
          transform: [{ translateY: toastTranslate }],
        }}
      >
        <MaterialIcons name="check-circle" size={20} color="#89f5e7" />
        <Text className="font-label-md text-label-md" style={{ color: "#edf2f0" }}>
          Document downloaded successfully
        </Text>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mt-md">
      <Text
        className="font-label-md text-label-md mb-sm uppercase text-outline"
        style={{ letterSpacing: 1 }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View className="mb-xs flex-row items-center gap-sm">
      <View className="h-1.5 w-1.5 rounded-full bg-primary" />
      <Text className="font-label-md text-label-md text-on-surface-variant">{children}</Text>
    </View>
  );
}

function OptionCard({
  icon,
  title,
  body,
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-md active:bg-surface-container"
    >
      <MaterialIcons name={icon} size={24} color="#00685f" />
      <Text className="font-label-md text-label-md mt-sm text-on-surface">{title}</Text>
      <Text className="font-label-sm text-label-sm mt-xs text-outline">{body}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Shadows — same Platform.select pattern as the other screens.
// ---------------------------------------------------------------------------

const cardShadow =
  Platform.select({
    ios: {
      shadowColor: "#475569",
      shadowOpacity: 0.05,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 4 },
    },
    web: { boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.05)" },
    android: { elevation: 2 },
  }) || {};

const appBarShadow =
  Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    web: { boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.04)" },
    android: { elevation: 3 },
  }) || {};

// verified-badge-glow: box-shadow: 0 0 15px rgba(0,106,97,0.2)
const verifiedGlow =
  Platform.select({
    ios: {
      shadowColor: "#006a61",
      shadowOpacity: 0.2,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 0 },
    },
    web: { boxShadow: "0 0 15px rgba(0,106,97,0.2)" },
    android: { elevation: 2 },
  }) || {};
