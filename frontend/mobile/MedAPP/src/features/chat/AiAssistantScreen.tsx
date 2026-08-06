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
// ---------------------------------------------------------------------------
// COMPOSER MEDIA (attach + mic)
// ---------------------------------------------------------------------------
// The paperclip and the mic used to be decoration: `<IconButton>` with no
// `onPress` at all, two dead 44pt targets. They are now wired through
// ./useComposerMedia, which owns the SDK 55 surface (expo-document-picker,
// expo-audio, expo-file-system) and documents every API fact it relies on.
//
// The picked file and the recording are REAL and device-local. There is NO
// upload: this project has no endpoint that accepts composer media, so the
// attachment is folded into the locally-appended message and rendered from its
// `file://` uri. A POST to an invented route was explicitly REJECTED — a faked
// upload reads as working software and would only be caught in QA. See the
// FLAGGED block in ./useComposerMedia for the endpoint this needs.
//
// "photo-camera" is still decoration and is now HONEST about it: it renders
// disabled rather than pretending, because expo-image-picker / expo-camera are
// not installed and adding a dependency was out of scope for this change.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { DetailShell, DETAIL_APP_BAR_LEADING_SIZE } from "@/components/shell";
import {
  Card,
  ChoiceChip,
  ChoiceChipRow,
  Icon,
  KeyboardInset,
  type ChromeIconName,
} from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { ComposerMediaTray } from "./ComposerMediaTray";
import { useComposerMedia, type ComposerAttachment } from "./useComposerMedia";

// Was `React.ComponentProps<typeof MaterialIcons>["name"]`, which required this
// screen to import an icon library — docs/BRAND.md forbids that outright
// ("Screens must never import an icon library directly"). `ChromeIconName` is
// re-exported by the icon gate for exactly this reason.
type IconName = ChromeIconName;

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
  // A file the user attached from the composer. This is a DEVICE-LOCAL
  // reference: `attachment.uploaded` is always false and `attachment.uri` is a
  // `file://` path, because there is no upload endpoint (see the header). It is
  // modelled on the message rather than kept in a side-table so the bubble can
  // render it without a lookup, matching how ChatThreadScreen already does it.
  attachment?: ComposerAttachment;
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

  // Attach + mic. See the COMPOSER MEDIA block in the header.
  const media = useComposerMedia();

  // The bar's notification glyph, by token name rather than the `#3d4947` the
  // hand-rolled bar froze (the LIGHT value of color/on-surface-variant).
  const mutedGlyph = useTokenColor("on-surface-variant");
  // Composer glyph + fill tokens. Every one of these was a frozen hex literal
  // (`#3d4947`, `#00685f`, `#bcc9c6`, `#6d7a77`, `#171d1c`, and a `#ffffff` on
  // the send glyph that measured ~1.5:1 against `primary` in dark mode).
  const onPrimary = useTokenColor("on-primary");
  const primary = useTokenColor("primary");
  const disabledFill = useTokenColor("outline-variant");
  const placeholder = useTokenColor("outline");
  const inputText = useTokenColor("on-surface");
  // The insight card's glyph, on a `primary-container` fill. Was `#f4fffc` — the
  // LIGHT value of on-primary-container, so it stayed near-white on the light
  // teal that token becomes in dark mode.
  const onPrimaryContainer = useTokenColor("on-primary-container");

  useEffect(() => {
    return () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    };
  }, []);

  // Defer the scroll a tick so layout has the new bubble's height.
  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  // `attachment` is read at call time rather than passed, so every existing
  // caller (the quick-action chips, the return key) picks it up unchanged.
  //
  // The guard changed shape: it used to be "no text, no send", which would have
  // made an attachment unsendable without typing something first. Now EITHER a
  // non-empty draft OR a pending attachment is enough.
  const send = (text: string) => {
    const trimmed = text.trim();
    const attachment = media.attachment;
    if (!trimmed && !attachment) return;
    setMessages((prev) => [
      ...prev,
      {
        id: makeId(),
        author: "user",
        // An attachment-only message has no paragraphs at all; the bubble
        // renders just the file card, which is why `paragraphs` is filtered
        // rather than defaulted to a placeholder string.
        paragraphs: trimmed ? [trimmed] : [],
        attachment: attachment ?? undefined,
      },
    ]);
    // Releases the composer slot WITHOUT reaping the file — the message above
    // now references its uri. (`clearAttachment` would delete a capture.)
    if (attachment) media.consumeAttachment();
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
      {/* KeyboardInset, NOT KeyboardAvoidingView. The KAV infers the keyboard from a
          WINDOW RESIZE, and under SDK 55's Android edge-to-edge the window is no
          longer resized — proven on device, where setting behavior="padding" left
          the composer still absent and the list still clipped at the keyboard's
          top edge. KeyboardInset reads the IME inset from the platform instead. */}
      <KeyboardInset className="flex-1">
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
              <Icon chrome="health-and-safety" size={20} color={onPrimaryContainer} />
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

          {/* Pending attachment / live recording / permission notice. Sits ABOVE
                the pill so the pill's geometry is untouched. */}
          <ComposerMediaTray media={media} />

          {/* Multimodal input bar */}
          <View className="mx-md flex-row items-center gap-xs rounded-full border border-outline-variant/30 bg-surface-container-highest p-xs">
            <IconButton
              icon="attach-file"
              label="Attach file"
              onPress={() => void media.pickFile()}
              disabled={media.isPicking || media.isRecording}
            />
            {/* Honestly disabled rather than dead — see the header. */}
            <IconButton icon="photo-camera" label="Take photo" disabled />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask me about your symptoms…"
              placeholderTextColor={placeholder}
              onSubmitEditing={() => send(draft)}
              returnKeyType="send"
              multiline
              style={{
                flex: 1,
                minHeight: 40,
                maxHeight: 96,
                paddingHorizontal: 8,
                color: inputText,
                fontSize: 16,
                lineHeight: 20,
              }}
              accessibilityLabel="Message MedAI"
            />
            {/* Press to start, press again to commit — ./useComposerMedia argues
                  why this is a toggle and not press-and-hold (the permission
                  dialog breaks a held gesture). The label changes with the state
                  so a screen reader announces what the next tap will do. */}
            <IconButton
              icon={media.isRecording ? "stop" : "mic"}
              label={media.isRecording ? "Stop recording" : "Voice input"}
              tint={media.isRecording ? "error" : "muted"}
              onPress={() => void media.toggleRecording()}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              // `accessibilityState` rather than `disabled`: the control is still
              // pressable (the press is a no-op) and the greyed fill must have a
              // non-visual equivalent.
              accessibilityState={{ disabled: !draft.trim() && !media.attachment }}
              onPress={() => send(draft)}
              className="h-10 w-10 items-center justify-center rounded-full active:scale-95"
              style={{
                backgroundColor: draft.trim() || media.attachment ? primary : disabledFill,
              }}
            >
              {/* Was `<MaterialIcons ... color="#ffffff" />`: a direct icon-library
                    import (docs/BRAND.md forbids it outside the icon gate) AND a
                    frozen white that measured ~1.5:1 on `primary` in dark mode,
                    where the token correctly resolves to a near-black #003731. */}
              <Icon chrome="send" size={20} color={onPrimary} />
            </Pressable>
          </View>
        </View>
      </KeyboardInset>
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
        {message.attachment ? <BubbleAttachment attachment={message.attachment} /> : null}
      </View>
    </View>
  );
}

function AiBubble({ message }: { message: ChatMessage }) {
  // All three were frozen LIGHT-mode hexes (`#00685f` = primary, `#515f74` =
  // secondary, `#ffffff` = on-primary), so every glyph in this bubble was the
  // wrong colour in dark mode. docs/BRAND.md: "Never hardcode a hex."
  const primary = useTokenColor("primary");
  const secondary = useTokenColor("secondary");
  const onPrimary = useTokenColor("on-primary");

  return (
    <View className="mb-sm w-full flex-row justify-start gap-sm">
      <View className="mt-xs h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
        <Icon chrome="smart-toy" size={16} color={primary} />
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
              <Icon chrome="info" size={16} color={secondary} />
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
                <Icon chrome="chat-bubble" size={16} color={onPrimary} />
                {/* `text-white` is the class form of the same violation — a
                    literal, not a token. On a `bg-primary` button the pair is
                    `text-on-primary`. */}
                <Text className="font-label-md text-label-md text-on-primary">
                  Talk to a Professional
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Schedule a consultation"
                className="flex-row items-center justify-center gap-xs rounded-full border border-primary py-sm active:bg-primary/5"
              >
                <Icon chrome="calendar-today" size={16} color={primary} />
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

/**
 * A composer glyph button.
 *
 * 36x36 with `hitSlop={4}` = a 44x44 touch target, which is docs/MOBILE_UX.md's
 * floor; the drawn box stays 36 because four of them plus a text field have to
 * fit inside one pill at 360dp.
 *
 * `onPress` is OPTIONAL only because one control (photo-camera) has no
 * implementation to point at yet. When it is absent the button renders in the
 * disabled treatment and reports `accessibilityState.disabled`, so it can no
 * longer be a control that LOOKS live and does nothing — the bug this change
 * fixes for the other two.
 */
function IconButton({
  icon,
  label,
  onPress,
  disabled,
  tint = "muted",
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  tint?: "muted" | "error";
}) {
  const muted = useTokenColor("on-surface-variant");
  const error = useTokenColor("error");
  const off = useTokenColor("outline-variant");
  const isDisabled = disabled || !onPress;
  const color = isDisabled ? off : tint === "error" ? error : muted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      hitSlop={4}
      onPress={onPress}
      className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-variant/50"
    >
      <Icon chrome={icon} size={22} color={color} />
    </Pressable>
  );
}

/**
 * The attachment card inside a user bubble.
 *
 * Deliberately does NOT offer "open" or "download": the file is device-local and
 * unsent (see the header), so a download affordance would be a lie and an open
 * affordance needs a viewer this screen does not have. It states what is
 * attached, and that it has not been sent.
 */
function BubbleAttachment({ attachment }: { attachment: ComposerAttachment }) {
  const glyph = useTokenColor("on-surface-variant");

  return (
    <View className="mt-xs flex-row items-center gap-sm rounded-md border border-outline-variant bg-surface-container-highest p-sm">
      <Icon
        chrome={attachment.kind === "recording" ? "mic" : "description"}
        size={22}
        color={glyph}
      />
      <View className="min-w-0 flex-1">
        <Text className="font-label-md text-label-md text-on-surface" numberOfLines={1}>
          {attachment.name}
        </Text>
        <Text className="font-label-sm text-label-sm text-on-surface-variant" numberOfLines={1}>
          {attachment.meta} · on this device only
        </Text>
      </View>
    </View>
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
