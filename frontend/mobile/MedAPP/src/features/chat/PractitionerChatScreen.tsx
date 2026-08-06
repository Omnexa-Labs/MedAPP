// PractitionerChatScreen — the clinician care-team room.
// Figma: `practitioner_chat — care team thread` 1057:1448, dark proof
// 1059:17684, page 1018:640 "Practitioner Shell".
//
// ---------------------------------------------------------------------------
// WHY THIS FILE IS TWENTY LINES OF JSX AND NOT A SECOND CHAT SCREEN
// ---------------------------------------------------------------------------
// This room and the patient 1:1 are the SAME anatomy: app bar, day divider,
// incoming/outgoing bubbles, attachment cards, a vitals card and the docked
// composer with its attach/mic/send trio. They differ in their DATA and in
// three strings.
//
// A second screen would mean a second composer, a second `useComposerMedia`
// wiring, a second set of bubble rules and a second delivery-receipt path to
// keep in step with this one. `AccountMenu` is the precedent in this repo for
// the other choice — it serves both audiences from one file precisely so the
// sign-out rules cannot drift between them — and the same argument applies
// here, more strongly, because the surface is bigger.
//
// So the group-ness is expressed as DATA, not as a mode:
//   * `senderName` on a message renders the `Sender` line (550:2014). A 1:1
//     omits it because the app bar already names the other party.
//   * `kind: "system"` renders a `SystemEvent` row (552:1510). A 1:1 never
//     produces one, so its seed simply has none.
//
// ---------------------------------------------------------------------------
// FLAGGED — SEEDED, NOT LIVE
// ---------------------------------------------------------------------------
// There are no messaging endpoints in this product AT ALL (docs/PIPELINE.md's
// inert-control audit: "New conversation — InboxScreen. No messaging
// endpoints."). Three things this frame draws therefore cannot be real, and are
// seeded rather than fabricated from a made-up API:
//
//   1. "8 members · 3 online now" and the +6 roster behind it. No membership or
//      presence endpoint exists.
//   2. "Nii Tetteh joined the shift". Join/leave is a wire concept with no wire.
//   3. Delivery receipts.
//
// The NAMES are from the seeded roster — Ama Mensah (patient) plus doctors
// Kwabena Osei, Adjoa Boateng, Yaw Darko, Efua Asante, Nii Tetteh and Abena
// Owusu. The frame originally carried "Dr. Sarah Chen", "Mark Thompson" and
// "Nurse Jennifer", none of whom exist; that was corrected in Figma in the same
// pass (docs/PIPELINE.md §5w), along with the invented default baked into
// `Chat Bubble / Other`'s Sender property.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. None is used directly — everything goes through ChatThreadScreen.

import { ChatThreadScreen, type ChatMessage } from "./ChatThreadScreen";

/**
 * The seeded room. Mirrors 1057:1448 top to bottom.
 *
 * `senderName` is set only on INCOMING messages: an outgoing bubble is the
 * signed-in clinician and the frame gives it no attribution either.
 */
const SEED_CARE_TEAM_MESSAGES: ChatMessage[] = [
  {
    id: "ct-1",
    direction: "incoming" as const,
    kind: "text" as const,
    senderName: "Dr. Kwabena Osei · Attending Physician",
    text: "Just completed rounds. Efua, can you verify vitals for bed 12 in the next 15 minutes?",
    timestamp: "19:42",
  },
  {
    id: "ct-2",
    direction: "incoming" as const,
    kind: "attachment" as const,
    text: "Reference summary of the last three consultations, so we can track the trend together.",
    timestamp: "19:43",
    attachment: {
      name: "Lab_Panel_May2026.pdf",
      meta: "PDF · 2.4 MB",
      icon: "description" as const,
    },
  },
  {
    id: "ct-3",
    direction: "incoming" as const,
    kind: "vitals" as const,
    timestamp: "19:44",
    // Same payload the patient thread's vitals message uses — `bpTrend` /
    // `hrTrend` are the ENUM the card maps to a token, not display strings. The
    // frame's "In range" / "Improved" captions come out of that mapping.
    vitals: {
      bp: "122/80",
      hr: "72",
      bpTrend: "stable" as const,
      hrTrend: "down" as const,
      note: "Blood pressure is within target range. Heart rate improved since the last visit.",
    },
  },
  {
    id: "ct-4",
    direction: "outgoing" as const,
    kind: "attachment" as const,
    text: "On it. Uploading the lab panel now — flagging the potassium result.",
    timestamp: "19:45",
    delivered: true,
    attachment: {
      name: "Lab_Panel_May2026.pdf",
      meta: "PDF · 2.4 MB",
      icon: "description" as const,
    },
  },
  {
    id: "ct-5",
    direction: "outgoing" as const,
    kind: "text" as const,
    text: "Chart updated. Bed 12 was slightly hypertensive an hour ago; recheck is logged.",
    timestamp: "19:47",
    delivered: true,
  },
  {
    id: "ct-6",
    direction: "incoming" as const,
    kind: "text" as const,
    senderName: "Efua Asante · Head Nurse",
    text: "Thanks both. I'll take the 20:30 recheck so the handover stays clean.",
    timestamp: "19:50",
  },
  {
    id: "ct-7",
    direction: "incoming" as const,
    kind: "system" as const,
    text: "Nii Tetteh joined the shift",
    timestamp: "19:52",
  },
];

export function PractitionerChatScreen() {
  return (
    <ChatThreadScreen
      isGroup
      threadTitle="ICU Night Shift"
      // The frame's ThreadContextBar is a second strip under the app bar. This
      // folds its two lines into the bar's subtitle, the same fold the patient
      // thread already makes for `Doctor · Cardiologist` — DetailAppBar 193:120
      // has one subtitle slot and adding a second strip would re-admit the
      // per-screen chrome the shell exists to end.
      threadSubtitle="8 members · 3 online now"
      dividerLabel="Shift started · 19:00"
      composerPlaceholder="Message the care team…"
      seedMessages={SEED_CARE_TEAM_MESSAGES}
    />
  );
}
