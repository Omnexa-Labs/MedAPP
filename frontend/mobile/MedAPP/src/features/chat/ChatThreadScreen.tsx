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
// RESOLVED 2026-08-06 — THE FRAME WAS WRONG, AND IT HAS BEEN CORRECTED
// ---------------------------------------------------------------------------
// This header used to say "the frame and this screen are not the same
// conversation" and park the question. The PO has now ruled, and the ruling was
// that 552:1376 WAS WRONG: it drew a clinician group room — "ICU Night Shift",
// "8 members - 3 online now", per-message senders, shift/join events — on the
// route that serves the patient's 1:1 with their doctor.
//
// What changed in Figma (docs/PIPELINE.md 5w):
//   * 552:1376 is now the patient 1:1. Its thread was rewritten; it had been
//     clinician handover talk about "Patient-8821", i.e. the patient reading
//     about themselves in the third person.
//   * The group design was RECOVERED, not discarded, as `practitioner_chat`
//     1057:1448 (+ dark proof 1059:17684) on the Practitioner Shell page.
//   * `Chat Bubble / Other` 550:2013 shipped an invented "Dr. Sarah Chen" as the
//     DEFAULT of its Sender property — corrected to the seeded roster. That was
//     the third instance of the invented-name defect.
//
// ONE COMPONENT SERVES BOTH THREADS. See ChatThreadScreenProps below: the two
// are the same anatomy and differ in data plus three strings, so the group-ness
// is DATA (`ChatMessage.senderName`, `kind: "system"`) rather than a mode flag.
// PractitionerChatScreen.tsx is the thin caller.
//
// CORRECTION 2026-08-06: this header previously said "there are no messaging
// endpoints AT ALL", repeating docs/PIPELINE.md's inert-control audit. THAT WAS
// WRONG — `inbox_service` ships the full thread API and GET /v1/threads/:id
// already exists. See ./api.ts. This screen is still on seed data because it
// has not been migrated yet, which is a TODO, not a blocker.
//
// What inbox_service genuinely does NOT model, and so must stay seeded:
//   1. PRESENCE ("3 online now"). `is_active` is membership, not connectivity.
//   2. `SystemEvent / joined` rows — a participant has `joined_at`, but there
//      is no event stream to build a timeline row from.
//   3. Delivery receipts. `last_read_at` gives READ, not "delivered".
//   4. ~~Attachments~~ CLOSED 2026-08-08. Three routes shipped and this screen
//      now uses them — see VOICE NOTES below. Every "there is no upload
//      endpoint" claim that survived elsewhere in this file has been corrected;
//      if you find another, it is stale.
//
// ~~KEPT DESPITE BEING ABSENT FROM THE FRAME~~ REVERSED 2026-08-07. That keep
// argued the Clinical Actions FAB and its share menu were "the only route to
// sharing clinical data into a thread and they work". They did not work: each
// row called `send("[Shared: Medical History]")`, i.e. it put a square-bracketed
// English sentence in the message body and attached nothing. A clinician reading
// that thread sees a claim that a record was shared, and no record. The wire has
// no attachment concept at all (`ThreadMessageCreate` is `{ body }`), so there is
// nothing to attach it to — the menu and the FAB are removed.
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
// ---------------------------------------------------------------------------
// VOICE NOTES (2026-08-08) — the upload exists, and this screen owns it
// ---------------------------------------------------------------------------
// This block used to read "There is NO upload — this project has no endpoint
// that accepts composer media". `inbox_service` shipped three attachment routes
// and the composer is wired to them. Figma: `voice_note — 1..9` on the Messaging
// page (548:615), each with a DARK proof directly beneath it.
//
// THE PIPELINE, and where each part lives:
//   ./useComposerMedia    capture, permissions, the 8 MiB and four-hour limits,
//                         the local file. Shared with AiAssistantScreen, which
//                         has no thread — which is why it does not upload.
//   ./VoiceNoteComposer   the mic (hold AND tap), the recording bar, the review
//                         bar. Drawn INSIDE the pill, replacing the field.
//   ./VoiceNoteAudio      playback, the waveform, the play/pause target.
//   HERE                  upload -> attach -> send, as ONE mutation, so there is
//                         one status and one Retry.
//
// TWO RULES THIS SCREEN'S HISTORY EXISTS TO PROTECT, restated because audio is
// where they are easiest to break:
//
//   • NOTHING RENDERS AS "sent" UNTIL `POST /messages` RETURNS A ROW. Not when
//     the upload 201s. A staged attachment is not a delivered message, and an
//     optimistic tick is the defect item 3 below is about.
//   • A FAILURE KEEPS THE RECORDING. The local `file://` uri survives a
//     successful upload and a failed one, so a failed voice note is still
//     playable and Retry re-sends the same audio. The alternative is telling a
//     patient to say it all again.
//
// Accessibility: hold-to-record is inoperable under Switch Control and under a
// screen reader, so the mic carries a tap path as an equal — and the tap path
// starts the recording LOCKED, landing in the same state a slide-up reaches.
// ./VoiceNoteComposer's header has the full argument.
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
// ---------------------------------------------------------------------------
// PATIENT-SAFETY PASS 2026-08-07 — five things this screen asserted and could not
// ---------------------------------------------------------------------------
// Every item below rendered clinical content, or a guarantee about clinical
// content, that no part of the system stood behind. They are listed because each
// one shipped past a green suite: the old cases asserted LAYOUT, and a fabricated
// bubble lays out exactly like a real one.
//
//   1. THE CANNED REPLY IS DELETED, not gated. A `setTimeout` after every send
//      appended an INCOMING bubble — "Understood. I'll review that and get back
//      to you shortly" — attributed by the app bar to the named clinician, on
//      EVERY thread including a live one. A patient could stand down on a
//      symptom because of it. It was reviewed for a `seedMode` prop instead and
//      the answer was that no caller genuinely needs it: PractitionerChatScreen
//      is a design demo of a room, and a fabricated care-team reply is the same
//      defect wearing a different name. There is nothing left to gate.
//
//   2. SEEDS NEVER RENDER ON A LIVE THREAD. `messages` used to initialise to
//      SEED_MESSAGES and the error branch returned `null`, so six invented
//      messages — including "Continue as prescribed for now" and a 122/80 vitals
//      card drawn through the real clinical VitalStatCard — showed during load
//      and then PERMANENTLY under a "Couldn't load this conversation" banner.
//      The transcript is now derived, not stored: `baseMessages` is the server's
//      rows when there is a `threadId` and the seed only when there is not.
//
//   3. `delivered: true` IS GONE. It was a literal, set before the mutation
//      resolved and set even when no mutation fired — so a message that was
//      never POSTed at all (an attachment-only send, any send without a
//      `threadId`) rendered a green double tick. ./api.ts is explicit that the
//      service reports READ and never "delivered", so the tick can only ever
//      mean "the server accepted it". `ChatMessage.status` carries that, and
//      nothing else claims it.
//
//   4. A FAILED SEND IS VISIBLE AND RETRYABLE. The mutation had no `onError`:
//      a failure produced no toast, no failed state and no way to try again.
//
//   5. THE OPTIMISTIC BUBBLE STOPS FLICKERING. `onSettled` invalidated, the
//      refetch produced new `liveMessages`, and an effect replaced `messages`
//      wholesale — discarding the bubble the user had just watched appear. The
//      outbox below is a SEPARATE list, retired per-entry only once the server
//      row carrying its id is actually in the transcript.
//
// Also removed, both for the same reason — a control that cannot do what it
// says: the video-call button (no telehealth signalling exists anywhere in this
// product) and the Clinical Actions FAB and its share menu, whose rows sent the
// literal string "[Shared: Medical History]" and attached no clinical data at
// all. `ThreadMessageCreate` is `{ body }`; there is no payload to attach.
//
// POLLING: there is no socket and no SSE, so a reply was invisible until the
// user backed out and re-entered. The transcript query polls every 10s WHILE
// FOCUSED (`useIsFocused`) and not at all otherwise.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding expo-* APIs.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useIsFocused, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/use-current-user";
import { chatApi, type ThreadMessage } from "./api";
import { Toast, useToast } from "@/components/feedback";
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
import { blendTokens, useTokenColor } from "@/lib/tokens";
import { useResolvedScheme } from "@/lib/theme";
import { ComposerMediaTray } from "./ComposerMediaTray";
import { useComposerMedia } from "./useComposerMedia";
import { VoiceMicButton, VoiceRecordingBar, VoiceReviewBar } from "./VoiceNoteComposer";
import {
  VoiceNoteBubbleBody,
  VoicePlayButton,
  VoiceWaveform,
  useRemoteVoiceNoteSource,
  useVoiceNotePlayback,
} from "./VoiceNoteAudio";

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
// `isOnline` is NOT a member of this table any more. It used to be `true` here
// and was read unconditionally, so every live thread drew a green "Online" dot
// beside whoever the inbox had named — a presence claim about a clinician that
// nothing in the product can source. ./api.ts: `ThreadParticipantOut.is_active`
// is MEMBERSHIP, not connectivity. Presence is now a prop, defaulting to false.
const SEED_CONTACT = {
  name: "Dr. Adjoa Boateng",
  role: "Cardiologist",
  avatarUri:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDeJpe2eyE7VBbPwXD7m2u2so2Q3OUNPtsrGrSFmYPgs-ebEdihstJSB8oCR4b47ByY3B_O0tXJvybxrQFcMdbXyy9xqS7U_kZ8nFPNvIRhmjvEdFwtFcHJV0XGrYK9jh0GeoJZ1vPacpmlGzjtsCd5RCBzska_0hXM0ZEU9ysDTcXuwGisPFsqxaJkEiaMkAZ9kics4W18HE6lSAYeAoyEI8J_niTdEBQuVwViQn55GrLPUW-D2piEuATB6NuuoRLh-IK3SrUgmo-b",
};

// ---------------------------------------------------------------------------
// Message model
// ---------------------------------------------------------------------------

type MessageDirection = "incoming" | "outgoing";
// "system" is a thread EVENT, not a message: "Nii Tetteh joined the shift".
// It exists for the practitioner care-team room (1057:1448), where people enter
// and leave. A 1:1 never produces one, so the patient thread simply has none in
// its seed rather than needing a flag to suppress them.
type MessageKind = "text" | "attachment" | "vitals" | "system";

export interface ChatMessage {
  id: string;
  direction: MessageDirection;
  kind: MessageKind;
  text?: string;
  timestamp: string;
  /**
   * Who sent it, rendered above the bubble. Set only in a GROUP thread — in a
   * 1:1 the app bar already names the other party, so it would be the same name
   * repeated down the page.
   *
   * Deliberately a property of the MESSAGE rather than a `variant` prop on the
   * screen: it is the data that differs between the two threads, not the
   * rendering, and `AccountMenu` is the precedent for parameterising one
   * component over shipping a second copy of it.
   */
  senderName?: string;
  /**
   * Outgoing only. The SEND lifecycle of a message this device composed —
   * replacing a `delivered?: boolean` that was written as the literal `true` on
   * every locally-appended bubble, before the request resolved and also when no
   * request had been made at all.
   *
   * The vocabulary is deliberately narrower than a chat app's usual one, because
   * the service is: ./api.ts reports READ (`last_read_at`) and never
   * "delivered", so the strongest true statement available is "the server
   * accepted it" — `"sent"`. Nothing here means the clinician received it, and
   * nothing draws a tick until the POST has returned.
   *
   * `"local"` is the honest state for a message that is NOT being transmitted.
   * Since the attachment routes shipped that is ONE case, not two: a send on a
   * route with no `threadId` behind it. An attachment is transmitted now.
   */
  status?: "sending" | "sent" | "failed" | "local";
  // kind === "attachment"
  attachment?: {
    name: string;
    meta: string; // e.g. "PDF · 2.4 MB"
    icon: IconName;
    /**
     * Set while the media is still on this device: a send in flight, a send that
     * failed, or a send on a route with no thread behind it. A DEVICE-LOCAL
     * `file://` path — never a server url, because there is no attachment url on
     * the wire at all (see ./api).
     *
     * It is NOT cleared once the upload succeeds. The local copy is the same
     * audio, needs no request to play, and is the only copy a failed upload
     * leaves behind — which is what makes a failed voice note recoverable rather
     * than a bubble the user can look at and nothing else.
     */
    localUri?: string;
    /**
     * `attachment_id` once the upload has returned one. Its presence is the ONLY
     * evidence the server holds this file, and it is what the content path is
     * composed from.
     */
    serverAttachmentId?: string;
    /**
     * A voice note rather than a document, so the bubble draws a player instead
     * of a file card. Set from `duration_ms` on the wire and from the capture's
     * measured length locally.
     */
    voiceDurationMs?: number;
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

/**
 * One message this device composed, held OUTSIDE the transcript until the server
 * has a row for it.
 *
 * `body` is what would be POSTed — null-ish (empty) for a send that transmits
 * nothing, which is what makes `retry` refuse to "retry" a message that was
 * never on its way anywhere.
 */
interface OutboxEntry {
  message: ChatMessage;
  body: string;
  /** The id the service assigned. Set on success; the retirement key. */
  serverId?: string;
  /**
   * The local media this entry is sending, kept so `retry` can re-upload the
   * SAME file. Without it a failed voice note could only be re-recorded, and the
   * recording the patient already made would be the thing they lost.
   */
  upload?: { uri: string; name: string; mimeType: string; durationMs?: number };
  /**
   * Set once the upload has returned. Retrying a send whose upload already
   * succeeded must NOT upload again — the second staged attachment would be an
   * orphan row and an orphan file, and nothing in the product reaps those
   * (docs/api/inbox_service.md, "Reaping staged attachments — not built").
   */
  attachmentId?: string;
}

// ---------------------------------------------------------------------------
// Seed conversation — mirrors Stitch comp.
//
// RENDERED ONLY WHEN THERE IS NO `threadId`. See the PATIENT-SAFETY block at the
// top: these six messages used to be this screen's INITIAL state on every route,
// so a patient opening a real conversation read invented clinical instructions
// ("Continue as prescribed for now") and an invented 122/80 reading while the
// transcript loaded — and kept reading them, permanently, if it failed.
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
    status: "sent",
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
    status: "sent",
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

// `CLINICAL_ACTIONS` and `CANNED_REPLY` used to live here. Both are deleted
// rather than moved behind a flag — see the PATIENT-SAFETY block at the top.

let nextId = 200;
function makeId() {
  nextId += 1;
  return `ct${nextId}`;
}

/** How often an OPEN thread re-reads its transcript. Nothing pushes to it. */
const THREAD_POLL_MS = 10_000;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/**
 * Both threads render through this one component.
 *
 * The practitioner care-team room (Figma 1057:1448) and the patient 1:1
 * (552:1376) are the SAME anatomy — app bar, day divider, bubbles, attachment
 * cards, a vitals card, the docked composer — differing only in their data and
 * three strings. Shipping a second screen would mean a second composer, a
 * second media hook wiring and a second set of bubble rules to keep in step,
 * which is exactly the argument `AccountMenu` makes for being parameterised
 * rather than copied for its second audience.
 *
 * Everything here defaults to the PATIENT behaviour, so the existing route and
 * its suite are unchanged by the practitioner variant existing.
 */
export interface ChatThreadScreenProps {
  /** Overrides the app bar title. Defaults to the contact's name. */
  threadTitle?: string;
  /** Overrides the app bar subtitle. Defaults to `Doctor · <role>`. */
  threadSubtitle?: string;
  /** `DayDivider` label. "Today" for a 1:1, "Shift started · 19:00" for a room. */
  dividerLabel?: string;
  /** Composer placeholder. "Message the care team…" in the room. */
  composerPlaceholder?: string;
  /** Seeded thread contents. */
  seedMessages?: ChatMessage[];
  /**
   * A room rather than a person: renders a group glyph instead of an avatar and
   * drops the presence dot, which belongs to one identity.
   */
  isGroup?: boolean;
  /**
   * Render `is_internal` messages — clinician-only notes.
   *
   * DEFAULTS TO FALSE, and that default is the safeguard: `is_internal` is a
   * note clinicians write about a patient, and leaking one into the patient's
   * own thread is a privacy incident, not a cosmetic bug. A caller has to ask
   * for them explicitly.
   */
  showInternalNotes?: boolean;
  /**
   * Draw the presence dot beside the avatar.
   *
   * DEFAULTS TO FALSE, and the default is the point. This used to be read off
   * `SEED_CONTACT.isOnline: true` with no way to override it, so every live
   * thread asserted that the clinician was online right now. Nothing in
   * inbox_service models connectivity (./api.ts), so until something does, no
   * caller can truthfully pass `true` and none does.
   */
  isOnline?: boolean;
}

export function ChatThreadScreen({
  threadTitle,
  threadSubtitle,
  dividerLabel = "Today",
  composerPlaceholder = "Type a message…",
  seedMessages = SEED_MESSAGES,
  isGroup = false,
  showInternalNotes = false,
  isOnline = false,
}: ChatThreadScreenProps = {}) {
  // Accept lightweight params from the navigation call for personalisation.
  const params = useLocalSearchParams<{
    name?: string;
    role?: string;
    avatar?: string;
    /** Real inbox_service thread id, pushed by InboxScreen. */
    threadId?: string;
  }>();

  // ---------------------------------------------------------------------
  // LIVE THREAD, when we were given one
  // ---------------------------------------------------------------------
  // `threadId` arrives from InboxScreen. Without it — PractitionerChatScreen,
  // the profile "Message" button — the screen keeps its seeded behaviour rather
  // than firing a request for a thread that does not exist.
  const threadId = params.threadId;
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  // Polling is the only way a reply arrives (no socket, no SSE), and it must
  // stop when the screen is not on top — a background thread re-reading a
  // clinical transcript every ten seconds is battery and audit-log noise.
  const isFocused = useIsFocused();

  const {
    data: wireMessages,
    isPending: threadPending,
    isError: threadError,
  } = useQuery({
    queryKey: ["thread", threadId, "messages"],
    queryFn: () => chatApi.listMessages(threadId as string),
    enabled: Boolean(threadId),
    refetchInterval: isFocused ? THREAD_POLL_MS : false,
  });

  // `GET /v1/threads/:id`. It has existed since inbox_service shipped and was
  // never called, which is why the app bar of every live thread read
  // "Doctor · Cardiologist" over a stock photo: the screen fell back to
  // SEED_CONTACT for the role no matter whose conversation it was.
  const { data: thread } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => chatApi.getThread(threadId as string),
    enabled: Boolean(threadId),
  });

  // The identity in the app bar. On a live thread it comes from the SERVICE, and
  // where the service has nothing (it names no counterparty and carries no
  // photo — see InboxScreen's `toConversation`) the slot is empty rather than
  // filled from the seed.
  const contact = {
    name: threadId
      ? (thread?.subject ?? params.name ?? "Conversation")
      : (params.name ?? SEED_CONTACT.name),
    // No stock photo on a live thread. `ThreadOut` names no counterparty and
    // carries no image, so the leading slot falls through to the initials plate
    // instead of showing a stranger's face over someone's clinician.
    avatarUri: params.avatar ?? (threadId ? undefined : SEED_CONTACT.avatarUri),
    isOnline,
  };

  // `assigned_role` is the ONLY role on the wire, and it is nullable. When there
  // is none the subtitle is omitted — the line used to read
  // `Doctor · ${contact.role}` with `role` falling back to the seed's
  // "Cardiologist", so every live thread announced a cardiologist regardless of
  // who it was with.
  const defaultSubtitle = threadId
    ? (thread?.assignedRole ? formatRole(thread.assignedRole) : undefined)
    : `Doctor · ${params.role ?? SEED_CONTACT.role}`;

  // Wire -> the bubble model. Direction is resolved against the SIGNED-IN user
  // id, not against a role string: a clinician reading a clinician's thread
  // must still see their own messages on the right.
  const liveMessages: ChatMessage[] | null = useMemo(() => {
    if (!threadId || !wireMessages) return null;
    return wireMessages
      // `is_internal` is a clinician-only note. Excluded unless the caller
      // explicitly opted in — see `showInternalNotes`.
      .filter((m: ThreadMessage) => showInternalNotes || !m.isInternal)
      .map((m: ThreadMessage): ChatMessage => {
        const mine = Boolean(currentUser?.id) && m.senderUserId === currentUser?.id;
        // The composer's slot is single, so a message from THIS app carries at
        // most one attachment — but the schema allows eight and another client
        // may send them, so the first is rendered and the rest are ignored rather
        // than crashing the transcript. A partial render of a clinical thread
        // beats a blank one.
        // `?.` on a field the mapper always populates: a transcript is clinical
        // content, and a message shape that predates this key — an older row, a
        // fixture, a stubbed client — must render without the attachment rather
        // than take the whole thread down.
        const attachment = m.attachments?.[0];
        const isVoice = Boolean(attachment && attachment.durationMs !== null);
        return {
          id: m.id,
          direction: mine ? "outgoing" : "incoming",
          kind: attachment ? "attachment" : "text",
          // `undefined`, not "": the server sends `body: ""` for a voice note
          // with no typed text, and the bubbles skip the text block on a falsy
          // value rather than drawing an empty one.
          text: m.body || undefined,
          attachment: attachment
            ? {
                name: isVoice ? "Voice note" : attachment.originalFilename,
                meta: describeServerAttachment(attachment.contentType, attachment.byteSize),
                icon: isVoice ? "mic" : "description",
                serverAttachmentId: attachment.id,
                voiceDurationMs: attachment.durationMs ?? undefined,
              }
            : undefined,
          timestamp: new Date(m.createdAtIso).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          // Attribution only in a group, and only from the wire's role — the
          // service carries no display name for a sender.
          senderName: !mine && isGroup ? m.senderRole : undefined,
          // A row that came BACK from the server is, by definition, accepted.
          status: mine ? "sent" : undefined,
        };
      });
  }, [threadId, wireMessages, showInternalNotes, currentUser?.id, isGroup]);

  // ---------------------------------------------------------------------
  // The transcript is DERIVED, never stored
  // ---------------------------------------------------------------------
  // It used to be `useState(seedMessages)` plus an effect that replaced it
  // wholesale whenever the query returned. That produced the two defects the
  // header lists: seeds rendered on a live thread until the first response (and
  // for ever if it failed), and the optimistic bubble was thrown away by the
  // `onSettled` refetch a moment after the user watched it appear.
  //
  // Now the server's rows are the base and locally-composed messages live in a
  // separate `outbox`, each retired only when the transcript actually contains
  // the id the server gave it. Nothing can wipe a bubble that has not landed.
  const baseMessages = threadId ? (liveMessages ?? []) : seedMessages;
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const messages = useMemo(
    () => [...baseMessages, ...outbox.map((e) => e.message)],
    [baseMessages, outbox],
  );

  useEffect(() => {
    if (!liveMessages) return;
    const landed = new Set(liveMessages.map((m) => m.id));
    setOutbox((prev) => prev.filter((e) => !(e.serverId && landed.has(e.serverId))));
  }, [liveMessages]);

  // Mark read on open. Fire-and-forget: a failure here must never block reading
  // the thread, and the unread badge is not rendered from this response.
  useEffect(() => {
    if (!threadId) return;
    void chatApi.markRead(threadId).catch(() => {});
  }, [threadId]);

  const toast = useToast();

  const patchEntry = useCallback(
    (
      localId: string,
      patch: {
        serverId?: string;
        attachmentId?: string;
        // A PARTIAL of the attachment, merged rather than replaced — the upload
        // learns the server id and must not drop the local uri, which is what
        // keeps a failed voice note playable.
        message?: Partial<Omit<ChatMessage, "attachment">> & {
          attachment?: Partial<NonNullable<ChatMessage["attachment"]>>;
        };
      },
    ) => {
      setOutbox((prev) =>
        prev.map((e) => {
          if (e.message.id !== localId) return e;
          const { attachment: attachmentPatch, ...messagePatch } = patch.message ?? {};
          return {
            ...e,
            serverId: patch.serverId ?? e.serverId,
            attachmentId: patch.attachmentId ?? e.attachmentId,
            message: {
              ...e.message,
              ...messagePatch,
              attachment: e.message.attachment
                ? { ...e.message.attachment, ...(attachmentPatch ?? {}) }
                : e.message.attachment,
            },
          };
        }),
      );
    },
    [],
  );

  // ---------------------------------------------------------------------
  // SEND — and, when there is media, UPLOAD FIRST
  // ---------------------------------------------------------------------
  // Two calls, in order, inside ONE mutation, so there is one `status` for the
  // user to read and one Retry to press. The alternative — an upload mutation
  // feeding a send mutation — gives a bubble that can be "uploaded but not sent",
  // a state nobody can act on.
  //
  // NOTHING RENDERS AS SENT UNTIL `sendMessage` RETURNS A ROW. Not when the
  // upload succeeds, not optimistically. An optimistic delivered tick is the
  // defect this file's history is mostly about, and audio does not get an
  // exemption from it.
  const sendMutation = useMutation({
    // The upload rides in the VARIABLES, not read back out of `outbox`. It was
    // read from a ref for one revision, and the ref is a render behind the
    // `setOutbox` that `send()` performs immediately before `mutate()` — so the
    // first send of every voice note uploaded nothing and posted a body-only
    // message. Both callers already hold what this needs.
    mutationFn: async (vars: {
      localId: string;
      body: string;
      upload?: OutboxEntry["upload"];
      /** Set on a retry whose upload already succeeded. */
      attachmentId?: string;
    }) => {
      let attachmentId = vars.attachmentId;
      // Upload only if it has not already succeeded — a retry after a failed
      // SEND must not stage a second copy. See `OutboxEntry.attachmentId`.
      if (vars.upload && !attachmentId) {
        const uploaded = await chatApi.uploadAttachment(threadId as string, vars.upload);
        attachmentId = uploaded.id;
        // Recorded before the send is attempted, so a send that fails leaves the
        // staged id behind for the retry instead of orphaning it.
        patchEntry(vars.localId, {
          attachmentId,
          message: { attachment: { serverAttachmentId: attachmentId } },
        });
      }
      // TWO ARGUMENTS when there is nothing attached, not three with an
      // `undefined`. A trailing undefined is invisible in the request and very
      // visible in every existing assertion about this call — and the point of
      // the body-only path is that it did not change.
      return attachmentId
        ? chatApi.sendMessage(threadId as string, vars.body, [attachmentId])
        : chatApi.sendMessage(threadId as string, vars.body);
    },
    onSuccess: (created, vars) => {
      // "sent" means EXACTLY what the wire supports: the server accepted it. The
      // server id is recorded so the effect above can retire this bubble once
      // the refetched transcript carries the real row, instead of both showing.
      patchEntry(vars.localId, { serverId: created.id, message: { status: "sent" } });
    },
    // The mutation had NO error handler at all, so a send that failed looked
    // exactly like one that worked. An upload failure lands here too, which is
    // why the copy names neither step — the user's move is the same either way.
    onError: (_err, vars) => {
      patchEntry(vars.localId, { message: { status: "failed" } });
      toast.show("error", "Not sent. Tap Retry on the message.");
    },
    // Refetch rather than trust the optimistic row: the server assigns the id
    // and timestamp, and a divergence between them is how duplicate bubbles
    // appear after a retry.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId, "messages"] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });
  const [draft, setDraft] = useState("");
  // Attach + mic. See the COMPOSER MEDIA block in the header.
  const media = useComposerMedia();
  // The bar's action glyphs, resolved by token name for the current mode.
  const primary = useTokenColor("primary");
  const mutedGlyph = useTokenColor("on-surface-variant");
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

  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  // The guard used to be "no text, no send". An attachment-only message is a
  // legitimate send (a photo of a rash, a dictated note), so EITHER a non-empty
  // draft OR a pending attachment now qualifies.
  const send = (text: string) => {
    const trimmed = text.trim();
    const pending = media.attachment;
    if (!trimmed && !pending) return;

    // WHAT IS ACTUALLY TRANSMITTED, stated once so the bubble can be honest
    // about it. `body` may be `""` when an attachment is present — a voice note
    // needs no typed text — so the condition is "either", not "text". With no
    // `threadId` there is still no conversation to post to, which is the one
    // remaining case that transmits nothing.
    const transmits = Boolean(threadId && (trimmed || pending));
    const localId = makeId();
    const isVoice = pending?.kind === "recording";
    const upload: OutboxEntry["upload"] = pending
      ? {
          uri: pending.uri,
          // A capture has no filename. `voice-note.m4a` is DISPLAY-ONLY on the
          // server too — the storage key is `<thread>/<random>.bin` and no part
          // of this string reaches the filesystem.
          name: isVoice ? "voice-note.m4a" : pending.name,
          mimeType: pending.mimeType ?? "application/octet-stream",
          // Only for audio. A PDF has no duration and the server types the field
          // as nullable for exactly that reason.
          durationMs: isVoice ? pending.durationMillis : undefined,
        }
      : undefined;

    setOutbox((prev) => [
      ...prev,
      {
        body: trimmed,
        upload,
        message: {
          id: localId,
          direction: "outgoing",
          kind: pending ? "attachment" : "text",
          // `undefined`, not "": OutgoingBubble skips the text block entirely for
          // a falsy value, so an attachment-only message renders as just the card.
          text: trimmed || undefined,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          status: transmits ? "sending" : "local",
          attachment: pending
            ? {
                name: pending.name,
                meta: pending.meta,
                icon: isVoice ? "mic" : "description",
                localUri: pending.uri,
                voiceDurationMs: isVoice ? pending.durationMillis : undefined,
              }
            : undefined,
        },
      },
    ]);
    if (transmits) sendMutation.mutate({ localId, body: trimmed, upload });
    // Frees the composer slot WITHOUT reaping the file — the message above now
    // references its uri, and a failed upload has to be able to play it back.
    // (`clearAttachment` would delete a capture.)
    if (pending) media.consumeAttachment();
    setDraft("");
    scrollToEnd();
  };

  const retry = (localId: string) => {
    const entry = outbox.find((e) => e.message.id === localId);
    // `body || upload`, not `body`: a voice note is a legitimate send with an
    // empty body, so the old guard would have refused to retry the one kind of
    // message whose failure costs the user a recording. What is still refused is
    // an entry with NOTHING to transmit, and a send with no thread behind it.
    if (!entry || (!entry.body && !entry.upload) || !threadId) return;
    patchEntry(localId, { message: { status: "sending" } });
    // `attachmentId` carries a staged upload forward, so a retry after a failed
    // SEND does not stage a second copy of the same recording.
    sendMutation.mutate({
      localId,
      body: entry.body,
      upload: entry.upload,
      attachmentId: entry.attachmentId,
    });
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
      title={threadTitle ?? contact.name}
      subtitle={threadSubtitle ?? defaultSubtitle}
      claimsBottomInset={false}
      leading={
        <View className="relative shrink-0">
          {/* A room is not a person: no photo, and no presence dot, because
              presence belongs to one identity. */}
          {contact.avatarUri && !isGroup ? (
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
                {isGroup ? "#" : (threadTitle ?? contact.name)[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
          )}
          {contact.isOnline && !isGroup ? (
            <View
              className="absolute bottom-0 right-0 rounded-full border-2 border-surface bg-primary"
              style={{ width: 12, height: 12 }}
              accessibilityLabel="Online"
            />
          ) : null}
        </View>
      }
      // No `actions`. Both of the bar's trailing controls are gone and neither
      // is coming back as decoration:
      //
      //   "Conversation info"  removed earlier — it had no `onPress`, and
      //                        552:1376's bar does not draw it.
      //   "Video call"         removed here. Its body was a TODO reading "once
      //                        telehealth signalling service ships", and there
      //                        is no video transport anywhere in this product —
      //                        no signalling, no SDK, no route. On a doctor
      //                        thread a camera glyph is a promise that a patient
      //                        can escalate to a call, and they cannot.
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
          {/* A live thread that has not answered yet must not look like an
              empty conversation — on a medical thread "no messages" and "we
              could not load your messages" are very different claims. */}
          {threadId && threadPending ? (
            <View className="items-center py-2xl">
              <ActivityIndicator color={primary} />
            </View>
          ) : threadId && threadError ? (
            <View className="items-center gap-xs py-2xl">
              <Text className="font-label-md text-label-md text-on-surface">
                Couldn't load this conversation
              </Text>
              <Text className="text-center font-body-md text-body-md text-on-surface-variant">
                Pull back and open it again to retry.
              </Text>
            </View>
          ) : null}

          <TimelineDivider label={dividerLabel} />

          {messages.map((m) =>
            m.kind === "system" ? (
              <SystemEventRow key={m.id} label={m.text ?? ""} />
            ) : m.direction === "outgoing" ? (
              <OutgoingBubble
                key={m.id}
                message={m}
                threadId={threadId}
                onRetry={() => retry(m.id)}
              />
            ) : (
              <IncomingBubble
                key={m.id}
                message={m}
                threadId={threadId}
                contactName={contact.name}
              />
            ),
          )}
        </ScrollView>

        {/* The Clinical Actions FAB and its four-row share menu stood here.
              REMOVED — see the header. Each row called
              `send("[Shared: Medical History]")`: a square-bracketed English
              sentence in the message body, with no record, no link and no
              payload behind it, on a thread a clinician reads. The wire has no
              attachment concept to hang one on, so there was no honest version
              of the control to keep. Sharing a record into a thread needs an
              endpoint that accepts a reference; when one exists this comes back
              with it. */}

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
          {/* `showRecordingState={false}`: this composer draws recording and
              review INSIDE the pill (Figma `voice_note — 2..5`), so the tray is
              left with the notice and the picked-FILE chip only. Stacking both
              would show one capture twice. */}
          <ComposerMediaTray media={media} showRecordingState={false} />

          {/* `Composer / Chat (State=Empty, Docked=Yes)` 552:1512 — the SAME
              component instance the AI screen carries (550:2956), so the two
              composers stop being two different pills: a 52-tall `field-surface`
              rounded-full field holding three 44x44 targets with 24px glyphs and
              4px between them.

              What changed from the comp translation: `surface-container-low` ->
              `field-surface` (the role Input already uses, and the frame's
              `var(--color-field-surface)`), the `/30` hairline -> full strength,
              and the FOURTH control is gone — see the header. */}
          {/* THE PILL TAKES OVER while a voice note is being recorded or
              reviewed, rather than stacking a second bar above it — the WhatsApp
              idiom, and the question ComposerMediaTray's own FLAGGED FOR DESIGN
              note left open. It is answered by
              `voice_note — 2/3/4/5` on the Messaging page: the field is replaced
              in place, so the composer's geometry never moves and the mic stays
              under the finger that started the gesture.

              The pill's fill turns `error-container` only in the ARMED state,
              which is the one moment the control means "this will be destroyed".
              */}
          <View
            className={`mx-md h-[52px] flex-row items-center gap-xs rounded-full border p-xs ${
              media.isCancelArmed
                ? "border-error/40 bg-error-container"
                : "border-outline-variant bg-field-surface"
            }`}
          >
            {/* Attach and the text field give way to the recording / review bar.
                Not disabled-in-place: a greyed paperclip beside a running timer
                invites a tap that does nothing, where an absent one does not. */}
            {media.isRecording ? (
              <VoiceRecordingBar media={media} />
            ) : media.attachment?.kind === "recording" ? (
              <VoiceReviewBar media={media} />
            ) : (
              <>
                {/* Attach — was a Pressable with NO onPress at all. */}
                <ComposerIconButton
                  icon="attach-file"
                  label="Attach file"
                  onPress={() => void media.pickFile()}
                  disabled={media.isPicking}
                />

                {/* Text input */}
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={composerPlaceholder}
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
              </>
            )}

            {/* Mic — hold to record, or tap to start and tap to stop. BOTH, and
                ./VoiceNoteComposer explains at length why the tap path is not
                optional: hold-to-record is inoperable under Switch Control and
                under a screen reader, which consume the touch. Hidden only while
                reviewing, when the mic would re-record over the note the user is
                listening to. */}
            {media.attachment?.kind === "recording" && !media.isRecording ? null : (
              <VoiceMicButton media={media} />
            )}

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

        {/* A send that failed announces itself as well as marking the bubble.
            The failed bubble carries the retry (a toast is `pointerEvents:
            "none"` and cannot); this is the part a screen-reader user gets,
            via the alert role Toast already has. */}
        <Toast message={toast.message} tone={toast.tone} onDismiss={toast.clear} bottom={96} />
      </KeyboardInset>
    </DetailShell>
  );
}

/**
 * `assigned_role` -> a line a patient can read. The wire spells it as it is
 * stored (`"doctor"`, `"nurse"`), which is not a subtitle.
 */
function formatRole(role: string): string {
  const cleaned = role.replace(/[_-]+/g, " ").trim();
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : cleaned;
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

/**
 * A voice note is an attachment whose `voiceDurationMs` is set — which is the
 * client-side reading of `duration_ms`, the field the backend added for exactly
 * this: "persisted so the client can draw a player and scrubber without
 * downloading the file".
 */
function isVoiceNote(message: ChatMessage): boolean {
  return message.kind === "attachment" && message.attachment?.voiceDurationMs !== undefined;
}

/**
 * The attachment exists ONLY on this handset: this device captured or picked it,
 * and no upload has returned an id for it yet.
 *
 * Both halves are load-bearing — see the note at the call site. A seeded message
 * has neither field and is therefore NOT device-local, which is right: the seeds
 * stand in for attachments the server already holds.
 */
function isDeviceLocal(message: ChatMessage): boolean {
  const a = message.attachment;
  return Boolean(a?.localUri) && !a?.serverAttachmentId;
}

/**
 * The `meta` line for an attachment the SERVER described. A picked file's line
 * comes from `useComposerMedia.describeFile`; this is the same shape built from
 * `content_type` + `byte_size`, which is all the wire carries.
 */
function describeServerAttachment(contentType: string, byteSize: number): string {
  const subtype = contentType.split(";")[0].split("/").pop();
  const label = (subtype && subtype !== "octet-stream" ? subtype : "file").toUpperCase();
  const mb = byteSize / (1000 * 1000);
  const size = byteSize < 1000
    ? `${byteSize} B`
    : byteSize < 1000 * 1000
      ? `${Math.round(byteSize / 1000)} KB`
      : `${mb.toFixed(1)} MB`;
  return `${label} · ${size}`;
}

function OutgoingBubble({
  message,
  threadId,
  onRetry,
}: {
  message: ChatMessage;
  /** For the content path. Absent on the seeded route, where nothing is remote. */
  threadId?: string;
  onRetry?: () => void;
}) {
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

        {/* A VOICE NOTE IS A PLAYER, NOT A FILE CARD. A row reading
            "voice-note.m4a · 928 KB" with a download glyph is a correct
            description of a file and the wrong description of somebody talking.
            Figma `voice_note — 6/7` on the Messaging page. */}
        {isVoiceNote(message) && message.attachment ? (
          <View className="bg-primary" style={{ borderRadius: 12, padding: 12 }}>
            <VoiceNoteBubbleBody
              threadId={threadId}
              attachmentId={message.attachment.serverAttachmentId}
              localUri={message.attachment.localUri}
              durationMs={message.attachment.voiceDurationMs ?? null}
            />
          </View>
        ) : null}

        {/* Attachment card — documents and images. */}
        {message.kind === "attachment" && message.attachment && !isVoiceNote(message) ? (
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
                  {/* "on this device only" needs BOTH halves, and each one alone
                      is wrong. `localUri` alone was wrong because it survives a
                      successful upload — it is what a retry and playback use —
                      so every uploaded file would have announced itself unsent.
                      A missing `serverAttachmentId` alone is wrong because the
                      seeded messages have neither field and stand in for
                      already-uploaded attachments; keying on it made the seeded
                      Lab_Panel claim to be device-local. */}
                  {isDeviceLocal(message)
                    ? `${message.attachment.meta} · on this device only`
                    : message.attachment.meta}
                </Text>
              </View>
              {/* Suppressed for device-local media: there is nowhere to download
                  it FROM, and a control that cannot work is the exact defect this
                  change was opened to fix. */}
              {isDeviceLocal(message) ? null : (
                <Icon chrome="download" size={20} color={onPrimaryMuted} />
              )}
            </View>
          </View>
        ) : null}

        {/* Timestamp + SEND status.
            The tick used to render off `message.delivered`, a literal `true`
            written at compose time — so it appeared instantly, on messages that
            had not been POSTed and on messages that were about to fail. It now
            renders only for `"sent"`, which means the server returned a row.
            "Sending…", "Not sent" and the retry are the states that used to
            have no representation at all. */}
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
          {message.status === "sending" ? (
            <Text className="font-label-sm text-label-sm text-on-surface-variant">Sending…</Text>
          ) : null}
          {message.status === "sent" ? <Icon chrome="done-all" size={14} color={primary} /> : null}
          {message.status === "local" ? (
            // The one honest thing to say about a message the app is not
            // transmitting — which now only ever means a send on a route with no
            // thread behind it (PractitionerChatScreen, the profile "Message"
            // button). Attachments transmit.
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              Not sent — this conversation isn&apos;t connected
            </Text>
          ) : null}
          {message.status === "failed" ? (
            <>
              <Text className="font-label-sm text-label-sm text-error">Not sent</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry sending message"
                onPress={onRetry}
                hitSlop={12}
                className="active:opacity-70"
              >
                <Text className="font-label-sm text-label-sm text-primary">Retry</Text>
              </Pressable>
            </>
          ) : null}
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

function IncomingBubble({
  message,
  threadId,
  contactName,
}: {
  message: ChatMessage;
  threadId?: string;
  contactName: string;
}) {
  // Resolved by NAME so they step with the mode. The outgoing card's pair are
  // `on-primary` / `on-primary` at 75% because it sits on a `primary` fill; an
  // incoming card sits on `card-surface`, so it takes the on-surface pair.
  const incomingGlyph = useTokenColor("primary");
  const incomingGlyphMuted = useTokenColor("on-surface-variant");

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
        {/* `Sender` 550:2014, gated by the component's `Show sender` boolean.
            Present only when the message carries one, which is only ever in a
            group thread — see the note on `ChatMessage.senderName`. */}
        {message.senderName ? (
          <Text
            className="font-label-sm text-label-sm text-on-surface-variant"
            style={{ marginBottom: 4, marginLeft: 4 }}
          >
            {message.senderName}
          </Text>
        ) : null}

        <View className={INCOMING_BUBBLE}>
          {message.text ? (
            <Text className="font-body-md text-body-md text-on-surface">{message.text}</Text>
          ) : null}

          {/* INCOMING ATTACHMENTS HAD NO CARD AT ALL. Only OutgoingBubble
              rendered one, so a file sent BY the other party fell through to
              its text and the `attachment` payload was dropped silently — both
              552:1409 (the doctor's Lab_Panel) and 1057:1448 draw it. Same
              anatomy as the outgoing card, in incoming tokens: the outgoing one
              sits on `primary` and uses `on-primary` washes, so this uses
              `on-surface` washes over `card-surface` for the same contrast
              relationship in either mode. */}
          {/* A voice note FROM the other party. The composer cannot produce one
              on this side of a 1:1, but the schema and the transcript both
              carry it, and rendering a clinician's spoken reply as a file row
              with a download glyph would be the same mistake as outgoing. The
              player sits on `card-surface`, so it takes the on-surface pair
              rather than the bubble's `on-primary` washes. */}
          {isVoiceNote(message) && message.attachment ? (
            <View className={message.text ? "mt-sm" : ""}>
              <IncomingVoiceNote
                threadId={threadId}
                attachmentId={message.attachment.serverAttachmentId}
                durationMs={message.attachment.voiceDurationMs ?? null}
              />
            </View>
          ) : null}

          {message.kind === "attachment" && message.attachment && !isVoiceNote(message) ? (
            <View
              className={`flex-row items-center gap-base rounded-md border border-outline-variant bg-surface-container-low p-3 ${
                message.text ? "mt-sm" : ""
              }`}
            >
              <View className="h-10 w-10 items-center justify-center rounded-md bg-primary/12">
                <Icon chrome={message.attachment.icon} size={22} color={incomingGlyph} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-label-md text-label-md text-on-surface" numberOfLines={1}>
                  {message.attachment.name}
                </Text>
                <Text
                  className="font-label-sm text-label-sm text-on-surface-variant"
                  style={{ marginTop: 2 }}
                >
                  {isDeviceLocal(message)
                    ? `${message.attachment.meta} · on this device only`
                    : message.attachment.meta}
                </Text>
              </View>
              {/* Suppressed for device-local media: there is nowhere to download
                  it FROM, and a control that cannot work is the defect this
                  screen's composer pass was opened to fix. */}
              {isDeviceLocal(message) ? null : (
                <Icon chrome="download" size={20} color={incomingGlyphMuted} />
              )}
            </View>
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

/** The incoming player. Same anatomy as the outgoing one, in on-surface tokens. */
function IncomingVoiceNote({
  threadId,
  attachmentId,
  durationMs,
}: {
  threadId?: string;
  attachmentId?: string;
  durationMs: number | null;
}) {
  const source = useRemoteVoiceNoteSource(threadId, attachmentId);
  const playback = useVoiceNotePlayback(source, durationMs);
  return (
    <View className="flex-row items-center gap-base">
      <VoicePlayButton
        playback={playback}
        glyphToken="primary"
        fillToken="primary"
        fillAlpha={0.12}
        label="voice note"
      />
      <VoiceWaveform progress={playback.progress} playedToken="primary" restToken="outline-variant" />
      <Text className="font-label-sm text-label-sm text-on-surface-variant">{playback.label}</Text>
    </View>
  );
}

/**
 * `SystemEvent / joined` 552:1510 — a thread EVENT, centred and unbubbled.
 *
 * Only the practitioner care-team room produces these. It was flagged as "a
 * wire concept this app has no wire for", and that is still true: it is seeded,
 * not live, and is listed in the FLAGGED block at the top of PractitionerChatScreen.
 */
function SystemEventRow({ label }: { label: string }) {
  return (
    <View className="my-sm w-full items-center">
      <Text className="font-label-sm text-label-sm text-on-surface-variant">{label}</Text>
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
// The sixth, `FLOATING_SHADOW`, is now gone too — not because the rule changed
// but because its only two consumers did. It was shared by the clinical-actions
// MENU and the FAB, and both of those are removed (see the header: the menu's
// rows sent a bracketed string and attached nothing). Nothing on this screen is
// a sheet, menu, dialog, toast or FAB any more, so nothing here qualifies for
// BRAND's `elevation/floating` exception at all.
// ---------------------------------------------------------------------------
