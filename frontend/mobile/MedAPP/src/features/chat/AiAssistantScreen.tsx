// AI Assistant (MedAI) chat screen — Figma `ai_assistant` 550:2700, page 548:615
// "Messaging", plus its three state frames:
//
//   550:3762  — first run (empty)
//   550:4659  — assistant thinking (loading)
//   550:4777  — send failed (error)
//
// THIS FILE WAS RECONCILED AGAINST THOSE FRAMES ON 2026-08-06, AND THE HEADER
// BELOW IS MOSTLY A RECORD OF WHY IT HAD DRIFTED. The previous version was
// translated from a Stitch HTML comp and then patched repeatedly from device
// symptoms — a send glyph nobody could see, a keyboard that would not lift the
// composer. Each patch was correct in isolation; none of them re-read the frame,
// so the ANATOMY diverged while the details got fixed. The PO caught it. The
// frame is the source of truth; the comp is not, and is no longer referenced.
//
// What the frame says that the comp did not:
//
//   - There is a PINNED `AI Disclosure Line` (550:2971) below the composer. The
//     comp had a per-message disclaimer, which scrolls away. See the block on
//     <AiDisclosureLine /> — in a health product this is the priority item.
//   - The proactive lab insight is a MESSAGE (assistant turn 1, 550:2721), not a
//     card floating above the conversation. The comp's "AI Health Insight" card
//     appears in no frame.
//   - The conversation opens with an `Assistant Identity Header` (550:2708) that
//     names the assistant and states the boundary — "not a clinician".
//   - The safety warning is an ERROR-TONE CALLOUT (`Safety Callout`, an
//     error-container block with an alert glyph), not muted italic 12sp text.
//   - The composer has THREE controls, all 44x44 (Composer / Chat 550:2956).
//   - The suggested-prompt row has FOUR chips and NO leading glyphs (the Icon
//     slot is `hidden` in every instance, 550:2947…550:2953).
//
// ---------------------------------------------------------------------------
// COMPOSER MEDIA (attach + mic)
// ---------------------------------------------------------------------------
// The paperclip and the mic used to be decoration: `<IconButton>` with no
// `onPress` at all, two dead targets. They are wired through ./useComposerMedia,
// which owns the SDK 55 surface (expo-document-picker, expo-audio,
// expo-file-system) and documents every API fact it relies on.
//
// The picked file and the recording are REAL and device-local. There is NO
// upload: this project has no endpoint that accepts composer media, so the
// attachment is folded into the locally-appended message and rendered from its
// `file://` uri. A POST to an invented route was explicitly REJECTED — a faked
// upload reads as working software and would only be caught in QA. See the
// FLAGGED block in ./useComposerMedia for the endpoint this needs.
//
// The comp's fourth control, "photo-camera", is GONE rather than disabled: the
// frame's composer draws three controls, and a permanently-disabled fourth is
// still a control the user has to read past. (expo-image-picker / expo-camera
// are not installed, so it could not have been wired in any case.)
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { DetailShell } from "@/components/shell";
import {
  Button,
  ChoiceChip,
  ChoiceChipRow,
  Icon,
  InfoCallout,
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

// ---------------------------------------------------------------------------
// Message model. The seeded conversation is transcribed from 550:2700's five
// turns; the rich assistant turn (550:2826 — suggestions box, escalation CTAs,
// safety callout) is modelled as optional structured fields rather than free
// HTML so it renders natively.
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  author: "user" | "ai";
  // Each paragraph renders as its own <Text> block with spacing.
  paragraphs: string[];
  bullets?: string[];
  // Optional "General suggestions" callout box (`Suggestions`, 0:26).
  suggestions?: string[];
  // Optional escalation block with the two CTAs (`Escalation to a
  // practitioner`, 0:41).
  escalation?: boolean;
  /**
   * The `Safety Callout` (0:51) — an ERROR-TONE block, not a footnote.
   *
   * The comp rendered this as italic `label-sm` in `outline`, i.e. the quietest
   * treatment on the screen, for the one line that tells a user when to stop
   * reading and get help. The frame gives it `error-container` with an alert
   * glyph. Colour is not the only signal: the glyph and the words carry it too
   * (docs/BRAND.md §Colour rules).
   */
  safety?: string;
  // A file the user attached from the composer. This is a DEVICE-LOCAL
  // reference: `attachment.uploaded` is always false and `attachment.uri` is a
  // `file://` path, because there is no upload endpoint (see the header). It is
  // modelled on the message rather than kept in a side-table so the bubble can
  // render it without a lookup, matching how ChatThreadScreen already does it.
  attachment?: ComposerAttachment;
}

/**
 * The assistant's own name and boundary line, from `Assistant Identity Header`
 * 550:2708 and repeated in the disclosure. Hoisted to constants because the
 * identity header, the per-bubble attribution and the disclosure all have to
 * agree — three copies of "MedAI" is how a rename half-lands.
 */
const ASSISTANT_NAME = "MedAI";
const ASSISTANT_ROLE = "AI health assistant · not a clinician";

/**
 * The per-bubble attribution (`Attribution — machine-generated label`, 0:23).
 * Every assistant turn is labelled as machine-generated INSIDE the bubble, so
 * the label survives a screenshot of one message.
 */
const ASSISTANT_ATTRIBUTION = `${ASSISTANT_NAME} · AI-generated`;

const SEED_MESSAGES: ChatMessage[] = [
  {
    // 550:2721 "Assistant turn 1 — proactive lab insight". In the comp this was
    // an "AI Health Insight" CARD pinned above the conversation, which appears
    // in no frame; the frame makes it the assistant's opening turn.
    //
    // FLAGGED — THE FRAME NAMES THE WRONG CLINICIAN. 550:2721 reads "…Dr.
    // Mensah can advise whether a supplement makes sense". Ama Mensah is the
    // seeded PATIENT (scripts/seed_dev_data.py:51), not a doctor, so the frame
    // has the user being referred to herself. Kwabena Osei is the seeded GP
    // ("routine check-ups, chronic disease reviews and first-line referrals"),
    // which is the referral this sentence is making. The frame needs the same
    // correction that turned "Akosua Mensah" into "Ama Mensah" in the Account
    // Menu components (docs/PIPELINE.md §5, 2026-08-05).
    //
    // The comp's version named "Dr. Smith", who is in no roster at all.
    id: "a0",
    author: "ai",
    paragraphs: [
      "Your lab report from yesterday shows Vitamin D a little below the usual range. That is common here, and Dr. Osei can advise whether a supplement makes sense.",
    ],
  },
  {
    id: "u1",
    author: "user",
    paragraphs: [
      "Hi, I've had a mild headache since yesterday evening, mostly around my temples.",
    ],
  },
  {
    id: "a1",
    author: "ai",
    paragraphs: [
      "Thanks — a headache around the temples since yesterday evening. A few questions so I can point you in the right direction:",
    ],
    bullets: [
      "How severe is it, from 1 to 10?",
      "Have you taken anything for it yet?",
      "Any nausea, or trouble with bright light?",
    ],
  },
  {
    id: "u2",
    author: "user",
    paragraphs: [
      "About a 4 out of 10. I haven't taken anything. No nausea, but screen light bothers me.",
    ],
  },
  {
    id: "a2",
    author: "ai",
    paragraphs: [
      "A mild tension headache with some light sensitivity is common after long screen time. Here are a few general things that often help.",
    ],
    suggestions: [
      "Rest somewhere dimly lit for 20–30 minutes.",
      "Drink water regularly through the day.",
      "Take screen breaks — look away every 20 minutes.",
    ],
    escalation: true,
    safety:
      "If the pain gets worse, or you develop sudden severe pain, a fever or confusion, seek medical care now.",
  },
];

/**
 * `Suggested prompt row` 550:2946 — FOUR chips, in this order.
 *
 * The comp had three, reworded ("Check Vitals", "Analyze Lab Report", "Symptom
 * Checker") and was missing "Find a clinic" entirely. These are the frame's
 * labels verbatim, in sentence case as drawn.
 *
 * NO LEADING GLYPHS. Every instance (550:2947…550:2953) has its `Icon` slot
 * `hidden`, so `ChoiceChip`'s `icon` prop is deliberately not passed — the comp
 * drew three glyphs the design system's own default (`Show icon = false`) says
 * should not be there.
 *
 * FLAGGED, carried over: these are ACTION chips, not choice chips — they fire
 * `send()` and never hold a selected state, so they render permanently in
 * 11:104's State=Default. The geometry is identical, which is why they were
 * folded in rather than left to drift, but 11:104 should gain a
 * `Type=Assist | Filter` property so the distinction lives in the design system
 * rather than in a call site that simply never passes `selected`.
 */
const SUGGESTED_PROMPTS = [
  "Check my vitals",
  "Explain a lab report",
  "Symptom checker",
  "Find a clinic",
];

/**
 * `Composer / Chat` 550:2956 draws the placeholder as "Ask about a symptom…".
 * The comp said "Ask me about your symptoms…".
 */
const COMPOSER_PLACEHOLDER = "Ask about a symptom…";

/** `Timestamp divider` 550:2715. The comp appended "AM"; the frame does not. */
const TIMESTAMP_DIVIDER = "Today, 10:24";

// Canned AI acknowledgement for the interactive (no-backend) demo. Kept
// deliberately generic + safety-forward so it reads plausibly for any
// follow-up the user types.
const CANNED_REPLY =
  "Thanks for sharing that. I've noted it. While I gather a few more details, remember this guidance is informational and not a diagnosis. Would you like me to connect you with a practitioner?";

/** How long the simulated assistant "thinks" before the canned reply lands. */
const REPLY_DELAY_MS = 900;

let nextId = 100;
function makeId() {
  nextId += 1;
  return `m${nextId}`;
}

export function AiAssistantScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>(SEED_MESSAGES);
  const [draft, setDraft] = useState("");
  /**
   * `assistant thinking (loading)` 550:4659. The comp had no pending state at
   * all: the user's bubble appeared, then 900ms of nothing, then a reply out of
   * a clear sky. This is an HONEST state — the reply genuinely is pending for
   * that window — which is why it is implemented while the send-failed state is
   * not. See the FLAGGED block below <AiThinkingTurn />.
   */
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Attach + mic. See the COMPOSER MEDIA block in the header.
  const media = useComposerMedia();

  // Composer glyph + fill tokens. Every one of these was a frozen hex literal
  // (`#3d4947`, `#00685f`, `#bcc9c6`, `#6d7a77`, `#171d1c`, and a `#ffffff` on
  // the send glyph that measured ~1.5:1 against `primary` in dark mode).
  const mutedGlyph = useTokenColor("on-surface-variant");
  const onPrimary = useTokenColor("on-primary");
  const primary = useTokenColor("primary");
  const disabledFill = useTokenColor("outline-variant");
  const placeholder = useTokenColor("outline");
  const inputText = useTokenColor("on-surface");

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
  // caller (the suggested-prompt chips, the return key) picks it up unchanged.
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
    setPending(true);
    scrollToEnd();
    // Simulated assistant reply.
    if (replyTimer.current) clearTimeout(replyTimer.current);
    replyTimer.current = setTimeout(() => {
      setPending(false);
      setMessages((prev) => [
        ...prev,
        { id: makeId(), author: "ai", paragraphs: [CANNED_REPLY], escalation: true },
      ]);
      scrollToEnd();
    }, REPLY_DELAY_MS);
  };

  return (
    // ------------------------------------------------------------------
    // DetailShell (safe area + DetailAppBar + body).
    //
    // `claimsBottomInset={false}`: the composer dock is pinned to the bottom
    // under KeyboardInset and must sit flush against the keyboard, so the
    // screen keeps that inset.
    //
    // THE BAR IS BACK TO WHAT THE FRAME DRAWS: a back chevron and the title,
    // nothing else. The comp put the user's own avatar in the `leading` slot
    // and a notifications bell in `actions`; 550:2700's `Detail AppBar — MedAI`
    // has neither, and the bell had no `onPress` — a dead control on a detail
    // bar, which docs/PIPELINE.md's inert-control audit exists to stop. The
    // avatar was also the user's face on a screen about the ASSISTANT, which is
    // the wrong referent for a detail bar's leading slot.
    // ------------------------------------------------------------------
    <DetailShell title={ASSISTANT_NAME} claimsBottomInset={false}>
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
          {/* `Assistant Identity Header` 550:2708 / 550:3765. On first run the
              frame SUPPRESSES the marker plate, because the EmptyState below
              carries the single icon plate and two stacked plates read as two
              subjects. */}
          <AssistantIdentityHeader showPlate={messages.length > 0} />

          {messages.length === 0 ? (
            <AiEmptyState />
          ) : (
            <>
              {/* `Timestamp divider` 550:2715 */}
              <Text className="my-sm text-center font-label-sm text-label-sm text-on-surface-variant">
                {TIMESTAMP_DIVIDER}
              </Text>

              {messages.map((m) =>
                m.author === "user" ? (
                  <UserBubble key={m.id} message={m} />
                ) : (
                  <AiBubble key={m.id} message={m} />
                ),
              )}
            </>
          )}

          {pending ? <AiThinkingTurn /> : null}
        </ScrollView>

        {/* ------------------------------------------------------------------
            `Composer dock — pinned, does not scroll` 550:2945.

            Three stacked rows in this order: the suggested-prompt chips, the
            composer field, and the disclosure. The gutter lives on the CHILDREN
            rather than here, so the chip row can be FULL-BLEED — a scrollable
            ChoiceChipRow applies BRAND's 16px gutter as its own content inset,
            and nesting it inside another 16 would double it.
            ------------------------------------------------------------------ */}
        <View className="border-t border-outline-variant bg-surface pt-sm">
          <View className="pb-sm">
            <ChoiceChipRow scrollable>
              {SUGGESTED_PROMPTS.map((label) => (
                <ChoiceChip key={label} label={label} onPress={() => send(label)} />
              ))}
            </ChoiceChipRow>
          </View>

          {/* Pending attachment / live recording / permission notice. Sits ABOVE
              the field so the field's geometry is untouched.

              FLAGGED, carried over: no composer frame draws a pending-attachment
              or recording state — the mic and paperclip were drawn as
              decoration. See the header of ./ComposerMediaTray. */}
          <ComposerMediaTray media={media} />

          {/* `Composer / Chat (State=Empty)` 550:2956 — a 52-tall pill on
              `field-surface`, holding three 44x44 targets with 24px glyphs and
              4px between them.

              The comp built this at 36x36 + `hitSlop`, which met the 44pt floor
              by touch but not by sight, and squeezed in a FOURTH control. The
              frame's three fit at 361 wide without any of that: 4 + 44 + text +
              44 + 4 + 44 + 4. `field-surface` is the fill Input already uses,
              so the composer stops being the one field on a private surface. */}
          <View className="mx-md h-[52px] flex-row items-center gap-xs rounded-full border border-outline-variant bg-field-surface p-xs">
            <ComposerIconButton
              icon="attach-file"
              label="Attach file"
              onPress={() => void media.pickFile()}
              disabled={media.isPicking || media.isRecording}
            />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={COMPOSER_PLACEHOLDER}
              placeholderTextColor={placeholder}
              onSubmitEditing={() => send(draft)}
              returnKeyType="send"
              multiline
              style={{
                flex: 1,
                maxHeight: 96,
                paddingHorizontal: 8,
                color: inputText,
                fontSize: 16,
                lineHeight: 22,
              }}
              accessibilityLabel="Message MedAI"
            />
            {/* Press to start, press again to commit — ./useComposerMedia argues
                why this is a toggle and not press-and-hold (the permission
                dialog breaks a held gesture). The label changes with the state
                so a screen reader announces what the next tap will do. */}
            <ComposerIconButton
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
              // 44x44, per `Send — 44x44 target` 0:21 and docs/MOBILE_UX.md's
              // floor. It was `h-10 w-10` (40) with no hitSlop override — the
              // exact defect MOBILE_UX names: "a control drawn at 40x40 with no
              // 44pt target override".
              className="h-11 w-11 items-center justify-center rounded-full active:scale-95"
              style={{
                backgroundColor: draft.trim() || media.attachment ? primary : disabledFill,
              }}
            >
              {/* THE GLYPH FOLLOWS THE FILL. Reported: "the send button is not
                  visible on both light and dark mode" — and it was invisible in
                  BOTH, for opposite reasons.

                  The background switches to `outline-variant` when there is
                  nothing to send, but the glyph stayed `on-primary`
                  unconditionally. `on-primary` is the pair of the PRIMARY fill,
                  not of this one:

                    light  255,255,255 white on 188,201,198 grey   ~1.4:1
                    dark     0,55,49 near-black on a dark grey     ~1.3:1

                  Both miss WCAG's 3:1 for a non-text control by a wide margin,
                  and an empty draft is the DEFAULT state — so the control was
                  invisible the moment the screen opened, which is exactly how it
                  was reported.

                  `on-surface-variant` is the correct pair for a neutral fill,
                  and it is what 550:2956's disabled Send draws. VERIFIED against
                  the frame — do not "fix" this back to `on-primary`. */}
              <Icon
                chrome="send"
                size={24}
                color={draft.trim() || media.attachment ? onPrimary : mutedGlyph}
              />
            </Pressable>
          </View>

          <AiDisclosureLine />
        </View>
      </KeyboardInset>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// AI Disclosure Line — 550:2971, and the reason this reconciliation happened
// ---------------------------------------------------------------------------

/**
 * The pinned disclosure, present in ALL FOUR `ai_assistant` frames as
 * `AI Disclosure Line — pinned above the home gesture area`.
 *
 * WHY THIS IS NOT A MESSAGE FOOTNOTE. The previous version of this screen
 * carried the same sentiment on ONE seeded message, as `disclaimer`. A
 * disclosure attached to a message scrolls off the top the moment the
 * conversation is three turns long — so the user who has been talking to the
 * assistant for five minutes, i.e. the one most likely to have started treating
 * it as advice, is the one who can no longer see it. In a health product a
 * disclosure that scrolls past is not a disclosure.
 *
 * It sits INSIDE the composer dock, below the field, so it is pinned by the
 * same container that pins the composer and rides above the keyboard with it —
 * matching 550:2945, where the disclosure is the dock's last child.
 *
 * Spec, read off the node rather than the picture: `surface` fill,
 * `outline-variant` top hairline (inherited from the dock), 16px horizontal /
 * 8px vertical inset (spacing/16, spacing/8), text at `label-sm` in
 * `on-surface-variant`. `label-sm` is 12sp, which is exactly BRAND's floor and
 * therefore legal — it is not below it.
 *
 * `accessibilityRole="text"` with no live region: it is static, and announcing
 * it on every re-render would fight the message list.
 */
const DISCLOSURE_TEXT =
  "MedAI is an AI assistant. It gives general health information, not a diagnosis — for medical advice, talk to a practitioner.";

function AiDisclosureLine() {
  return (
    <View className="px-md py-sm" testID="ai-disclosure-line">
      <Text className="font-label-sm text-label-sm text-on-surface-variant">
        {DISCLOSURE_TEXT}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Assistant identity + states
// ---------------------------------------------------------------------------

/**
 * `Assistant Identity Header` 550:2708 — a 56px `primary-tint` plate with the
 * 24px sparkle, the assistant's name at `headline-md`, and the boundary line at
 * `label-sm`.
 *
 * The boundary line is the point of the component: "not a clinician" is stated
 * once at full size at the top of the conversation, and again in the pinned
 * disclosure at the bottom. The comp had neither, and opened instead with an
 * "AI Health Insight" card that appears in no frame.
 *
 * `showPlate` is the 550:3765 variant — on first run the plate is suppressed so
 * the EmptyState's own 48px plate is the only icon on the screen.
 */
function AssistantIdentityHeader({ showPlate }: { showPlate: boolean }) {
  const glyph = useTokenColor("on-surface-variant");

  return (
    <View className="items-center pb-md" testID="assistant-identity-header">
      {showPlate ? (
        <View className="mb-sm h-14 w-14 items-center justify-center rounded-full bg-primary-tint">
          <Icon chrome="auto-awesome" size={24} color={glyph} />
        </View>
      ) : null}
      <Text className="font-headline-md text-headline-md text-on-surface">{ASSISTANT_NAME}</Text>
      <Text className="mt-xs text-center font-label-sm text-label-sm text-on-surface-variant">
        {ASSISTANT_ROLE}
      </Text>
    </View>
  );
}

/**
 * `EmptyState — first run` 550:3868.
 *
 * Reachable, not decorative: it renders whenever the conversation is empty,
 * which is the state a real first run arrives in once a transcript endpoint
 * exists. The seeded conversation is what 550:2700 draws, so the default render
 * is still the populated one.
 */
function AiEmptyState() {
  const glyph = useTokenColor("on-surface-variant");

  return (
    <View className="items-center py-lg" testID="ai-empty-state">
      <View className="mb-md h-12 w-12 items-center justify-center rounded-full bg-primary-tint">
        <Icon chrome="chat-bubble-outline" size={24} color={glyph} />
      </View>
      {/* Title is `body-md` on `on-surface`, body is `label-sm` on
          `on-surface-variant` — read off 550:3868's variables, not guessed from
          the picture. The title measures 22 tall, which is 16/1.4; a
          `headline-md` here would be 28 and would out-shout the identity header
          it sits under. */}
      <Text className="text-center font-body-md text-body-md text-on-surface">
        Ask MedAI anything about your health
      </Text>
      <Text className="mt-sm text-center font-label-sm text-label-sm text-on-surface-variant">
        Symptoms, a medicine, a lab report. MedAI gives general information, not a diagnosis — and
        can hand you over to a practitioner at any point.
      </Text>
    </View>
  );
}

/**
 * `Assistant turn — pending` 550:4768 — the attribution line with "· thinking…"
 * appended, above a skeleton that RESERVES the bubble's height so the
 * conversation does not jump when the reply lands.
 *
 * The skeleton is STATIC, not a shimmer. 550:4770 instances
 * `SkeletonCard (Shape=List row)`, and this project has no shared skeleton
 * primitive to instance (there is no `SkeletonCard` in src/components/ui — the
 * three screens that show one each drew their own). Rather than add a fourth
 * private shimmer, this draws the same shape from the surface tokens the card
 * vocabulary already uses. Promoting `SkeletonCard` to the design system is the
 * right fix and is out of scope here.
 *
 * FLAGGED — `ai_assistant — send failed (error)` 550:4777 IS NOT IMPLEMENTED,
 * DELIBERATELY. Its `ErrorPanel — assistant unreachable` (550:4886: "MedAI
 * couldn't answer" / "Your message wasn't sent. Check your connection and try
 * again — or message a practitioner instead." / a "Try again" button) needs a
 * send that can FAIL. There is no assistant endpoint: `send()` appends locally
 * and a `setTimeout` produces the reply, so the only way to reach that panel
 * would be to invent a failure — a fake error state is exactly the class of
 * thing that shipped a POST to `/v1/appointments`, an endpoint that does not
 * exist, past 595 mocked tests. It is drawn and specified; it goes in with the
 * endpoint. The composer half of that frame is already satisfied: 550:4911
 * shows the draft PRESERVED after a failed send, and `send()` only clears
 * `draft` on a successful append.
 */
function AiThinkingTurn() {
  return (
    <View className="mb-sm w-full flex-row justify-start gap-sm" testID="ai-thinking-turn">
      <View className="w-8" />
      <View className="flex-1">
        <Text className="mb-xs font-label-sm text-label-sm text-on-surface-variant">
          {ASSISTANT_ATTRIBUTION} · thinking…
        </Text>
        <View
          className="gap-sm rounded-card border border-outline-variant bg-card-surface p-md"
          accessibilityRole="progressbar"
          accessibilityLabel="MedAI is thinking"
        >
          <View className="flex-row items-center gap-sm">
            <View className="h-10 w-10 rounded-md bg-surface-container-highest" />
            <View className="flex-1 gap-xs">
              <View className="h-3 rounded-full bg-surface-container-highest" />
              <View className="h-3 w-1/2 rounded-full bg-surface-container-highest" />
            </View>
          </View>
          <View className="h-8 rounded-md bg-surface-container-highest" />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------------

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <View className="mb-xs w-full flex-row justify-end">
      {/* `Patient turn` 550:2771 — `surface-container-high`, radius/12, 16/12
          inset. The comp's squared top-right corner is not in the frame: every
          bubble corner is radius/12. */}
      <View className="max-w-[85%] rounded-md bg-surface-container-high px-md py-3">
        {message.paragraphs.map((p, i) => (
          <Text key={i} className="font-body-md text-body-md text-on-surface">
            {p}
          </Text>
        ))}
        {message.attachment ? <BubbleAttachment attachment={message.attachment} /> : null}
      </View>
    </View>
  );
}

function AiBubble({ message }: { message: ChatMessage }) {
  // RN takes no `currentColor`, so these need real strings. All three were
  // frozen LIGHT-mode hexes in the comp (`#00685f` = primary, `#515f74` =
  // secondary, `#ffffff` = on-primary). docs/BRAND.md: "Never hardcode a hex."
  const primary = useTokenColor("primary");
  const mutedGlyph = useTokenColor("on-surface-variant");

  return (
    <View className="mb-sm w-full flex-row justify-start gap-sm">
      {/* `Assistant Marker` 0:16 — a 32px plate carrying the 24px SPARKLE. The
          comp drew a 16px `smart-toy` robot at 8x8. `auto-awesome` is the glyph
          the whole file uses for the assistant (it is also 550:831, the AI
          Assistant tile's icon on Patient Home), so the robot was a second
          visual identity for one product surface. */}
      <View className="mt-xs h-8 w-8 items-center justify-center rounded-full bg-primary-tint">
        <Icon chrome="auto-awesome" size={20} color={primary} />
      </View>

      {/* `Bubble` 0:20 — `card-surface` at radius/12 with a full-height 2px
          `AI Rail — machine-generated marker` down the left edge. The rail is
          NOT decoration: with the attribution line it is the second,
          non-textual signal that the turn is machine-generated.

          No shadow. A message bubble is a content surface, i.e. the CARD role,
          and docs/BRAND.md §Elevation gives a card no drop shadow. */}
      <View className="max-w-[85%] flex-1 overflow-hidden rounded-md border border-l-2 border-outline-variant border-l-primary bg-card-surface px-md py-3">
        {/* `Attribution — machine-generated label` 0:23 */}
        <Text className="mb-xs font-label-sm text-label-sm text-on-surface-variant">
          {ASSISTANT_ATTRIBUTION}
        </Text>

        {message.paragraphs.map((p, i) => (
          <Text key={i} className="font-body-md text-body-md text-on-surface">
            {p}
          </Text>
        ))}

        {message.bullets ? (
          <View className="mt-sm gap-xs">
            {message.bullets.map((b, i) => (
              <View key={i} className="flex-row gap-sm">
                <Text className="font-body-md text-body-md text-on-surface-variant">•</Text>
                <Text className="flex-1 font-body-md text-body-md text-on-surface-variant">
                  {b}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {message.suggestions ? (
          // `Suggestions` 0:26 — a `primary-tint` block at radius/12 with a
          // 20px info glyph. The comp titled it "Suggestions:"; the frame says
          // "General suggestions", which is the safer phrase: it does not read
          // as a prescription addressed to this user.
          <View className="mt-sm rounded-md bg-primary-tint p-3">
            <View className="mb-xs flex-row items-center gap-sm">
              <Icon chrome="info-outline" size={20} color={primary} />
              <Text className="font-label-md text-label-md text-on-surface">
                General suggestions
              </Text>
            </View>
            <View className="gap-xs">
              {message.suggestions.map((s, i) => (
                <View key={i} className="flex-row gap-sm">
                  <Text className="font-body-md text-body-md text-on-surface-variant">•</Text>
                  <Text className="flex-1 font-body-md text-body-md text-on-surface-variant">
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {message.escalation ? (
          // `Escalation to a practitioner` 0:41. Both CTAs are `Button`
          // INSTANCES in the frame (0:43 / 0:47, 56 tall) — the comp
          // hand-rolled two Pressables at `py-sm`, i.e. ~36 tall, under the
          // 44pt floor, with a `text-white` literal on one of them.
          <View className="mt-sm gap-sm rounded-md border border-outline-variant bg-surface-container p-md">
            <Text className="font-label-md text-label-md text-on-surface">
              Want a clinician to review this? Our medical team is online.
            </Text>
            {/* FLAGGED — NEITHER CTA HAS A DESTINATION, and neither did before
                this pass. "Talk to a Practitioner" needs a messaging endpoint
                (`/v1/social` is not exposed — docs/PIPELINE.md's inert-control
                audit, "Message a provider"). "Schedule a Consultation" could
                route into the booking flow, but which practitioner it should
                pre-select is a product decision, not an inference. They are
                left without `onPress` so `Button` renders and announces them as
                disabled rather than looking live and doing nothing. */}
            <Button label="Talk to a Practitioner" variant="primary" fullWidth disabled />
            <Button label="Schedule a Consultation" variant="outline" fullWidth disabled />
          </View>
        ) : null}

        {message.safety ? (
          // `Safety Callout` 0:51 — `error-container` with an alert glyph, via
          // the shared InfoCallout's `error` tone rather than a hand-rolled
          // block. The comp rendered this as italic `label-sm` in `outline`:
          // the quietest treatment on the screen for the line that tells the
          // user when to stop reading and get help.
          <View className="mt-sm">
            <InfoCallout tone="error" icon="warning-amber" testID="ai-safety-callout">
              {message.safety}
            </InfoCallout>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A composer glyph button.
 *
 * 44x44 DRAWN, matching `Attach — 44x44 target` (0:11) and
 * `Voice input — 44x44 target` (0:15) rather than meeting the floor with
 * `hitSlop` on a 36px box. The frame's three controls fit at 361 wide; the
 * comp's four did not, which is why it shrank them.
 */
function ComposerIconButton({
  icon,
  label,
  onPress,
  disabled,
  tint = "muted",
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tint?: "muted" | "error";
}) {
  const muted = useTokenColor("on-surface-variant");
  const error = useTokenColor("error");
  const off = useTokenColor("outline-variant");
  const color = disabled ? off : tint === "error" ? error : muted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-surface-variant/50"
    >
      <Icon chrome={icon} size={24} color={color} />
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
//   cardShadow      the old "AI Health Insight" card. That card is gone (it is
//                   in no frame; its content is assistant turn 1 now), but the
//                   rule stands for the bubbles that replaced it.
//   aiBubbleShadow  the assistant's message bubble. A bubble is a content
//                   surface — the same card role — so it gets a hairline, not a
//                   blur.
//   appBarShadow    deleted in an earlier pass with the hand-rolled app bar;
//                   DetailAppBar (Figma 193:120) carries no effects.
//
// Nothing on this screen is a bottom sheet, menu, dialog, toast or FAB, so
// nothing here qualifies for BRAND's `elevation/floating` exception.
// ---------------------------------------------------------------------------
