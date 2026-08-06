// Chat Thread screen — the focused message conversation view.
// Figma: `chat_thread` 552:1376, page 548:615 "Messaging".
// Reached from:
//   • InboxScreen → tap any ConversationItem
//   • PractitionerSocialProfileScreen → "Message" button
//
// This is a PUSHED screen (not a root tab), so:
//   - No BottomNav (same rationale as AiAssistantScreen — too much bottom
//     furniture when the keyboard is up on a focused chat journey).
//   - Back arrow is the return affordance.
//
// ---------------------------------------------------------------------------
// RECONCILED AGAINST 552:1376 ON 2026-08-06 — AND THE FRAME AND THIS SCREEN
// ARE NOT THE SAME CONVERSATION. READ THIS BEFORE "FINISHING THE JOB".
// ---------------------------------------------------------------------------
// 552:1376 draws a PRACTITIONER-SIDE GROUP THREAD: an "ICU Night Shift" room
// with a `ThreadContextBar` (552:1383) reading "8 members · 3 online now", a
// per-message `Sender` line ("Dr. Sarah Chen · Attending Physician"), a
// `DayDivider / shift start` and a `SystemEvent / joined` row.
//
// This screen is the PATIENT-SIDE 1:1 thread. InboxScreen pushes `?name=&role=`
// into it, and the route in docs/PIPELINE.md §4 maps `chat-thread 552:1376` to
// exactly this file. So one of the two is wrong about what this route IS, and
// that is a PO call, not something to infer. What was reconciled here is
// therefore the frame's ANATOMY — the parts that are true of any thread — and
// the group-specific content is FLAGGED at the bottom of this header rather
// than built.
//
// Adopted from the frame:
//   - Composer / Chat 552:1512, the SAME component the AI screen instances: a
//     52-tall `field-surface` pill with three 44x44 targets.
//   - Incoming bubble on `card-surface` with an `outline-variant` hairline at
//     radius/12 — not a fill-only `surface-container-highest` blob at radius 20.
//   - Bubble body text at `body-md` 16. This closes the "STILL FLAGGED" note
//     the previous header carried: the 15/22 it would not move without a design
//     call now HAS one — 552:1403 and 552:1496 both bind `body-md`.
//   - The vitals message is a CARD, not a teal panel (552:1428). See VitalsCard.
//
// NOT adopted, and why — each of these is a frame element with no data source
// or a frame element that breaks a repo rule:
//
//   1. THE FRAME'S NAMES ARE NOT IN THE ROSTER. "Dr. Sarah Chen", "Mark
//      Thompson" and "Nurse Jennifer" are invented. The seeded roster is Ama
//      Mensah (patient) plus doctors Kwabena Osei, Adjoa Boateng, Yaw Darko,
//      Efua Asante, Nii Tetteh and Abena Owusu. docs/PIPELINE.md §4 records
//      that "Dr. Sarah Jenkins" leaked into the booking round from a
//      half-finished frame, and §5 records "Akosua Mensah" being corrected out
//      of the Account Menu components on 2026-08-05. This is the same defect,
//      one page over. The frame needs the correction; the code does not adopt
//      the names.
//   2. `ThreadContextBar` 552:1383 — "8 members · 3 online now", an avatar
//      stack, a +6 overflow. There is no thread-membership endpoint. There are
//      no messaging endpoints AT ALL (docs/PIPELINE.md's inert-control audit:
//      "New conversation — InboxScreen. No messaging endpoints."), so member
//      count, presence and the roster behind the +6 would all be fabricated.
//   3. `SystemEvent / joined` 552:1510 — same reason: join/leave events are a
//      wire concept this app has no wire for.
//   4. The per-message `Sender` line. It is what makes a GROUP thread legible;
//      in a 1:1 the app bar already names the other party, so it would be the
//      same name repeated down the page. It goes in with the group thread, if
//      the PO rules that this route becomes one.
//
// KEPT DESPITE BEING ABSENT FROM THE FRAME (a drop has to be flagged, and so
// does a keep): the Clinical Actions FAB and its share menu. 552:1376 draws
// neither, but they are the only route to sharing clinical data into a thread
// and they work. The composer's duplicate `apps` toggle IS removed — it opened
// the same menu as the FAB, and dropping it is what gets the composer down to
// the frame's three controls.
//
// Seed data: replace with useQuery(["thread", id]) once GET /v1/threads/:id
// ships.
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
// THAT FOLLOW-UP IS NOW DONE. The composer pass above deliberately left the
// bubbles, the clinical menu and the FAB on frozen LIGHT-mode hexes so the
// behaviour change stayed reviewable; this pass finishes the file. What changed:
//
//   `#00685f`  -> `bg-primary` / `useTokenColor("primary")`
//   `#dee4e1`  -> `bg-surface-container-highest`
//   `#171d1c`  -> `text-on-surface`
//   `#6d7a77`  -> `text-outline` (the same role the composer's placeholder took)
//   `#f0f5f3`  -> `bg-surface-container-low` (240,245,242 — a 1/255 blue shift)
//   `#004d46` / `#005049` -> `blendTokens("primary", "on-primary", …)`, the M3
//              state layer, because a hand-darkened teal darkens the WRONG WAY
//              in dark mode where `primary` is already the light end.
//   `rgba(255,255,255,…)` -> `bg-on-primary/<a>` at the same alphas, so the
//              washes invert with the accent they sit on.
//   `rgba(0,131,120,0.12)` -> `bg-primary-container/12` (an exact token match).
//   `rgba(0,0,0,0.06)` -> `outline-variant`, BRAND's hairline role.
//
// MaterialIcons is no longer imported here: every glyph goes through the shared
// `<Icon chrome=… />` gate, and `IconName` is its re-exported `ChromeIconName`.
// docs/BRAND.md: "Screens must never import an icon library directly."
//
// Two type-ramp fixes came with it — the menu row's label was 15px inline (now
// `label-md` 14) and every timestamp was 11px, BELOW BRAND's 12sp floor (now
// `label-sm` 12).
//
// ~~STILL FLAGGED~~ CLOSED 2026-08-06 by the frame: the bubble BODY text was
// 15px/22, on no BRAND step, and was left alone because moving 15 -> 16 reflows
// every bubble and that is a design call. 552:1403 / 552:1496 bind `body-md`,
// so the design call is made and the bubbles are on the ramp.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding expo-* APIs.

import { useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { DetailShell, DETAIL_APP_BAR_LEADING_SIZE } from "@/components/shell";
import {
  Card,
  Icon,
  KeyboardInset,
  SectionHeader,
  VitalStatCard,
  type ChromeIconName,
  type VitalStatTrend,
} from "@/components/ui";
import { blendTokens, useTokenColor, useTokenShadow } from "@/lib/tokens";
import { useResolvedScheme } from "@/lib/theme";
import { ComposerMediaTray } from "./ComposerMediaTray";
import { useComposerMedia } from "./useComposerMedia";

// The glyph names this screen's own tables carry. `ChromeIconName` comes from the
// Icon gate rather than from @expo/vector-icons, which src/components/ui/icons is
// the only file allowed to import ("Screens must never import an icon library
// directly"). Every one of these names is UI chrome, so they all take
// `<Icon chrome=… />`; a clinical concept would take `<Icon name=… />` instead
// (see VitalsCard's `heart-rate` below).
type IconName = ChromeIconName;

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
  // The FAB's OPEN (selected) fill — the same recipe one layer deeper, replacing
  // the hand-darkened `#004d46`. It has to stay distinguishable from
  // `primaryPressed` because the FAB can be open AND pressed at once.
  const primaryActive = blendTokens("primary", "on-primary", ACTIVE_STATE_LAYER, scheme);
  // The clinical menu's row chrome. Both replace literals that assumed a white
  // menu: a 6% teal wash and a 6% BLACK hairline, the latter invisible on the
  // #242B2A surface `card-surface` resolves to in dark mode.
  const menuRowPressed = useTokenColor("primary", 0.06);
  const hairline = useTokenColor("outline-variant");
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
          {/* The "Conversation info" button is GONE. It had no `onPress` — a
              dead control, the exact class docs/PIPELINE.md's inert-control
              audit enumerates — and 552:1376's app bar does not draw it. The
              frame's single trailing action is a share/export glyph, which is
              not wired here either; it is left OUT rather than added dead. */}
        </View>
      }
    >
      {/* KeyboardInset, NOT KeyboardAvoidingView. The KAV infers the keyboard from a
          WINDOW RESIZE, and under SDK 55's Android edge-to-edge the window is no
          longer resized — proven on device, where setting behavior="padding" left
          the composer still absent and the list still clipped at the keyboard's
          top edge. KeyboardInset reads the IME inset from the platform instead. */}
      <KeyboardInset className="flex-1">
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
          {/* `DayDivider` 552:1398. The label lost "· Tap any message for
              details": no message on this screen is pressable, so the divider
              was promising an interaction that does not exist. The frame's
              divider states when the conversation starts and nothing else. */}
          <TimelineDivider label="Today" />

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
                  // Was `rgba(0,104,95,0.06)` — the LIGHT `primary` frozen at 6%.
                  backgroundColor: pressed ? menuRowPressed : "transparent",
                  borderTopWidth: i > 0 ? 1 : 0,
                  // Was `rgba(0,0,0,0.06)`, which is invisible on a #242B2A
                  // dark-mode menu. `outline-variant` is BRAND's hairline role.
                  borderTopColor: hairline,
                })}
              >
                <View
                  // `rgba(0,131,120,0.12)` was an exact match for
                  // `primary-container` at 12%, so it becomes that token. Radius
                  // 10 -> 12, the same off-scale correction VitalsCard's note box
                  // already took (BRAND's scale is 4/12/24/full).
                  className="h-9 w-9 items-center justify-center rounded-md bg-primary-container/12"
                >
                  <Icon chrome={a.icon} size={18} color={primary} />
                </View>
                {/* Was 15px/600 inline at `#171d1c`. 15 is on no BRAND step;
                    `label-md` is the 14/600 the ramp actually defines. */}
                <Text
                  className="font-label-md text-label-md text-on-surface"
                  style={{ minWidth: 160 }}
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
                // Was `#004d46` / `#005049` / `#00685f` — two hand-darkened
                // teals over the LIGHT `primary`. Hand-darkening is backwards in
                // dark mode, where `primary` resolves to the LIGHT end of the
                // ramp (107,216,203) and "deeper" has to mean lighter. The M3
                // state layer gets that right in both modes for free.
                backgroundColor: clinicalOpen
                  ? primaryActive
                  : pressed
                    ? primaryPressed
                    : primary,
              },
              floatingShadow,
            ]}
          >
            {/* `#ffffff` was frozen here too — same ~1.5:1 dark-mode failure the
                composer's send glyph had. */}
            <Icon chrome={clinicalOpen ? "close" : "medical-services"} size={24} color={onPrimary} />
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

          {/* `Composer / Chat (State=Empty, Docked=Yes)` 552:1512 — the SAME
              component instance the AI screen carries (550:2956), so the two
              composers stop being two different pills: a 52-tall `field-surface`
              rounded-full field holding three 44x44 targets with 24px glyphs and
              4px between them.

              What changed from the comp translation: `surface-container-low` ->
              `field-surface` (the role Input already uses, and the frame's
              `var(--color-field-surface)`), the `/30` hairline -> full strength,
              and the FOURTH control is gone — see the header. */}
          <View className="mx-md h-[52px] flex-row items-center gap-xs rounded-full border border-outline-variant bg-field-surface p-xs">
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
                maxHeight: 96,
                paddingHorizontal: 8,
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
              // 44x44, per `Send — 44x44 target` in 552:1512 and
              // docs/MOBILE_UX.md's floor. It was drawn at 36 and met the floor
              // only through its neighbours' hitSlop, which the send button did
              // not even have.
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 22,
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

                  `on-surface-variant` is the correct pair for a neutral fill and
                  is what every other muted glyph here already uses. */}
              <Icon
                chrome="send"
                size={24}
                color={draft.trim() || media.attachment ? onPrimary : mutedGlyph}
              />
            </Pressable>
          </View>
        </View>
      </KeyboardInset>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Composer controls
// ---------------------------------------------------------------------------

/** M3's pressed state-layer opacity. Same constant InboxScreen's FAB uses. */
const PRESSED_STATE_LAYER = 0.12;

/**
 * One layer deeper than pressed, for a control that is HELD OPEN rather than
 * momentarily touched — here, the clinical-actions FAB while its menu is up.
 * 0.16 is M3's next published step above pressed, so the open and pressed fills
 * stay distinct (the FAB can be both) without inventing a per-variant token.
 */
const ACTIVE_STATE_LAYER = 0.16;

/**
 * A composer glyph button. Extracted because the three in the pill were three
 * copies of the same Pressable, and two of them had no `onPress` — the drift that
 * let them ship as decoration.
 *
 * 44x44 DRAWN, matching the `Attach`/`Voice input` targets inside
 * `Composer / Chat` 552:1512 rather than meeting docs/MOBILE_UX.md's floor with
 * `hitSlop` on a 36px box. The drawn box was 36 so that FOUR controls plus the
 * field would fit one pill at 360dp; the frame has three, which fit at 44.
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
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-surface-variant/50"
    >
      <Icon chrome={icon} size={24} color={color} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Bubble components
// ---------------------------------------------------------------------------

function OutgoingBubble({ message }: { message: ChatMessage }) {
  // RN takes no `currentColor`, so the two glyphs in here need real strings.
  // `on-primary` for the ones sitting ON the teal bubble, `primary` for the
  // delivery tick, which sits on the page.
  const onPrimary = useTokenColor("on-primary");
  const primary = useTokenColor("primary");
  // The download glyph's `rgba(255,255,255,0.8)`, expressed as the token it was
  // standing in for.
  const onPrimaryMuted = useTokenColor("on-primary", 0.8);

  return (
    <View className="mb-xs w-full items-end">
      <View style={{ maxWidth: "80%" }}>
        {/* Text portion (above attachment if present) */}
        {message.text ? (
          <View
            // Was `backgroundColor: "#00685f"` — the LIGHT value of
            // color/primary frozen in JS, so the bubble stayed dark teal in dark
            // mode while its `on-primary` text correctly went near-black.
            // radius 20 -> `radius/12` (552:1496) — 20 is on no BRAND step
            // (4/12/24/full) and was inherited from the comp's `rounded-2xl`.
            // The 4px "tail" corner goes with it: the frame draws every bubble
            // corner equal and lets left/right alignment carry the direction.
            className="bg-primary"
            style={{
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
              marginBottom: message.attachment ? 4 : 0,
            }}
          >
            <Text className="font-body-md text-body-md text-on-primary">{message.text}</Text>
          </View>
        ) : null}

        {/* Attachment card */}
        {message.kind === "attachment" && message.attachment ? (
          <View
            className="bg-primary"
            style={{
              borderRadius: 12,
              padding: 12,
            }}
          >
            {/* The card's fill and border were `rgba(255,255,255,0.12)` and
                `rgba(255,255,255,0.2)` — white washes that only read as "a
                lighter patch of the accent" while the accent is dark. In dark
                mode the bubble is pale teal and a white wash disappears into it.
                `on-primary` at the same alphas inverts with the bubble.

                Two off-scale numbers came along with the classes, both moving to
                the nearest real step: the row `gap` 10 -> 8 (BRAND's scale is
                4/8/12/…) and the icon tile's radius 10 -> 12. Padding 12 and the
                card's own radius 12 were already on-scale and are unchanged. */}
            <View className="flex-row items-center gap-base rounded-md border border-on-primary/20 bg-on-primary/12 p-3">
              <View className="h-10 w-10 items-center justify-center rounded-md bg-on-primary/20">
                <Icon chrome={message.attachment.icon} size={22} color={onPrimary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* 14/600 is exactly `label-md`, so the inline pair becomes the
                    token that already means it. */}
                <Text
                  className="font-label-md text-label-md text-on-primary"
                  numberOfLines={1}
                >
                  {message.attachment.name}
                </Text>
                {/* …and 12 is exactly `label-sm`. */}
                <Text
                  className="font-label-sm text-label-sm text-on-primary/75"
                  style={{ marginTop: 2 }}
                >
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
                <Icon chrome="download" size={20} color={onPrimaryMuted} />
              )}
            </View>
          </View>
        ) : null}

        {/* Timestamp + delivery status */}
        <View
          className="mt-xs flex-row items-center justify-end gap-xs"
          style={{ paddingRight: 4 }}
        >
          {/* Was 11px — under BRAND's 12sp floor — at a frozen `#6d7a77`. */}
          {/* `Meta / Timestamp` — `label-sm` on `on-surface-variant` per
              552:1403's variables. `outline` is a hairline role, not a text
              role, and at 12sp it was the weakest text on the screen. */}
          <Text className="font-label-sm text-label-sm text-on-surface-variant">
            {message.timestamp}
          </Text>
          {message.delivered ? <Icon chrome="done-all" size={14} color={primary} /> : null}
        </View>
      </View>
    </View>
  );
}

/**
 * `Message / … — request` 552:1403 and its siblings.
 *
 * THE INCOMING BUBBLE IS A CARD, NOT A GREY BLOB. The comp filled it with
 * `surface-container-highest` and gave it no edge; 552:1403 binds
 * `card-surface` with an `outline-variant` hairline at `radius/12` — the same
 * treatment `<Card>` carries, which is why the two read as one system in the
 * frame and did not in the app. A fill-only bubble also has no edge at all in
 * dark mode, where `surface-container-highest` sits a step from the page.
 *
 * The vitals message (552:1428) takes the SAME surface at full width, which is
 * the resolution of the flag VitalStatCard's migration left open — see below.
 */
const INCOMING_BUBBLE = "rounded-md border border-outline-variant bg-card-surface px-4 py-3";

function IncomingBubble({ message, contactName }: { message: ChatMessage; contactName: string }) {
  if (message.kind === "vitals" && message.vitals) {
    return (
      <View className="mb-sm w-full items-start">
        {/* 552:1428 draws the vitals message at the FULL content width (361 of
            361), not at the 88% a bubble takes, because two stat cards side by
            side do not fit in a bubble. */}
        <View className="w-full">
          {message.text ? (
            <View className={`${INCOMING_BUBBLE} mb-xs self-start`} style={{ maxWidth: "88%" }}>
              <Text className="font-body-md text-body-md text-on-surface">{message.text}</Text>
            </View>
          ) : null}

          <VitalsCard vitals={message.vitals} />

          <Text
            className="font-label-sm text-label-sm text-on-surface-variant"
            style={{ marginTop: 4, marginLeft: 4 }}
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
        <View className={INCOMING_BUBBLE}>
          {message.text ? (
            <Text className="font-body-md text-body-md text-on-surface">{message.text}</Text>
          ) : null}
        </View>
        <Text
          className="font-label-sm text-label-sm text-on-surface-variant"
          style={{ marginTop: 4, marginLeft: 4 }}
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

/**
 * `Message / … — vitals` 552:1428 — and the resolution of the flag the
 * VitalStatCard migration left open.
 *
 * THAT FLAG READ: "211:241 / VitalStatCard binds its fill to the `card-surface`
 * ROLE and exposes no `className`/`style`, deliberately, so a screen cannot
 * express a private variant of a clinical reading. The local copy was a
 * TRANSLUCENT WHITE tile ON an accent surface… it needs a designer call: either
 * 211:241 gains an `OnAccent` tone, or this message stops being teal and becomes
 * a normal incoming bubble."
 *
 * THE FRAME ANSWERS: the second one. 552:1428 is a plain `Card` — `card-surface`,
 * `elevation/card`, radius/24, 16 inset — carrying a `Header` instance, two
 * `VitalStatCard`s and a plain-text `Note`. There is no teal panel, so there is
 * no on-accent problem to solve and 211:241 does NOT need an `OnAccent` tone.
 *
 * What that deletes: `bg-primary` on the panel, the `on-primary/15`+`/10`
 * washed note box, and the `on-primary/80` uppercase caption — three treatments
 * that only existed to survive the teal.
 *
 * The header is the shared `SectionHeader` (756:4413), which is what 0:44 is an
 * instance of. The note is `body-md` on `on-surface-variant`: 0:83 is a text
 * node, not a box.
 */
function VitalsCard({ vitals }: { vitals: NonNullable<ChatMessage["vitals"]> }) {
  return (
    <Card style={{ gap: 12 }}>
      <SectionHeader title="Vitals summary" icon="heart-rate" />

      {/* 2-up stat grid — the shared VitalStatCard (Figma 211:241), which is
          what 0:51 / 0:67 instance. Deletes the local `VitalStat`, one of six
          private copies: it drew the value at 18px/700 (the ramp has no 18 step;
          211:247 is `headline-lg` 24) and the label at 11px, BELOW BRAND's 12sp
          floor, and carried seven literals. */}
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

      <Text className="font-body-md text-body-md text-on-surface-variant">{vitals.note}</Text>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline divider
// ---------------------------------------------------------------------------

function TimelineDivider({ label }: { label: string }) {
  return (
    <View className="my-sm flex-row items-center gap-sm">
      <View className="h-px flex-1 bg-surface-container-highest" style={{ opacity: 0.7 }} />
      {/* Was 11px at `#6d7a77` on an `#f0f5f3` chip — a size under BRAND's 12sp
          floor on two frozen light-mode fills. `surface-container-low` is the
          token `#f0f5f3` was approximating (240,245,242, a 1/255 blue shift), and
          it darkens to #171D1C in dark mode where the literal did not. Vertical
          padding 3 -> 4 puts it on the spacing scale; `rounded-full` replaces the
          99 that was standing in for it. */}
      <Text className="rounded-full bg-surface-container-low px-base py-xs font-label-sm text-label-sm text-outline">
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
