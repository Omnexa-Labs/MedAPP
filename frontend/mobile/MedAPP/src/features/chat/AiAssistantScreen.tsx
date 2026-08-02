// AI Assistant (MedAI) chat screen. Translated from the Stitch
// "AI Assistant" HTML.
//
// Reached from HomeScreen's MedAI hero card → "Talk to MedAI".
//
// Translation rules (same as the other screens):
//   - backdrop-blur glass header → the shared DetailAppBar. (The original
//     translation added a shadow here; docs/BRAND.md §Elevation gives a bar
//     none, and the bar is the shared component's now in any case.)
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
import { MaterialIcons } from "@expo/vector-icons";
import { DetailShell, DETAIL_APP_BAR_LEADING_SIZE } from "@/components/shell";
import { Card, ChoiceChip, ChoiceChipRow, Icon } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

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

  // The bar's notification glyph, by token name rather than the `#3d4947` the
  // hand-rolled bar froze (the LIGHT value of color/on-surface-variant).
  const mutedGlyph = useTokenColor("on-surface-variant");

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
    setMessages((prev) => [...prev, { id: makeId(), author: "user", paragraphs: [trimmed] }]);
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
    // ------------------------------------------------------------------
    // DetailShell (safe area + DetailAppBar + body), replacing this screen's
    // hand-rolled `View > StatusBar style="dark" > SafeAreaView` wrapper. The
    // frozen "dark" was one of eleven across the detail screens.
    //
    // `claimsBottomInset={false}`: the input bar is pinned to the bottom
    // under a KeyboardAvoidingView and must sit flush against the keyboard,
    // so the screen keeps that inset. Same edges the screen passed before
    // (["top","left","right"]).
    //
    // The KAV stays here, BELOW the bar — a shell-level one would push the
    // app bar off the top of the screen when the keyboard opens.
    //
    // The avatar goes in the bar's `leading` slot at
    // DETAIL_APP_BAR_LEADING_SIZE (40).
    // FLAGGED (carried over): the pre-DetailAppBar bar CENTRED the word
    // "MedApp" as `<Text>`. That is the wordmark re-typeset
    // (docs/BRAND.md §Logo rules) and 193:120 both forbids a logo on a
    // detail bar and LEFT-aligns its title (193:117 at x=60). Retitled to
    // the assistant's own name; the copy still needs a designer/PO call.
    // ------------------------------------------------------------------
    <DetailShell
      title="MedAI"
      claimsBottomInset={false}
      leading={
        <View
          className="overflow-hidden rounded-full border border-outline-variant"
          style={{ width: DETAIL_APP_BAR_LEADING_SIZE, height: DETAIL_APP_BAR_LEADING_SIZE }}
        >
          <Image
            source={{ uri: AVATAR_URI }}
            className="h-full w-full"
            accessibilityLabel="Your profile"
          />
        </View>
      }
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          className="h-full w-full items-center justify-center rounded-full active:opacity-70"
        >
          <Icon chrome="notifications" size={24} color={mutedGlyph} />
        </Pressable>
      }
    >
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
          {/* AI Health Insight card — the shared <Card> (docs/BRAND.md
                §Elevation). This was the screen's `cardShadow` call site: a 20px
                `#475569` grey haze on a content card, which BRAND forbids
                outright. Card cannot carry one — it strips elevation keys — so
                the rule is structural here rather than a convention.

                Padding is unchanged (Card's default `p-md` is the 24px this card
                already used). Changed deliberately, to BRAND's card treatment:
                radius 12 -> 24, the hairline from `outline-variant/30` to full
                strength (with no shadow it IS the separation), and the fill from
                the fixed `surface-container-low` step to the `card-surface`
                role. */}
          <Card className="mb-md flex-row items-start gap-md">
            <View className="mt-xs rounded-full bg-primary-container p-sm">
              <MaterialIcons name="health-and-safety" size={20} color="#f4fffc" />
            </View>
            <View className="flex-1">
              <Text className="mb-xs font-label-md text-label-md text-primary">
                AI Health Insight
              </Text>
              <Text className="font-body-md text-body-md text-on-surface-variant">
                Based on your recent lab reports uploaded yesterday, your Vitamin D levels are
                slightly below optimal. Consider a brief sun exposure or consulting Dr. Smith about
                a supplement.
              </Text>
            </View>
          </Card>

          {/* Timestamp divider */}
          <Text className="my-sm text-center font-label-sm text-label-sm text-outline">
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

        {/* Input area. The gutter moved off this container and onto the input
              bar below, so the chip row can be FULL-BLEED — a scrollable
              ChoiceChipRow applies BRAND's 16px gutter as its own content
              inset, and nesting it inside another 16 would double it. */}
        <View className="border-t border-outline-variant/20 bg-surface pb-sm pt-sm">
          {/* Quick-action chips — the shared ChoiceChip (Figma 11:104).
                Replaces a private pill that was ~28pt tall (under the 44pt
                floor), drew its glyph at 16 (off BRAND's 24/20 ramp) and froze
                the tint at `#3d4947`, the LIGHT value of on-surface-variant.

                FLAGGED: these are ACTION chips, not choice chips — they fire
                `send()` and never hold a selected state, so they render
                permanently in 11:104's State=Default. The geometry is identical,
                which is why they were folded in rather than left to drift, but
                11:104 should gain a `Type=Assist | Filter` property so the
                distinction is expressed in the design system rather than by a
                call site that simply never passes `selected`. */}
          <View className="pb-sm">
            <ChoiceChipRow scrollable>
              {QUICK_ACTIONS.map((qa) => (
                <ChoiceChip
                  key={qa.label}
                  label={qa.label}
                  icon={qa.icon}
                  onPress={() => send(qa.label)}
                />
              ))}
            </ChoiceChipRow>
          </View>

          {/* Multimodal input bar */}
          <View className="mx-md flex-row items-center gap-xs rounded-full border border-outline-variant/30 bg-surface-container-highest p-xs">
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
    </DetailShell>
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
      {/* `aiBubbleShadow` is gone — a message bubble is a content surface, i.e.
          the CARD role, and docs/BRAND.md §Elevation gives a card no drop shadow.
          It is not restored in softened form: the bubble's edge is the hairline
          it already carries (now full-strength `outline-variant` rather than
          `/20`, since with no blur the hairline is the whole separation) plus the
          2px primary accent rail. */}
      <View
        className="max-w-[85%] flex-1 rounded-2xl border border-l-2 border-outline-variant border-l-primary bg-surface px-md py-sm"
        style={{ borderTopLeftRadius: 4 }}
      >
        {message.paragraphs.map((p, i) => (
          <Text key={i} className="mb-xs font-body-md text-body-md text-on-background">
            {p}
          </Text>
        ))}

        {message.bullets ? (
          <View className="mt-xs gap-xs">
            {message.bullets.map((b, i) => (
              <View key={i} className="flex-row gap-sm pl-xs">
                <Text className="font-body-md text-body-md text-on-surface-variant">•</Text>
                <Text className="flex-1 font-body-md text-body-md text-on-surface-variant">
                  {b}
                </Text>
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
                  <Text className="flex-1 font-body-md text-body-md text-on-surface-variant">
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {message.escalation ? (
          <View className="mt-sm rounded-xl border border-primary-container/20 bg-primary-container/10 p-md">
            <Text className="mb-sm font-label-md text-label-md text-primary">
              Need more specialized advice? Our medical team is online.
            </Text>
            <View className="gap-sm">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Talk to a professional"
                className="flex-row items-center justify-center gap-xs rounded-full bg-primary py-sm active:scale-[0.98]"
              >
                <MaterialIcons name="chat-bubble" size={16} color="#ffffff" />
                <Text className="font-label-md text-label-md text-white">
                  Talk to a Professional
                </Text>
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
            className="mt-sm font-label-sm text-label-sm text-outline"
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
// Elevation — this screen has NO shadows, and the section is kept as the record
// of why, so the `Platform.select` tables can't quietly grow back.
//
//   cardShadow      the AI Health Insight card. A card casts no shadow
//                   (docs/BRAND.md §Elevation); it renders through the shared
//                   <Card>, which strips elevation keys.
//   aiBubbleShadow  the assistant's message bubble. A bubble is a content
//                   surface — the same card role — so it gets a hairline, not a
//                   blur.
//   appBarShadow    deleted in an earlier pass with the hand-rolled app bar;
//                   DetailAppBar (Figma 193:120) carries no effects.
//
// Nothing on this screen is a bottom sheet, menu, dialog, toast or FAB, so
// nothing here qualifies for BRAND's `elevation/floating` exception.
// ---------------------------------------------------------------------------
