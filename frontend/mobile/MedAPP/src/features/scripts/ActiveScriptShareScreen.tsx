// Active Script — Share screen. Translated from the Stitch "Share
// Prescription" HTML.
//
// Reached from the Overview screen's Active Scripts list: tapping
// "Share" on a script pushes this route with the script's details as
// params. There will be several "share" surfaces in the app (lab
// results, clinical records, etc.) — this one is specifically the
// active-prescription share, hence the ActiveScriptShare* naming. Keep
// future share screens parallel (e.g. LabResultShareScreen).
//
// Translation rules (same as HomeScreen / OverviewScreen):
//   - glass-header backdrop-blur → opaque bg-surface + border + shadow.
//   - hover:* / group-hover:* / focus:ring → dropped (no hover on RN).
//   - The two CSS overlay modals (#success-modal, #qr-modal) become
//     React Native <Modal> components, following the bottom-sheet /
//     centered-dialog pattern already used by CountryPickerModal in
//     SignUpVerifyScreen.
//   - active-pill gradient → a flat primary fill (RN has no CSS
//     gradient without a lib; the brand primary reads the same at this
//     size). The QR hero keeps a two-tone look via a tinted overlay.
//   - The 5-minute QR countdown is real local state (setInterval),
//     mirroring the script in the comp. No network — design-only pass.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useEffect, useRef, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { BottomNav } from "@/features/home/components/BottomNav";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// The Stitch "active-pill" — linear-gradient(135deg, #006a61 → #008378).
// 135deg = top-left → bottom-right, so start {0,0} end {1,1}.
// Typed `as const` so expo-linear-gradient sees the 2-tuple it requires.
const PILL_GRADIENT = ["#006a61", "#008378"] as const;
// The QR hero — bg-gradient-to-br from-primary(#00685f) to-primary-container(#008378).
const HERO_GRADIENT = ["#00685f", "#008378"] as const;
const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 1, y: 1 } as const;

// ---------------------------------------------------------------------------
// Params. All optional strings (route params arrive as strings); we
// fall back to the comp's sample values so the screen is never blank
// during design review or deep-linking without context.
// ---------------------------------------------------------------------------

interface NearbyPharmacy {
  id: string;
  name: string;
  detail: string;
}

const NEARBY_PHARMACIES: NearbyPharmacy[] = [
  { id: "cvs", name: "CVS Pharmacy", detail: "0.8 miles away • Open until 10 PM" },
  { id: "walgreens", name: "Walgreens", detail: "1.2 miles away • 24 Hours" },
];

const QR_TTL_SECONDS = 300; // 5:00, matches the comp

export function ActiveScriptShareScreen() {
  const params = useLocalSearchParams<{
    drug?: string;
    patient?: string;
    scriptId?: string;
    prescriber?: string;
    issuedDate?: string;
  }>();

  const drug = params.drug ?? "Lisinopril 10mg";
  const patient = params.patient ?? "Alex Rivers";
  const scriptId = params.scriptId ?? "#8829-X";
  const prescriber = params.prescriber ?? "Dr. Sarah Jenkins";
  const issuedDate = params.issuedDate ?? "Oct 12, 2023";

  // Which pharmacy card is mid-send (shows a spinner). null = none.
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL_SECONDS);

  // Track timers so we can clear them on unmount — leaking a setTimeout
  // that calls setState after unmount throws a warning.
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (sendTimer.current) clearTimeout(sendTimer.current);
      if (qrInterval.current) clearInterval(qrInterval.current);
    };
  }, []);

  const handleSend = (id: string) => {
    if (sendingId) return; // ignore double-taps mid-send
    setSendingId(id);
    // Simulated transmit — design-only. Real send hits the share API
    // in the wiring pass.
    sendTimer.current = setTimeout(() => {
      setSendingId(null);
      setSuccessVisible(true);
    }, 1500);
  };

  const openQr = () => {
    setSecondsLeft(QR_TTL_SECONDS);
    setQrVisible(true);
    if (qrInterval.current) clearInterval(qrInterval.current);
    qrInterval.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (qrInterval.current) clearInterval(qrInterval.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const closeQr = () => {
    setQrVisible(false);
    if (qrInterval.current) clearInterval(qrInterval.current);
  };

  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const timerLabel = `${mm}:${ss < 10 ? "0" : ""}${ss}`;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* Top app bar — back + title + verified/avatar */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-md py-sm"
          style={appBarShadow}
        >
          <View className="flex-row items-center gap-base">
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
              Share Prescription
            </Text>
          </View>
          <View className="flex-row items-center gap-sm">
            <MaterialIcons name="verified-user" size={22} color="#00685f" />
            <Image
              source={{
                uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuD6LAeX-YlXMlQGv0_wVk0DJGPhlaIcEgvqYrSVhPJeWnOwGnFALF3S-hBNLRbVXmsiOpbXZup8mZCqfByqANRcBBUJWzCRxNcYXQRDQX90x2cY4i6jue6aOc67_2Z1WQp1QY7uaqHLQo11jMgaFLIQnHHYcoRB55mqmVBoMt0AN-RFmPYz3Jn8qxe7KP4pDiHhFU7x5v5uSszvhkBWdFM62k1XSp2si-CpfpaJ0pPT_oMa0nlkHCtvoNBiwMgqirk01MAAmTKQr3oq",
              }}
              className="h-8 w-8 rounded-full border border-outline-variant"
              accessibilityLabel="Your profile"
            />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary card */}
          <View
            className="mt-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
            style={cardShadow}
          >
            <View className="mb-sm flex-row items-start justify-between">
              <View className="flex-1 pr-sm">
                <Text className="font-headline-md text-headline-md mb-xs text-primary">{drug}</Text>
                <View className="flex-row items-center gap-xs">
                  <MaterialIcons name="person" size={16} color="#3d4947" />
                  <Text className="font-body-md text-on-surface-variant">
                    {patient} • ID: {scriptId}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-xs rounded-full bg-primary/10 px-sm py-xs">
                <MaterialIcons name="lock" size={16} color="#00685f" />
                <Text className="font-label-sm text-label-sm text-primary">SECURE SCRIPT</Text>
              </View>
            </View>
            <View className="mt-sm flex-row gap-md border-t border-outline-variant pt-sm">
              <View className="flex-1">
                <Text className="text-label-sm uppercase text-outline" style={{ letterSpacing: 1 }}>
                  Prescriber
                </Text>
                <Text className="font-label-md text-label-md mt-xs text-on-surface">
                  {prescriber}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-label-sm uppercase text-outline" style={{ letterSpacing: 1 }}>
                  Issued Date
                </Text>
                <Text className="font-label-md text-label-md mt-xs text-on-surface">
                  {issuedDate}
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Send */}
          <View className="mt-lg">
            <View className="mb-sm flex-row items-center justify-between">
              <Text className="font-headline-md text-headline-md text-on-surface">Quick Send</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View nearby pharmacies"
                hitSlop={6}
                className="flex-row items-center gap-xs active:opacity-70"
              >
                <MaterialIcons name="map" size={16} color="#00685f" />
                <Text className="font-label-sm text-label-sm text-primary">View Nearby</Text>
              </Pressable>
            </View>
            <View className="gap-sm">
              {NEARBY_PHARMACIES.map((p) => (
                <View
                  key={p.id}
                  className="flex-row items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-sm"
                  style={cardShadow}
                >
                  <View className="flex-1 flex-row items-center gap-md">
                    <View className="h-12 w-12 items-center justify-center rounded-lg bg-surface-container">
                      <MaterialIcons name="local-pharmacy" size={28} color="#00685f" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-label-md text-label-md text-on-surface">{p.name}</Text>
                      <Text className="font-label-sm text-label-sm text-outline">{p.detail}</Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Send ${drug} to ${p.name}`}
                    disabled={sendingId !== null}
                    onPress={() => handleSend(p.id)}
                    style={({ pressed }) => ({
                      borderRadius: 999,
                      overflow: "hidden",
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                      opacity: sendingId && sendingId !== p.id ? 0.5 : 1,
                    })}
                  >
                    <LinearGradient
                      colors={PILL_GRADIENT}
                      start={GRADIENT_START}
                      end={GRADIENT_END}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 20,
                        paddingVertical: 10,
                      }}
                    >
                      {sendingId === p.id ? (
                        <MaterialIcons name="autorenew" size={16} color="#ffffff" />
                      ) : null}
                      <Text className="font-label-md text-label-md text-white">
                        {sendingId === p.id ? "Sending…" : "Send Now"}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          {/* Share Securely (QR hero) */}
          <View className="mt-lg">
            <Text className="font-headline-md text-headline-md mb-sm text-on-surface">
              Share Securely
            </Text>
            <LinearGradient
              colors={HERO_GRADIENT}
              start={GRADIENT_START}
              end={GRADIENT_END}
              style={[{ borderRadius: 12, overflow: "hidden", padding: 24 }, cardShadow]}
            >
              {/* Decorative blurred blob → a soft translucent circle. */}
              <View
                style={{
                  position: "absolute",
                  right: -48,
                  top: -48,
                  width: 192,
                  height: 192,
                  borderRadius: 96,
                  backgroundColor: "rgba(255,255,255,0.10)",
                }}
              />
              <View className="items-center">
                <View className="mb-md h-16 w-16 items-center justify-center rounded-full bg-white/20">
                  <MaterialIcons name="qr-code-2" size={36} color="#ffffff" />
                </View>
                <Text className="font-headline-md text-headline-md mb-xs text-white">
                  In-Person Dispensing
                </Text>
                <Text className="font-body-md text-body-md mb-md text-center text-on-primary-container/80">
                  Generate a temporary, encrypted QR code for a pharmacist to scan directly from your
                  device.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Generate one-time QR code"
                  onPress={openQr}
                  className="rounded-xl bg-surface-container-lowest px-lg py-sm active:scale-95"
                >
                  <Text className="font-label-md text-label-md text-primary">
                    Generate One-Time QR Code
                  </Text>
                </Pressable>
              </View>
            </LinearGradient>
          </View>

          {/* Other Options */}
          <View className="mt-lg">
            <Text className="font-headline-md text-headline-md mb-sm text-on-surface">
              Other Options
            </Text>
            <View className="gap-sm">
              <OtherOption icon="picture-as-pdf" label="Download PDF" />
              <OtherOption icon="print" label="Print Script" />
              <OtherOption icon="link" label="Copy Clinical Link" />
            </View>
          </View>

          {/* Security footer */}
          <View className="mt-lg flex-row items-center justify-center gap-sm border-t border-outline-variant/30 pt-lg">
            <MaterialIcons name="health-and-safety" size={16} color="#6d7a77" />
            <Text className="text-label-sm text-outline">
              HIPAA Compliant • 256-bit AES Encryption • Clinical Grade Security
            </Text>
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

      {/* Success modal */}
      <Modal
        visible={successVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSuccessVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(44,49,48,0.4)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View className="w-full max-w-sm items-center rounded-2xl bg-surface-container-lowest p-lg">
            <View className="mb-md h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <MaterialIcons name="check-circle" size={48} color="#00685f" />
            </View>
            <Text className="font-headline-md text-headline-md mb-xs text-primary">Script Sent!</Text>
            <Text className="font-body-md text-body-md mb-lg text-center text-on-surface-variant">
              Your prescription has been securely transmitted to the pharmacy. You will receive a
              notification when it's ready for pickup.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={() => setSuccessVisible(false)}
              style={({ pressed }) => ({
                width: "100%",
                borderRadius: 12,
                overflow: "hidden",
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <LinearGradient
                colors={PILL_GRADIENT}
                start={GRADIENT_START}
                end={GRADIENT_END}
                style={{ paddingVertical: 14, alignItems: "center" }}
              >
                <Text className="font-label-md text-label-md text-white">Done</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* QR modal */}
      <Modal
        visible={qrVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeQr}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(44,49,48,0.4)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-lg">
            <View className="mb-md flex-row items-center justify-between">
              <Text className="font-label-md text-label-md text-primary">One-Time Access Code</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close QR code"
                hitSlop={8}
                onPress={closeQr}
              >
                <MaterialIcons name="close" size={24} color="#6d7a77" />
              </Pressable>
            </View>
            <View className="mb-md rounded-2xl border-2 border-primary/20 bg-white p-md">
              <Image
                source={{
                  uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuDScQEMTVEwwlBgYyUNaJDZSI3snGuaNa827BojWmmZ7yxrveOXdFB6HFNurnZ5KF1pVPwXSOGcPXOcQ2YQRu88no-poClduBgyCFTlrjZLr9_mEWzRvsVWfkOJfYUenzk86ivinUw4veKhh9X6wVy5S-o9C-eaAt1RhNvB_nqDNQ-Q9Oe_oFsBirqfzRl74iK5vWAbc-OxVrCLa6Kmyi0_-w2l5sVGHOUxKVUW_E9V7dblIM-vq7gYhtEnZ7qWDJlvPYGHglkZKlcS",
                }}
                style={{ width: "100%", aspectRatio: 1, borderRadius: 8 }}
                resizeMode="contain"
                accessibilityLabel="Encrypted one-time QR code"
              />
            </View>
            <Text className="text-label-sm mb-base text-center text-outline">
              This code expires in{" "}
              <Text className="font-bold text-primary">{timerLabel}</Text>
            </Text>
            <View className="flex-row items-center justify-center gap-xs rounded-lg bg-primary-fixed p-xs">
              <MaterialIcons name="verified" size={16} color="#005049" />
              <Text className="text-label-sm text-on-primary-fixed-variant">IDENTITY VERIFIED</Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function OtherOption({ icon, label }: { icon: IconName; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md active:bg-surface-container"
    >
      <MaterialIcons name={icon} size={24} color="#00685f" />
      <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
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
