// Chat Thread screen — the focused one-on-one message conversation view.
// Reached from:
//   • InboxScreen → tap any ConversationItem
//   • PractitionerSocialProfileScreen → "Message" button
//
// This is a PUSHED screen (not a root tab), so:
//   - No BottomNav (same rationale as AiAssistantScreen — too much bottom
//     furniture when the keyboard is up on a focused chat journey).
//   - Back arrow is the return affordance.
//
// Translation calls (HTML → React Native):
//   - backdrop-blur header → opaque bg-surface/80 + border + shadow.
//   - outgoing bubble: bg-primary (#00685f), text-on-primary (#ffffff),
//     rounded-2xl with rounded-br-none (tail on the right).
//   - incoming bubble: bg-surface-container-highest (#dee4e1),
//     text-on-surface (#171d1c), rounded-2xl with rounded-bl-none (tail left).
//   - PDF attachment card: white/10 bg + white/20 border, inside outgoing bubble.
//   - Vitals card: primary-tinted bg with 2×2 stat grid, shown as a special
//     "incoming" message kind.
//   - done_all (double tick) → done-all icon in primary color.
//   - Clinical Actions FAB: absolute bottom-[96], right-4, zIndex 20.
//     Toggles a share-options sheet above it.
//   - medical_services → medical-services (may fall back to local-hospital).
//   - Input bar is a pill (rounded-full) at the bottom, just above the safe area.
//   - KeyboardAvoidingView (padding on iOS) shifts content up.
//   - Seed data mirrors the Stitch comp. Replace with useQuery(["thread", id])
//     once GET /v1/threads/:id ships.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding expo-* APIs.

import { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// ---------------------------------------------------------------------------
// Contact / thread meta — seeded from the Stitch comp.
// Pass ?name=&role=&avatar= params from the caller to override.
// ---------------------------------------------------------------------------

const SEED_CONTACT = {
  name: "Dr. Sarah Miller",
  role: "Cardiologist",
  avatarUri:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDeJpe2eyE7VBbPwXD7m2u2so2Q3OUNPtsrGrSFmYPgs-ebEdihstJSB8oCR4b47ByY3B_O0tXJvybxrQFcMdbXyy9xqS7U_kZ8nFPNvIRhmjvEdFwtFcHJV0XGrYK9jh0GeoJZ1vPacpmlGzjtsCd5RCBzska_0hXM0ZEU9ysDTcXuwGisPFsqxaJkEiaMkAZ9kics4W18HE6lSAYeAoyEI8J_niTdEBQuVwViQn55GrLPUW-D2piEuATB6NuuoRLh-IK3SrUgmo-b",
  isOnline: true,
};

// ---------------------------------------------------------------------------
// Message model
// ---------------------------------------------------------------------------

type MessageDirection = "incoming" | "outgoing";
type MessageKind = "text" | "attachment" | "vitals";

interface ChatMessage {
  id: string;
  direction: MessageDirection;
  kind: MessageKind;
  text?: string;
  timestamp: string;
  // outgoing only — show double-tick delivered status
  delivered?: boolean;
  // kind === "attachment"
  attachment?: {
    name: string;
    meta: string; // e.g. "PDF · 2.4 MB"
    icon: IconName;
  };
  // kind === "vitals" (incoming card from doctor)
  vitals?: {
    bp: string;
    hr: string;
    bpTrend: "up" | "down" | "stable";
    hrTrend: "up" | "down" | "stable";
    note: string;
  };
}

// ---------------------------------------------------------------------------
// Seed conversation — mirrors Stitch comp.
// ---------------------------------------------------------------------------

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    direction: "incoming",
    kind: "text",
    text: "Good morning! I've reviewed your latest ECG report from yesterday's session. Overall the readings look stable, but I'd like to discuss a few nuances with you.",
    timestamp: "10:15 AM",
  },
  {
    id: "m2",
    direction: "incoming",
    kind: "text",
    text: "I'm also attaching a reference summary of your last three consultations so we can track the trend together.",
    timestamp: "10:16 AM",
  },
  {
    id: "m3",
    direction: "outgoing",
    kind: "attachment",
    text: "Thank you, Doctor. I've uploaded my latest lab panel for your review.",
    timestamp: "10:28 AM",
    delivered: true,
    attachment: {
      name: "Lab_Panel_May2026.pdf",
      meta: "PDF · 2.4 MB",
      icon: "description",
    },
  },
  {
    id: "m4",
    direction: "incoming",
    kind: "vitals",
    text: "Here are the key vitals pulled from your last recorded session:",
    timestamp: "10:31 AM",
    vitals: {
      bp: "122/80",
      hr: "72 bpm",
      bpTrend: "stable",
      hrTrend: "down",
      note: "Blood pressure is within target range. Heart rate improved since last visit.",
    },
  },
  {
    id: "m5",
    direction: "outgoing",
    kind: "text",
    text: "Those numbers are reassuring! Should I adjust my current medication schedule or continue as prescribed?",
    timestamp: "10:34 AM",
    delivered: true,
  },
  {
    id: "m6",
    direction: "incoming",
    kind: "text",
    text: "Continue as prescribed for now. Let's reconnect after your next wearable sync — I'll set a reminder for Friday. If anything changes before then, message me directly here.",
    timestamp: "10:36 AM",
  },
];

const TREND_ICONS: Record<"up" | "down" | "stable", IconName> = {
  up: "trending-up",
  down: "trending-down",
  stable: "trending-flat",
};

// Clinical share options shown in the FAB menu
const CLINICAL_ACTIONS: { label: string; icon: IconName }[] = [
  { label: "Medical History", icon: "folder-shared" },
  { label: "Lifestyle Summary", icon: "self-improvement" },
  { label: "Vitals Trends", icon: "show-chart" },
  { label: "Medication Log", icon: "medication" },
];

// Canned reply for the interactive demo (no backend)
const CANNED_REPLY =
  "Understood. I'll review that and get back to you shortly. If anything urgent comes up, don't hesitate to reach out.";

let nextId = 200;
function makeId() {
  nextId += 1;
  return `ct${nextId}`;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function ChatThreadScreen() {
  // Accept lightweight params from the navigation call for personalisation.
  const params = useLocalSearchParams<{
    name?: string;
    role?: string;
    avatar?: string;
  }>();

  const contact = {
    name: params.name ?? SEED_CONTACT.name,
    role: params.role ?? SEED_CONTACT.role,
    avatarUri: params.avatar ?? SEED_CONTACT.avatarUri,
    isOnline: SEED_CONTACT.isOnline,
  };

  const [messages, setMessages] = useState<ChatMessage[]>(SEED_MESSAGES);
  const [draft, setDraft] = useState("");
  const [clinicalOpen, setClinicalOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    };
  }, []);

  const scrollToEnd = () => {
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setClinicalOpen(false);
    setMessages((prev) => [
      ...prev,
      {
        id: makeId(),
        direction: "outgoing",
        kind: "text",
        text: trimmed,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        delivered: true,
      },
    ]);
    setDraft("");
    scrollToEnd();
    if (replyTimer.current) clearTimeout(replyTimer.current);
    replyTimer.current = setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          direction: "incoming",
          kind: "text",
          text: CANNED_REPLY,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
      scrollToEnd();
    }, 1000);
  };

  const sendClinicalItem = (label: string) => {
    setClinicalOpen(false);
    send(`[Shared: ${label}]`);
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* ----------------------------------------------------------------
            App bar — back + contact info + actions
        ---------------------------------------------------------------- */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-gutter py-sm"
          style={appBarShadow}
        >
          {/* Left: back + avatar + name/role */}
          <View className="flex-1 flex-row items-center gap-sm">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={() => router.back()}
              className="rounded-full p-xs active:scale-95"
            >
              <MaterialIcons name="arrow-back" size={24} color="#00685f" />
            </Pressable>

            {/* Avatar + online dot */}
            <View className="relative shrink-0">
              {contact.avatarUri ? (
                <Image
                  source={{ uri: contact.avatarUri }}
                  style={{ width: 40, height: 40, borderRadius: 20 }}
                  accessibilityLabel={contact.name}
                />
              ) : (
                <View
                  className="items-center justify-center rounded-full bg-primary-container"
                  style={{ width: 40, height: 40 }}
                >
                  <Text className="font-label-md text-on-primary-container">
                    {contact.name[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
              {contact.isOnline ? (
                <View
                  className="absolute bottom-0 right-0 rounded-full border-2 border-surface bg-primary"
                  style={{ width: 12, height: 12 }}
                />
              ) : null}
            </View>

            {/* Name + role badge */}
            <View className="flex-1 min-w-0">
              <Text
                className="font-headline-md text-on-surface"
                style={{ fontSize: 17, fontWeight: "700" }}
                numberOfLines={1}
              >
                {contact.name}
              </Text>
              <View className="flex-row items-center gap-xs">
                <View
                  className="rounded px-xs"
                  style={{ backgroundColor: "rgba(0,131,120,0.15)", paddingVertical: 1 }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: "#00685f",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    Doctor
                  </Text>
                </View>
                <Text
                  className="font-label-sm text-on-surface-variant"
                  style={{ fontSize: 11 }}
                >
                  {contact.role}
                </Text>
              </View>
            </View>
          </View>

          {/* Right: video call + info */}
          <View className="flex-row items-center gap-xs">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Video call"
              hitSlop={8}
              className="rounded-full p-sm active:scale-95"
              onPress={() => {
                // TODO: initiate video call once telehealth signalling service ships.
              }}
            >
              <MaterialIcons name="videocam" size={24} color="#00685f" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Conversation info"
              hitSlop={8}
              className="rounded-full p-sm active:scale-95"
            >
              <MaterialIcons name="info-outline" size={24} color="#3d4947" />
            </Pressable>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
          // Extra offset so the input bar clears the keyboard cleanly on iOS.
          keyboardVerticalOffset={0}
        >
          {/* -----------------------------------------------------------
              Chat canvas
          ----------------------------------------------------------- */}
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 24,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToEnd}
          >
            {/* Timeline divider */}
            <TimelineDivider label="Today · Tap any message for details" />

            {messages.map((m) =>
              m.direction === "outgoing" ? (
                <OutgoingBubble key={m.id} message={m} />
              ) : (
                <IncomingBubble key={m.id} message={m} contactName={contact.name} />
              ),
            )}
          </ScrollView>

          {/* -----------------------------------------------------------
              Clinical Actions FAB + slide-up share menu
          ----------------------------------------------------------- */}
          {clinicalOpen ? (
            <Pressable
              onPress={() => setClinicalOpen(false)}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 15,
              }}
              accessibilityRole="button"
              accessibilityLabel="Close clinical menu"
            />
          ) : null}

          {/* Share options sheet */}
          {clinicalOpen ? (
            <View
              style={{
                position: "absolute",
                bottom: 96,
                right: 72,
                zIndex: 25,
                backgroundColor: "#ffffff",
                borderRadius: 16,
                overflow: "hidden",
                ...clinicalMenuShadow,
              }}
            >
              {CLINICAL_ACTIONS.map((a, i) => (
                <Pressable
                  key={a.label}
                  accessibilityRole="button"
                  accessibilityLabel={`Share ${a.label}`}
                  onPress={() => sendClinicalItem(a.label)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    backgroundColor: pressed
                      ? "rgba(0,104,95,0.06)"
                      : "transparent",
                    borderTopWidth: i > 0 ? 1 : 0,
                    borderTopColor: "rgba(0,0,0,0.06)",
                  })}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: "rgba(0,131,120,0.12)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialIcons name={a.icon} size={18} color="#00685f" />
                  </View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: "#171d1c",
                      minWidth: 160,
                    }}
                  >
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* FAB */}
          <View
            style={{
              position: "absolute",
              bottom: 96,
              right: 16,
              zIndex: 20,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={clinicalOpen ? "Close clinical actions" : "Share clinical data"}
              onPress={() => setClinicalOpen((v) => !v)}
              style={({ pressed }) => [
                {
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: clinicalOpen
                    ? "#004d46"
                    : pressed
                      ? "#005049"
                      : "#00685f",
                },
                fabShadow,
              ]}
            >
              <MaterialIcons
                name={clinicalOpen ? "close" : "medical-services"}
                size={24}
                color="#ffffff"
              />
            </Pressable>
          </View>

          {/* -----------------------------------------------------------
              Input bar
          ----------------------------------------------------------- */}
          <View
            className="border-t border-outline-variant/20 bg-surface px-md pb-sm pt-sm"
            style={inputBarShadow}
          >
            <View className="flex-row items-center gap-xs rounded-full border border-outline-variant/30 bg-surface-container-low px-sm py-xs">
              {/* Clinical menu toggle (apps icon) */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clinical actions"
                hitSlop={4}
                onPress={() => setClinicalOpen((v) => !v)}
                className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-variant/50"
              >
                <MaterialIcons
                  name={clinicalOpen ? "close" : "apps"}
                  size={22}
                  color={clinicalOpen ? "#00685f" : "#3d4947"}
                />
              </Pressable>

              {/* Attach */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Attach file"
                hitSlop={4}
                className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-variant/50"
              >
                <MaterialIcons name="attach-file" size={22} color="#3d4947" />
              </Pressable>

              {/* Text input */}
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message…"
                placeholderTextColor="#6d7a77"
                onSubmitEditing={() => send(draft)}
                returnKeyType="send"
                multiline
                style={{
                  flex: 1,
                  minHeight: 36,
                  maxHeight: 96,
                  paddingHorizontal: 4,
                  color: "#171d1c",
                  fontSize: 16,
                  lineHeight: 22,
                }}
                accessibilityLabel="Message input"
              />

              {/* Mic */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Voice message"
                hitSlop={4}
                className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-variant/50"
              >
                <MaterialIcons name="mic" size={22} color="#3d4947" />
              </Pressable>

              {/* Send */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                onPress={() => send(draft)}
                style={({ pressed }) => ({
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: draft.trim()
                    ? pressed
                      ? "#005049"
                      : "#00685f"
                    : "#bcc9c6",
                })}
              >
                <MaterialIcons name="send" size={18} color="#ffffff" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bubble components
// ---------------------------------------------------------------------------

function OutgoingBubble({ message }: { message: ChatMessage }) {
  return (
    <View className="mb-xs w-full items-end">
      <View style={{ maxWidth: "80%" }}>
        {/* Text portion (above attachment if present) */}
        {message.text ? (
          <View
            style={[
              {
                backgroundColor: "#00685f",
                borderRadius: 20,
                borderBottomRightRadius: message.attachment ? 20 : 4,
                paddingHorizontal: 16,
                paddingVertical: 10,
                marginBottom: message.attachment ? 4 : 0,
              },
              outgoingBubbleShadow,
            ]}
          >
            <Text style={{ color: "#ffffff", fontSize: 15, lineHeight: 22 }}>
              {message.text}
            </Text>
          </View>
        ) : null}

        {/* Attachment card */}
        {message.kind === "attachment" && message.attachment ? (
          <View
            style={[
              {
                backgroundColor: "#00685f",
                borderRadius: 20,
                borderBottomRightRadius: 4,
                padding: 12,
              },
              outgoingBubbleShadow,
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: "rgba(255,255,255,0.12)",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.2)",
                padding: 12,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcons
                  name={message.attachment.icon}
                  size={22}
                  color="#ffffff"
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                  numberOfLines={1}
                >
                  {message.attachment.name}
                </Text>
                <Text
                  style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 }}
                >
                  {message.attachment.meta}
                </Text>
              </View>
              <MaterialIcons name="download" size={20} color="rgba(255,255,255,0.8)" />
            </View>
          </View>
        ) : null}

        {/* Timestamp + delivery status */}
        <View
          className="mt-xs flex-row items-center justify-end gap-xs"
          style={{ paddingRight: 4 }}
        >
          <Text style={{ fontSize: 11, color: "#6d7a77" }}>{message.timestamp}</Text>
          {message.delivered ? (
            <MaterialIcons name="done-all" size={14} color="#00685f" />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function IncomingBubble({
  message,
  contactName,
}: {
  message: ChatMessage;
  contactName: string;
}) {
  if (message.kind === "vitals" && message.vitals) {
    return (
      <View className="mb-sm w-full items-start">
        <View style={{ maxWidth: "88%" }}>
          {/* Intro text */}
          {message.text ? (
            <View
              style={[
                {
                  backgroundColor: "#dee4e1",
                  borderRadius: 20,
                  borderBottomLeftRadius: 4,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  marginBottom: 6,
                },
                incomingBubbleShadow,
              ]}
            >
              <Text style={{ color: "#171d1c", fontSize: 15, lineHeight: 22 }}>
                {message.text}
              </Text>
            </View>
          ) : null}

          {/* Vitals card */}
          <VitalsCard vitals={message.vitals} />

          <Text
            style={{ fontSize: 11, color: "#6d7a77", marginTop: 4, marginLeft: 4 }}
          >
            {message.timestamp} · {contactName}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="mb-xs w-full items-start">
      <View style={{ maxWidth: "80%" }}>
        <View
          style={[
            {
              backgroundColor: "#dee4e1",
              borderRadius: 20,
              borderBottomLeftRadius: 4,
              paddingHorizontal: 16,
              paddingVertical: 10,
            },
            incomingBubbleShadow,
          ]}
        >
          {message.text ? (
            <Text style={{ color: "#171d1c", fontSize: 15, lineHeight: 22 }}>
              {message.text}
            </Text>
          ) : null}
        </View>
        <Text
          style={{ fontSize: 11, color: "#6d7a77", marginTop: 4, marginLeft: 4 }}
        >
          {message.timestamp}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Vitals card — rendered inside an incoming bubble
// ---------------------------------------------------------------------------

function VitalsCard({
  vitals,
}: {
  vitals: NonNullable<ChatMessage["vitals"]>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: "#00685f",
          borderRadius: 20,
          borderBottomLeftRadius: 4,
          padding: 16,
          gap: 12,
        },
        outgoingBubbleShadow,
      ]}
    >
      {/* Header */}
      <View className="flex-row items-center gap-xs">
        <MaterialIcons name="monitor-heart" size={18} color="rgba(255,255,255,0.8)" />
        <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" }}>
          VITALS SUMMARY
        </Text>
      </View>

      {/* 2-col stat grid */}
      <View className="flex-row gap-sm">
        <VitalStat
          label="Blood Pressure"
          value={vitals.bp}
          trend={vitals.bpTrend}
          icon="favorite"
        />
        <VitalStat
          label="Heart Rate"
          value={vitals.hr}
          trend={vitals.hrTrend}
          icon="monitor-heart"
        />
      </View>

      {/* Note */}
      <View
        style={{
          backgroundColor: "rgba(255,255,255,0.12)",
          borderRadius: 10,
          padding: 10,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.15)",
        }}
      >
        <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 12, lineHeight: 18 }}>
          {vitals.note}
        </Text>
      </View>
    </View>
  );
}

function VitalStat({
  label,
  value,
  trend,
  icon,
}: {
  label: string;
  value: string;
  trend: "up" | "down" | "stable";
  icon: IconName;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.15)",
        borderRadius: 12,
        padding: 12,
        gap: 6,
      }}
    >
      <View className="flex-row items-center justify-between">
        <MaterialIcons name={icon} size={16} color="rgba(255,255,255,0.7)" />
        <MaterialIcons
          name={TREND_ICONS[trend]}
          size={14}
          color="rgba(255,255,255,0.6)"
        />
      </View>
      <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "700" }}>
        {value}
      </Text>
      <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Timeline divider
// ---------------------------------------------------------------------------

function TimelineDivider({ label }: { label: string }) {
  return (
    <View className="my-sm flex-row items-center gap-sm">
      <View
        className="h-px flex-1 bg-surface-container-highest"
        style={{ opacity: 0.7 }}
      />
      <Text
        style={{
          fontSize: 11,
          color: "#6d7a77",
          paddingHorizontal: 8,
          paddingVertical: 3,
          backgroundColor: "#f0f5f3",
          borderRadius: 99,
        }}
      >
        {label}
      </Text>
      <View
        className="h-px flex-1 bg-surface-container-highest"
        style={{ opacity: 0.7 }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shadows — Platform.select pattern used across all screens.
// ---------------------------------------------------------------------------

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

const inputBarShadow =
  Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: -2 },
    },
    web: { boxShadow: "0px -2px 8px rgba(0, 0, 0, 0.05)" },
    android: { elevation: 4 },
  }) || {};

const outgoingBubbleShadow =
  Platform.select({
    ios: {
      shadowColor: "#00685f",
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    web: { boxShadow: "0px 3px 8px rgba(0, 104, 95, 0.18)" },
    android: { elevation: 3 },
  }) || {};

const incomingBubbleShadow =
  Platform.select({
    ios: {
      shadowColor: "#475569",
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    web: { boxShadow: "0px 2px 6px rgba(71, 85, 105, 0.06)" },
    android: { elevation: 1 },
  }) || {};

const fabShadow =
  Platform.select({
    ios: {
      shadowColor: "#00685f",
      shadowOpacity: 0.4,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
    },
    web: { boxShadow: "0px 5px 12px rgba(0, 104, 95, 0.4)" },
    android: { elevation: 8 },
  }) || {};

const clinicalMenuShadow =
  Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.15,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
    },
    web: { boxShadow: "0px 8px 20px rgba(0, 0, 0, 0.15)" },
    android: { elevation: 12 },
  }) || {};
