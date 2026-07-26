// AI Assistant (MedAI) chat screen. Translated from the Stitch
// "AI Assistant" HTML.
//
// Reached from HomeScreen's MedAI hero card → "Talk to MedAI".
//
// Translation rules (same as the other screens):
//   - backdrop-blur glass header → opaque bg-surface + border + shadow.
//   - hover:* / group-hover:* / focus:ring → dropped (no hover on RN).
//   - The web has BOTH a mobile input bar + BottomNav AND a separate
//     desktop input bar. On a phone, stacking the 5-tab BottomNav above
//     the keyboard + input bar is too much bottom furniture for a
//     focused chat. So this pushed screen drops the BottomNav and keeps
//     the back arrow as the return affordance — the standard chat
//     convention on iOS/Android.
//   - Message bubbles: user → right, surface-container-high, rounded
//     with a squared top-right corner. AI → left, with a bot avatar and
//     a left primary accent border (border-l-2 border-l-primary).
//   - Sending is interactive but local: the user's text appends, then a
//     canned AI acknowledgement appears after a short "typing" delay.
//     No backend — design-only pass.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

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
import { router } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

const AVATAR_URI =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuC319cU4Q8p7tB5-nJPUL3cuQiHCYq3DlR3MrStRvrqTClur01Zo4gu3VbPCVgfBSpQWIyi-T-_YsiLemUscKuclQtAG8_xOcbRpBxZRm-kx95fB_dlZ4hM7gVFVf1fThArdG1ucHGvFhkgw7l4xB5cYn4RwwpZ6qjsVsuSRn9s2GWcheK3QyTFQFb4b4VJJPTqimZw_YCXPByAz5Enu6R15yds-zdamX7wmmg-JF3X8kvjQjkQCzMXa35mE-wTJQExc0MqIaTmnVgc";

// ---------------------------------------------------------------------------
// Message model. The seeded conversation mirrors the comp; the rich AI
// turn (suggestions box + escalation CTAs + disclaimer) is modelled as
// optional structured fields rather than free HTML so it renders
// natively.
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  author: "user" | "ai";
  // Each paragraph renders as its own <Text> block with spacing.
  paragraphs: string[];
  bullets?: string[];
  // Optional "Suggestions:" callout box (secondary-fixed tint).
  suggestions?: string[];
  // Optional escalation block with the two CTAs.
  escalation?: boolean;
  // Optional italic safety disclaimer footer.
  disclaimer?: string;
}

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: "u1",
    author: "user",
    paragraphs: [
      "Hi, I've been having a mild headache since yesterday evening. It's mostly around my temples.",
    ],
  },
  {
    id: "a1",
    author: "ai",
    paragraphs: [
      "I understand you're experiencing a headache around your temples since last evening. I can help you evaluate this.",
      "To give you the best guidance, could you tell me:",
    ],
    bullets: [
      "How severe is the pain on a scale of 1-10?",
      "Have you taken any medication for it yet?",
      "Are you experiencing any other symptoms like nausea or sensitivity to light?",
    ],
  },
  {
    id: "u2",
    author: "user",
    paragraphs: [
      "It's about a 4 out of 10. I haven't taken anything yet. No nausea, but screen light is a bit bothersome.",
    ],
  },
  {
    id: "a2",
    author: "ai",
    paragraphs: [
      "Thank you for those details. A mild tension headache with mild light sensitivity is quite common, especially if you've had prolonged screen time.",
    ],
    suggestions: [
      "Rest in a dimly lit room for 20-30 minutes.",
      "Ensure you are adequately hydrated.",
      "An over-the-counter pain reliever like Ibuprofen can help (if you have no contraindications).",
    ],
    escalation: true,
    disclaimer:
      "If the pain worsens, or if you develop sudden severe pain, fever, or confusion, seek immediate medical attention.",
  },
];

const QUICK_ACTIONS: { label: string; icon: IconName }[] = [
  { label: "Check Vitals", icon: "monitor-heart" },
  { label: "Analyze Lab Report", icon: "science" },
  { label: "Symptom Checker", icon: "coronavirus" },
];

// Canned AI acknowledgement for the interactive (no-backend) demo. Kept
// deliberately generic + safety-forward so it reads plausibly for any
// follow-up the user types.
const CANNED_REPLY =
  "Thanks for sharing that. I've noted it. While I gather a few more details, remember this guidance is informational and not a diagnosis. Would you like me to connect you with a professional?";

let nextId = 100;
function makeId() {
  nextId += 1;
  return `m${nextId}`;
}

export function AiAssistantScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>(SEED_MESSAGES);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    };
  }, []);

  // Defer the scroll a tick so layout has the new bubble's height.
  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      { id: makeId(), author: "user", paragraphs: [trimmed] },
    ]);
    setDraft("");
    scrollToEnd();
    // Simulated assistant reply.
    if (replyTimer.current) clearTimeout(replyTimer.current);
    replyTimer.current = setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: makeId(), author: "ai", paragraphs: [CANNED_REPLY], escalation: true },
      ]);
      scrollToEnd();
    }, 900);
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* App bar — back + avatar + MedApp + notifications */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-gutter py-sm"
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
            <View className="h-9 w-9 overflow-hidden rounded-full border border-outline-variant">
              <Image source={{ uri: AVATAR_URI }} className="h-full w-full" accessibilityLabel="Your profile" />
            </View>
          </View>
          <Text className="font-headline-md text-headline-md text-primary">MedApp</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            hitSlop={8}
            className="rounded-full p-sm active:scale-95"
          >
            <MaterialIcons name="notifications" size={24} color="#3d4947" />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToEnd}
          >
            {/* AI Health Insight card (pinned at top of the flow) */}
            <View
              className="mb-md flex-row items-start gap-md rounded-xl border border-outline-variant/30 bg-surface-container-low p-md"
              style={cardShadow}
            >
              <View className="mt-xs rounded-full bg-primary-container p-sm">
                <MaterialIcons name="health-and-safety" size={20} color="#f4fffc" />
              </View>
              <View className="flex-1">
                <Text className="font-label-md text-label-md mb-xs text-primary">
                  AI Health Insight
                </Text>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  Based on your recent lab reports uploaded yesterday, your Vitamin D levels are
                  slightly below optimal. Consider a brief sun exposure or consulting Dr. Smith
                  about a supplement.
                </Text>
              </View>
            </View>

            {/* Timestamp divider */}
            <Text className="font-label-sm text-label-sm my-sm text-center text-outline">
              Today, 10:24 AM
            </Text>

            {/* Chat history */}
            {messages.map((m) =>
              m.author === "user" ? (
                <UserBubble key={m.id} message={m} />
              ) : (
                <AiBubble key={m.id} message={m} />
              ),
            )}
          </ScrollView>

          {/* Input area */}
          <View className="border-t border-outline-variant/20 bg-surface px-md pb-sm pt-sm">
            {/* Quick-action chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
            >
              {QUICK_ACTIONS.map((qa) => (
                <Pressable
                  key={qa.label}
                  accessibilityRole="button"
                  accessibilityLabel={qa.label}
                  onPress={() => send(qa.label)}
                  className="flex-row items-center gap-xs rounded-full border border-outline-variant bg-surface-container-lowest px-sm py-xs active:bg-surface-variant/50"
                >
                  <MaterialIcons name={qa.icon} size={16} color="#3d4947" />
                  <Text className="font-label-sm text-label-sm text-on-surface-variant">
                    {qa.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Multimodal input bar */}
            <View className="flex-row items-center gap-xs rounded-full border border-outline-variant/30 bg-surface-container-highest p-xs">
              <IconButton icon="attach-file" label="Attach file" />
              <IconButton icon="photo-camera" label="Take photo" />
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask me about your symptoms…"
                placeholderTextColor="#6d7a77"
                onSubmitEditing={() => send(draft)}
                returnKeyType="send"
                multiline
                style={{
                  flex: 1,
                  minHeight: 40,
                  maxHeight: 96,
                  paddingHorizontal: 8,
                  color: "#171d1c",
                  fontSize: 16,
                  lineHeight: 20,
                }}
                accessibilityLabel="Message MedAI"
              />
              <IconButton icon="mic" label="Voice input" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                onPress={() => send(draft)}
                className="h-10 w-10 items-center justify-center rounded-full active:scale-95"
                style={{ backgroundColor: draft.trim() ? "#00685f" : "#bcc9c6" }}
              >
                <MaterialIcons name="send" size={20} color="#ffffff" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------------

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <View className="mb-xs w-full flex-row justify-end">
      <View
        className="max-w-[85%] rounded-2xl border border-outline-variant/20 bg-surface-container-high px-md py-sm"
        style={{ borderTopRightRadius: 4 }}
      >
        {message.paragraphs.map((p, i) => (
          <Text key={i} className="font-body-md text-body-md text-on-background">
            {p}
          </Text>
        ))}
      </View>
    </View>
  );
}

function AiBubble({ message }: { message: ChatMessage }) {
  return (
    <View className="mb-sm w-full flex-row justify-start gap-sm">
      <View className="mt-xs h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
        <MaterialIcons name="smart-toy" size={16} color="#00685f" />
      </View>
      <View
        className="max-w-[85%] flex-1 rounded-2xl border border-outline-variant/20 bg-surface px-md py-sm"
        style={[{ borderTopLeftRadius: 4, borderLeftWidth: 2, borderLeftColor: "#00685f" }, aiBubbleShadow]}
      >
        {message.paragraphs.map((p, i) => (
          <Text key={i} className="font-body-md text-body-md mb-xs text-on-background">
            {p}
          </Text>
        ))}

        {message.bullets ? (
          <View className="mt-xs gap-xs">
            {message.bullets.map((b, i) => (
              <View key={i} className="flex-row gap-sm pl-xs">
                <Text className="font-body-md text-body-md text-on-surface-variant">•</Text>
                <Text className="font-body-md text-body-md flex-1 text-on-surface-variant">{b}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {message.suggestions ? (
          <View className="mt-sm rounded-lg border border-secondary-fixed-dim bg-secondary-fixed/30 p-sm">
            <View className="mb-xs flex-row items-center gap-xs">
              <MaterialIcons name="info" size={16} color="#515f74" />
              <Text className="font-label-md text-label-md text-on-secondary-container">
                Suggestions:
              </Text>
            </View>
            <View className="gap-xs">
              {message.suggestions.map((s, i) => (
                <View key={i} className="flex-row gap-sm">
                  <Text className="text-primary">•</Text>
                  <Text className="font-body-md text-body-md flex-1 text-on-surface-variant">{s}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {message.escalation ? (
          <View className="mt-sm rounded-xl border border-primary-container/20 bg-primary-container/10 p-md">
            <Text className="font-label-md text-label-md mb-sm text-primary">
              Need more specialized advice? Our medical team is online.
            </Text>
            <View className="gap-sm">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Talk to a professional"
                className="flex-row items-center justify-center gap-xs rounded-full bg-primary py-sm active:scale-[0.98]"
              >
                <MaterialIcons name="chat-bubble" size={16} color="#ffffff" />
                <Text className="font-label-md text-label-md text-white">Talk to a Professional</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Schedule a consultation"
                className="flex-row items-center justify-center gap-xs rounded-full border border-primary py-sm active:bg-primary/5"
              >
                <MaterialIcons name="calendar-today" size={16} color="#00685f" />
                <Text className="font-label-md text-label-md text-primary">
                  Schedule a Consultation
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {message.disclaimer ? (
          <Text
            className="font-label-sm text-label-sm mt-sm text-outline"
            style={{ fontStyle: "italic" }}
          >
            {message.disclaimer}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function IconButton({ icon, label }: { icon: IconName; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-variant/50"
    >
      <MaterialIcons name={icon} size={22} color="#3d4947" />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Shadows — same Platform.select pattern as the other screens.
// ---------------------------------------------------------------------------

const cardShadow =
  Platform.select({
    ios: { shadowColor: "#475569", shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 4 } },
    web: { boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.05)" },
    android: { elevation: 2 },
  }) || {};

const aiBubbleShadow =
  Platform.select({
    ios: { shadowColor: "#475569", shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
    web: { boxShadow: "0px 2px 10px rgba(71, 85, 105, 0.03)" },
    android: { elevation: 1 },
  }) || {};

const appBarShadow =
  Platform.select({
    ios: { shadowColor: "#000000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    web: { boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.04)" },
    android: { elevation: 3 },
  }) || {};
