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
//   - backdrop-blur header → the shared DetailAppBar. (The original translation
//     added a shadow; docs/BRAND.md §Elevation gives a bar none.)
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
// ---------------------------------------------------------------------------
// COMPOSER MEDIA (attach + mic)
// ---------------------------------------------------------------------------
// CHECKED, AND THE ANSWER WAS NO: neither the "Attach file" control nor the
// "Voice message" control had an `onPress`. Both were dead 44pt targets, exactly
// like AiAssistantScreen's pair. They now share ./useComposerMedia with that
// screen — the SDK 55 surface (expo-document-picker, expo-audio,
// expo-file-system) and the permission model are documented there in full.
//
// The picked file and the recording are REAL and device-local. There is NO
// upload — this project has no endpoint that accepts composer media — so the
// attachment rides along on the locally-appended message and the bubble renders
// from its `file://` uri. Faking a POST to an invented route was explicitly
// rejected. See the FLAGGED block in ./useComposerMedia.
//
// This screen's message model ALREADY had `kind: "attachment"` with a
// `{ name, meta, icon }` payload — the seeded `Lab_Panel_May2026.pdf` bubble
// uses it — so a real attachment needed no new message shape, just the two extra
// device-local fields (`uri`, `local`). That is why the outgoing attachment card
// below is unchanged apart from suppressing its download affordance for local
// media, which cannot be downloaded from anywhere.
//
// FLAGGED FOR A FOLLOW-UP (pre-existing, deliberately NOT fixed here): the
// bubbles, the vitals panel, the clinical menu and the FAB in this file are
// still full of frozen hexes (`#00685f`, `#dee4e1`, `#171d1c`, `#6d7a77`,
// `rgba(255,255,255,…)`) and still import MaterialIcons directly — both
// docs/BRAND.md violations. This change retokenised and re-routed only the
// COMPOSER, which is what it touches; retokenising ~600 lines of bubble
// rendering in the same commit would have buried the behaviour change.
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
import { useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { DetailShell, DETAIL_APP_BAR_LEADING_SIZE } from "@/components/shell";
import { Icon, VitalStatCard, type VitalStatTrend } from "@/components/ui";
import { blendTokens, useTokenColor, useTokenShadow } from "@/lib/tokens";
import { useResolvedScheme } from "@/lib/theme";
import { ComposerMediaTray } from "./ComposerMediaTray";
import { useComposerMedia } from "./useComposerMedia";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// ---------------------------------------------------------------------------
// Contact / thread meta — seeded from the Stitch comp.
// Pass ?name=&role=&avatar= params from the caller to override.
// ---------------------------------------------------------------------------

// The seeded cardiologist (scripts/seed_dev_data.py), not the invented "Dr.
// Sarah Miller" the comp shipped. Find Care lists the seeded doctors, so a
// thread with a doctor who is not in that list reads as a bug — and this thread
// is Adjoa Boateng's: the conversation is an ECG review with vitals, and her
// seed bio is hypertension management and heart-failure follow-up.
//
// InboxScreen's first conversation is the SAME person and the same avatar URI,
// and it must stay in step: it is what pushes `?name=` into this screen.
const SEED_CONTACT = {
  name: "Dr. Adjoa Boateng",
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
    /**
     * Set for media the user just attached from the composer. A DEVICE-LOCAL
     * `file://` path — never a server url, because there is no upload endpoint
     * (see the header). Absent on the seeded messages, which stand in for
     * already-uploaded server attachments.
     */
    localUri?: string;
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

/**
 * Was `TREND_ICONS`, a local MaterialIcons table. The glyphs now live in
 * VitalStatCard's own `TREND_GLYPH` (one definition), so all this thread has to
 * do is translate its own wire vocabulary into the shared `VitalStatTrend`
 * union. Only "stable" differs from it — the shared name is "flat".
 */
const TREND_TO_TOKEN: Record<"up" | "down" | "stable", VitalStatTrend> = {
  up: "up",
  down: "down",
  stable: "flat",
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
  // Attach + mic. See the COMPOSER MEDIA block in the header.
  const media = useComposerMedia();
  // The bar's two action glyphs, resolved by token name for the current mode.
  // The hand-rolled bar froze them at `#00685f` and `#3d4947` — the LIGHT values
  // of color/primary and color/on-surface-variant.
  const primary = useTokenColor("primary");
  const mutedGlyph = useTokenColor("on-surface-variant");
  // The two GENUINELY floating surfaces on this screen — the clinical-actions
  // menu and the FAB that opens it. Both keep a shadow because docs/BRAND.md
  // §Elevation names those exact roles as the exception; both are retokenised
  // onto the `shadow` token rather than the black-at-15% and teal-at-40%
  // literals they carried.
  const floatingShadow = useTokenShadow("shadow", FLOATING_SHADOW);
  // `#ffffff` was frozen into the menu's fill, so it stayed white in dark mode.
  // `card-surface` is the role that resolves to a surface which LIFTS off the
  // page in both modes (#FFFFFF light, #242B2A dark).
  const menuSurface = useTokenColor("card-surface");
  // Composer tokens. Every one of these replaces a frozen LIGHT-mode literal
  // (`#3d4947`, `#6d7a77`, `#171d1c`, `#bcc9c6`, and a `#ffffff` send glyph that
  // measured ~1.5:1 on `primary` in dark mode).
  const onPrimary = useTokenColor("on-primary");
  const disabledFill = useTokenColor("outline-variant");
  const placeholder = useTokenColor("outline");
  const inputText = useTokenColor("on-surface");
  // The send button's pressed fill. The literal it replaces was `#005049` — a
  // hand-darkened teal. This is the M3 STATE LAYER instead (`primary` tinted
  // towards its own `on-primary`), which is the same 0.12 recipe InboxScreen's
  // FAB and Button already use, and which correctly lightens in dark mode where
  // hand-darkening would have gone the wrong way.
  const { scheme } = useResolvedScheme();
  const primaryPressed = blendTokens("primary", "on-primary", PRESSED_STATE_LAYER, scheme);
  const scrollRef = useRef<ScrollView>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    };
  }, []);

  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  // The guard used to be "no text, no send". An attachment-only message is a
  // legitimate send (a photo of a rash, a dictated note), so EITHER a non-empty
  // draft OR a pending attachment now qualifies. `media.attachment` is read at
  // call time so every existing caller — the return key, the clinical share
  // menu — picks it up without a signature change.
  const send = (text: string) => {
    const trimmed = text.trim();
    const pending = media.attachment;
    if (!trimmed && !pending) return;
    setClinicalOpen(false);
    setMessages((prev) => [
      ...prev,
      {
        id: makeId(),
        direction: "outgoing",
        kind: pending ? "attachment" : "text",
        // `undefined`, not "": OutgoingBubble skips the text block entirely for a
        // falsy value, so an attachment-only message renders as just the card.
        text: trimmed || undefined,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        // `delivered` stays true to match the seeded messages' local-demo
        // convention, but note it is a LIE for an attachment: nothing was
        // uploaded. It is left alone rather than made conditional because
        // per-message delivery state is the backend's to own, and inventing a
        // "pending" tick here would be inventing wire semantics.
        delivered: true,
        attachment: pending
          ? {
              name: pending.name,
              meta: pending.meta,
              icon: pending.kind === "recording" ? "mic" : "description",
              localUri: pending.uri,
            }
          : undefined,
      },
    ]);
    // Frees the composer slot WITHOUT reaping the file — the message above now
    // references its uri. (`clearAttachment` would delete a capture.)
    if (pending) media.consumeAttachment();
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
    // ------------------------------------------------------------------
    // DetailShell (safe area + DetailAppBar + body). Replaces this screen's
    // hand-rolled `View > StatusBar style="dark" > SafeAreaView` wrapper —
    // the frozen "dark" was one of eleven, and it left dark-mode users with
    // dark glyphs on a near-black bar.
    //
    // `claimsBottomInset={false}`: the composer is pinned to the bottom
    // under a KeyboardAvoidingView, so a static bottom pad from the shell
    // would stay put when the keyboard opens and leave a ~34px gap between
    // the composer and the keyboard. Same edge set the screen passed before
    // (["top","left","right"]) — behaviour is unchanged.
    //
    // The KAV stays HERE, below the bar. A shell-level one would lift the
    // app bar off the top of the screen when the keyboard opens.
    //
    // The bar itself is the shared detail bar (Figma 193:120). This is the
    // screen its `leading` and `subtitle` slots were flagged into existence
    // for: avatar + presence dot, name, and a presence line.
    //
    // FLAGGED (carried over, unchanged by this migration) — the hand-rolled
    // bar drew the word "Doctor" as a filled ROLE PILL (a rounded 10px
    // uppercase tag on a `rgba(0,131,120,0.15)` tint) beside the specialty
    // at 11px. Both type sizes are BELOW docs/BRAND.md's 12sp floor, so the
    // pill could not ship as drawn in any case; 193:120 has no
    // leading-of-subtitle slot, and adding a `subtitleBadge` prop would
    // re-admit per-screen chrome. The information is preserved by folding
    // the role into the subtitle line, which renders at `label-sm` 12. If
    // the pill treatment is wanted back, 193:120 needs a
    // `Content=Title + Badge` variant.
    // ------------------------------------------------------------------
    <DetailShell
      title={contact.name}
      subtitle={`Doctor · ${contact.role}`}
      claimsBottomInset={false}
      leading={
        <View className="relative shrink-0">
          {contact.avatarUri ? (
            <Image
              source={{ uri: contact.avatarUri }}
              style={{
                width: DETAIL_APP_BAR_LEADING_SIZE,
                height: DETAIL_APP_BAR_LEADING_SIZE,
                borderRadius: DETAIL_APP_BAR_LEADING_SIZE / 2,
              }}
              accessibilityLabel={contact.name}
            />
          ) : (
            <View
              className="items-center justify-center rounded-full bg-primary-container"
              style={{
                width: DETAIL_APP_BAR_LEADING_SIZE,
                height: DETAIL_APP_BAR_LEADING_SIZE,
              }}
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
              accessibilityLabel="Online"
            />
          ) : null}
        </View>
      }
      actions={
        <View className="flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Video call"
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
            onPress={() => {
              // TODO: initiate video call once telehealth signalling service ships.
            }}
          >
            <Icon chrome="videocam" size={24} color={primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Conversation info"
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
          >
            <Icon chrome="info-outline" size={24} color={mutedGlyph} />
          </Pressable>
        </View>
      }
    >
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

        {/* Share options sheet — a MENU, which docs/BRAND.md §Elevation names
              as one of the four roles that may genuinely float. Its shadow is
              KEPT and retokenised: `shadow` at 8% over a 2/6 pair, replacing a
              20px black at 15%. */}
        {clinicalOpen ? (
          <View
            style={{
              position: "absolute",
              bottom: 96,
              right: 72,
              zIndex: 25,
              backgroundColor: menuSurface,
              borderRadius: 16,
              overflow: "hidden",
              ...floatingShadow,
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
                  backgroundColor: pressed ? "rgba(0,104,95,0.06)" : "transparent",
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

        {/* FAB — the other sanctioned floating role, same retokenised pair.
              What it does NOT keep is the old 12px teal glow at 40% opacity. */}
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
                backgroundColor: clinicalOpen ? "#004d46" : pressed ? "#005049" : "#00685f",
              },
              floatingShadow,
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
        {/* The input bar is a docked BAR, not a floating surface, so its
              `inputBarShadow` (an upward 8px black wash) is deleted rather than
              softened — docs/BRAND.md §Elevation gives a bar no shadow, same as
              the app bar at the top. Its separation is the top hairline, now at
              full-strength `outline-variant` instead of `/20`, because with the
              blur gone the hairline is the only edge. */}
        <View className="border-t border-outline-variant bg-surface pb-sm pt-sm">
          {/* Pending attachment / live recording / permission notice, ABOVE the
                pill so the pill's geometry is untouched. It carries its own `mx-md`
                gutter, which is why this container's `px-md` moved onto the pill. */}
          <ComposerMediaTray media={media} />

          <View className="mx-md flex-row items-center gap-xs rounded-full border border-outline-variant/30 bg-surface-container-low px-sm py-xs">
            {/* Clinical menu toggle (apps icon) */}
            <ComposerIconButton
              icon={clinicalOpen ? "close" : "apps"}
              label="Clinical actions"
              tint={clinicalOpen ? "primary" : "muted"}
              onPress={() => setClinicalOpen((v) => !v)}
            />

            {/* Attach — was a Pressable with NO onPress at all. */}
            <ComposerIconButton
              icon="attach-file"
              label="Attach file"
              onPress={() => void media.pickFile()}
              disabled={media.isPicking || media.isRecording}
            />

            {/* Text input */}
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message…"
              placeholderTextColor={placeholder}
              onSubmitEditing={() => send(draft)}
              returnKeyType="send"
              multiline
              style={{
                flex: 1,
                minHeight: 36,
                maxHeight: 96,
                paddingHorizontal: 4,
                color: inputText,
                fontSize: 16,
                lineHeight: 22,
              }}
              accessibilityLabel="Message input"
            />

            {/* Mic — also had no onPress. Press to start, press again to commit;
                  ./useComposerMedia argues why this is a toggle rather than
                  press-and-hold (a system permission dialog breaks a held
                  gesture). The label follows the state so a screen reader
                  announces what the next tap does. */}
            <ComposerIconButton
              icon={media.isRecording ? "stop" : "mic"}
              label={media.isRecording ? "Stop recording" : "Voice message"}
              tint={media.isRecording ? "error" : "muted"}
              onPress={() => void media.toggleRecording()}
            />

            {/* Send */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !draft.trim() && !media.attachment }}
              onPress={() => send(draft)}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  draft.trim() || media.attachment
                    ? pressed
                      ? primaryPressed
                      : primary
                    : disabledFill,
              })}
            >
              {/* Was `color="#ffffff"` — a frozen literal that measured ~1.5:1 on
                    `primary` in dark mode, where `on-primary` correctly resolves
                    to a near-black #003731. */}
              <Icon chrome="send" size={18} color={onPrimary} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Composer controls
// ---------------------------------------------------------------------------

/** M3's pressed state-layer opacity. Same constant InboxScreen's FAB uses. */
const PRESSED_STATE_LAYER = 0.12;

/**
 * A composer glyph button. Extracted because the three in the pill were three
 * copies of the same Pressable, and two of them had no `onPress` — the drift that
 * let them ship as decoration.
 *
 * 36x36 drawn with `hitSlop={4}` is a 44x44 target, docs/MOBILE_UX.md's floor;
 * the drawn box stays 36 so four controls plus the field fit one pill at 360dp.
 * `disabled` reports through `accessibilityState` as well as the fill, because a
 * greyed glyph is not announced.
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
  tint?: "muted" | "primary" | "error";
}) {
  const muted = useTokenColor("on-surface-variant");
  const primary = useTokenColor("primary");
  const error = useTokenColor("error");
  const off = useTokenColor("outline-variant");
  const color = disabled ? off : tint === "primary" ? primary : tint === "error" ? error : muted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-variant/50"
    >
      <Icon chrome={icon} size={22} color={color} />
    </Pressable>
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
            style={{
              backgroundColor: "#00685f",
              borderRadius: 20,
              borderBottomRightRadius: message.attachment ? 20 : 4,
              paddingHorizontal: 16,
              paddingVertical: 10,
              marginBottom: message.attachment ? 4 : 0,
            }}
          >
            <Text style={{ color: "#ffffff", fontSize: 15, lineHeight: 22 }}>{message.text}</Text>
          </View>
        ) : null}

        {/* Attachment card */}
        {message.kind === "attachment" && message.attachment ? (
          <View
            style={{
              backgroundColor: "#00685f",
              borderRadius: 20,
              borderBottomRightRadius: 4,
              padding: 12,
            }}
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
                <MaterialIcons name={message.attachment.icon} size={22} color="#ffffff" />
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
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 }}>
                  {/* Local media says so, in words. There is no upload endpoint,
                      so "sent" would be false. */}
                  {message.attachment.localUri
                    ? `${message.attachment.meta} · on this device only`
                    : message.attachment.meta}
                </Text>
              </View>
              {/* The download glyph is suppressed for device-local media: there is
                  nowhere to download it FROM, and a control that cannot work is
                  the exact defect this change was opened to fix. */}
              {message.attachment.localUri ? null : (
                <MaterialIcons name="download" size={20} color="rgba(255,255,255,0.8)" />
              )}
            </View>
          </View>
        ) : null}

        {/* Timestamp + delivery status */}
        <View
          className="mt-xs flex-row items-center justify-end gap-xs"
          style={{ paddingRight: 4 }}
        >
          <Text style={{ fontSize: 11, color: "#6d7a77" }}>{message.timestamp}</Text>
          {message.delivered ? <MaterialIcons name="done-all" size={14} color="#00685f" /> : null}
        </View>
      </View>
    </View>
  );
}

function IncomingBubble({ message, contactName }: { message: ChatMessage; contactName: string }) {
  if (message.kind === "vitals" && message.vitals) {
    return (
      <View className="mb-sm w-full items-start">
        <View style={{ maxWidth: "88%" }}>
          {/* Intro text */}
          {message.text ? (
            <View
              style={{
                backgroundColor: "#dee4e1",
                borderRadius: 20,
                borderBottomLeftRadius: 4,
                paddingHorizontal: 16,
                paddingVertical: 10,
                marginBottom: 6,
              }}
            >
              <Text style={{ color: "#171d1c", fontSize: 15, lineHeight: 22 }}>{message.text}</Text>
            </View>
          ) : null}

          {/* Vitals card */}
          <VitalsCard vitals={message.vitals} />

          <Text style={{ fontSize: 11, color: "#6d7a77", marginTop: 4, marginLeft: 4 }}>
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
          style={{
            backgroundColor: "#dee4e1",
            borderRadius: 20,
            borderBottomLeftRadius: 4,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          {message.text ? (
            <Text style={{ color: "#171d1c", fontSize: 15, lineHeight: 22 }}>{message.text}</Text>
          ) : null}
        </View>
        <Text style={{ fontSize: 11, color: "#6d7a77", marginTop: 4, marginLeft: 4 }}>
          {message.timestamp}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Vitals card — rendered inside an incoming bubble
// ---------------------------------------------------------------------------

function VitalsCard({ vitals }: { vitals: NonNullable<ChatMessage["vitals"]> }) {
  // RN has no currentColor, so the header glyph needs a real string — by TOKEN
  // NAME, replacing `rgba(255,255,255,0.8)`, which stayed white-on-light-teal in
  // dark mode where `on-primary` correctly becomes dark.
  const onPrimary = useTokenColor("on-primary");

  return (
    <View
      // Was `backgroundColor: "#00685f"` — the LIGHT value of color/primary,
      // frozen in JS, so the panel stayed dark teal in dark mode. `bg-primary`
      // and the `text-on-primary` pairs below flip with the mode as BRAND
      // requires ("Text on an accent must use its `on-*` pair").
      // radius 20 -> 24, and the note box's 10 -> 12: BRAND's radius scale is
      // 4/12/24/full and had neither 20 nor 10 on it.
      className="rounded-card rounded-bl-xs bg-primary p-4"
      style={{ gap: 12 }}
    >
      {/* Header. Glyph was 18 (off BRAND's 24/20 ramp) at
          `rgba(255,255,255,0.8)`; now 20 at `on-primary` with the opacity
          carried by the token class so it inverts correctly. */}
      <View className="flex-row items-center gap-xs">
        <Icon name="heart-rate" size={20} color={onPrimary} />
        <Text className="font-label-sm text-label-sm uppercase text-on-primary/80">
          Vitals summary
        </Text>
      </View>

      {/* 2-up stat grid — now the shared VitalStatCard (Figma 211:241).
          Deletes the local `VitalStat`, which was one of the six private copies
          the component was extracted to end: it drew the value at 18px/700 (the
          ramp has no 18 step; 211:247 is `headline-lg` 24) and the label at
          11px, BELOW BRAND's 12sp floor, and carried seven literals.

          FLAGGED — the one thing the shared component cannot express here:
          211:241 / VitalStatCard binds its fill to the `card-surface` ROLE and
          exposes no `className`/`style`, deliberately, so a screen cannot
          express a private variant of a clinical reading. The local copy was a
          TRANSLUCENT WHITE tile ON an accent surface. So the two readings now
          render as normal cards inside the teal panel instead of as
          white-on-teal washes. That is a deliberate VISUAL CHANGE to this
          message, and it needs a designer call: either 211:241 gains an
          `OnAccent` tone, or this message stops being teal and becomes a normal
          incoming bubble. It was NOT resolved with a one-off style prop, which
          would re-admit the drift the extraction removed. */}
      <View className="flex-row gap-sm">
        <View className="flex-1">
          <VitalStatCard
            label="Blood Pressure"
            value={vitals.bp}
            icon="blood-pressure"
            trend={TREND_TO_TOKEN[vitals.bpTrend]}
          />
        </View>
        <View className="flex-1">
          <VitalStatCard
            label="Heart Rate"
            value={vitals.hr}
            icon="heart-rate"
            trend={TREND_TO_TOKEN[vitals.hrTrend]}
          />
        </View>
      </View>

      {/* Note */}
      <View className="rounded-md border border-on-primary/15 bg-on-primary/10 p-3">
        <Text className="font-label-sm text-label-sm text-on-primary/90">{vitals.note}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Timeline divider
// ---------------------------------------------------------------------------

function TimelineDivider({ label }: { label: string }) {
  return (
    <View className="my-sm flex-row items-center gap-sm">
      <View className="h-px flex-1 bg-surface-container-highest" style={{ opacity: 0.7 }} />
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
      <View className="h-px flex-1 bg-surface-container-highest" style={{ opacity: 0.7 }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Elevation
//
// Six `Platform.select` shadow tables used to live here. Five are GONE — not
// softened — because docs/BRAND.md §Elevation only grants a shadow to a surface
// that GENUINELY floats, and none of these did:
//
//   appBarShadow          deleted in an earlier pass with the hand-rolled bar;
//                         DetailAppBar (Figma 193:120) has no effects.
//   inputBarShadow        a docked BAR. Bars cast no shadow either. Separation
//                         is its top hairline, now at full strength.
//   outgoingBubbleShadow  message bubbles (x3 call sites, incl. the vitals
//                         panel). A bubble is a content surface — the CARD role
//                         — and a card casts no shadow.
//   incomingBubbleShadow  same, x2. Its `#475569` grey was also off-palette
//                         entirely: BRAND allows only the `shadow` token, "never
//                         grey".
//
// What SURVIVES is `FLOATING_SHADOW` below, shared by the two surfaces that are
// genuinely floating roles under BRAND — the clinical-actions MENU and the FAB.
// It is a token spec, not a table of literals: the old pair were a 20px black at
// 15% and a 12px teal at 40%, both far outside BRAND's "<=8%, tinted with the
// `shadow` token" ceiling.
// ---------------------------------------------------------------------------

/**
 * BRAND's sanctioned `elevation/floating` spec — "a tight `0 1px 2px` /
 * `0 2px 6px` pair at <=8%, tinted with the `shadow` token, never grey". RN
 * takes a single shadow, so this is the outer half of the pair.
 */
const FLOATING_SHADOW = { y: 2, blur: 6, opacity: 0.08 } as const;
