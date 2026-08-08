// AI Assistant (MedAI) screen — Figma `ai_assistant` 550:2700, page 548:615
// "Messaging", plus its three state frames:
//
//   550:3762  — first run (empty)
//   550:4659  — assistant thinking (loading)
//   550:4777  — send failed (error)
//
// ---------------------------------------------------------------------------
// THERE IS NO MODEL BEHIND THIS SCREEN, AND IT NO LONGER PRETENDS THERE IS
// ---------------------------------------------------------------------------
// PATIENT-SAFETY PASS 2026-08-07. What this file used to be: a full conversation
// UI with no assistant on the other end of it. Specifically —
//
//   * Every question, whatever it was, returned ONE hardcoded 34-word reply
//     after a 900ms fake "thinking" animation, under the attribution
//     "MedAI · AI-generated". A user asking about chest pain and a user asking
//     about a repeat prescription got the same sentence, labelled as though a
//     model had produced it for them.
//   * The seeded transcript asserted A LAB RESULT FOR THIS USER — "Your lab
//     report from yesterday shows Vitamin D a little below the usual range" —
//     which was invented. No lab endpoint was consulted; the sentence came from
//     a Figma frame. That is a fabricated clinical finding attributed to the
//     signed-in patient, and it is the worst thing this file did.
//   * The seed also put words in the patient's mouth (a temple headache, "about
//     a 4 out of 10") and then had the assistant reason from them.
//   * BOTH escalation buttons were `disabled`, so the user who read all of that
//     and wanted an actual clinician had no way out of the screen.
//
// There is no `medical_chat_agent` client in this app and no assistant endpoint
// anywhere in the product, so this could not be made real. The remaining choice
// was between a better simulation and no simulation, and in a health product it
// is not a close call: the conversation, the composer, the canned reply and the
// thinking animation are all DELETED. The screen now says plainly that the
// assistant is not available yet.
//
// What replaces them is the one thing here that can be true today: a real route
// to a human. "Talk to a Practitioner" calls `chatApi.createThread` with
// `assignedRole: "doctor"` and opens the thread it creates — an ordinary
// inbox_service thread a clinician picks up.
//
// NOT `POST /v1/threads/handoff`, even though that endpoint is documented for
// exactly this and is now wrapped in ./api.ts. `create_handoff_thread` requires
// a `service` or `admin` principal (inbox_service thread_service.py:66) and a
// patient's token is neither, so calling it from the handset is a guaranteed
// 403. It is the call the assistant SERVICE will make on the user's behalf when
// it exists; it is not a call this screen can make.
//
// STILL IMPOSSIBLE without backend work, and therefore absent rather than
// approximated: any answer to any health question; the proactive lab insight
// (needs a labs read the assistant can cite); the suggested-prompt chips (they
// only made sense as inputs to a model); "Schedule a Consultation" (which
// practitioner it should pre-select is a product decision, not an inference).
//
// KEPT from the frame reconciliation, because they are true regardless of
// whether a model exists: the `Assistant Identity Header` (550:2708) and its
// "not a clinician" boundary line, and the PINNED `AI Disclosure Line`
// (550:2971). See the block on <AiDisclosureLine /> for why the disclosure is
// pinned and not a message footnote.
//
// The composer went with the conversation. It had a real attach/mic pair wired
// to ./useComposerMedia, and none of that is deleted — the hook is still used by
// ChatThreadScreen, and its exhaustive coverage moved to that screen's suite.
// A composer for a recipient that does not exist is a dead control with a
// keyboard attached.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import { Button, Icon, InfoCallout } from "@/components/ui";
import { Toast, useToast } from "@/components/feedback";
import { useTokenColor } from "@/lib/tokens";
import { chatApi } from "./api";

/**
 * The assistant's own name and boundary line, from `Assistant Identity Header`
 * 550:2708 and repeated in the disclosure. Hoisted to constants because the
 * identity header and the disclosure both have to agree — two copies of "MedAI"
 * is how a rename half-lands.
 */
const ASSISTANT_NAME = "MedAI";
const ASSISTANT_ROLE = "AI health assistant · not a clinician";

/**
 * The role a patient-initiated escalation thread is assigned to. Same constant
 * InboxScreen's compose flow uses, and for the same reason: it is the shape
 * inbox_service routes to a clinician.
 */
const ESCALATION_ROLE = "doctor";

/** The subject the created thread carries into the clinician's queue. */
const ESCALATION_SUBJECT = "Request to speak with a practitioner";

export function AiAssistantScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const escalate = useMutation({
    mutationFn: () =>
      chatApi.createThread({
        subject: ESCALATION_SUBJECT,
        source: "direct",
        assignedRole: ESCALATION_ROLE,
      }),
    onSuccess: (thread) => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      router.push({
        // Route was added recently — typedRoutes regenerates on dev server start.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pathname: "/(app)/chat-thread" as any,
        params: { name: thread.subject, threadId: thread.id },
      });
    },
    // A failed escalation is the one failure on this screen that matters: the
    // user has already decided they want a person.
    onError: () => toast.show("error", "Couldn't reach the care team. Try again."),
  });

  return (
    // ------------------------------------------------------------------
    // DetailShell (safe area + DetailAppBar + body).
    //
    // THE BAR IS WHAT THE FRAME DRAWS: a back chevron and the title, nothing
    // else. The comp put the user's own avatar in `leading` and a notifications
    // bell in `actions`; 550:2700's `Detail AppBar — MedAI` has neither, and the
    // bell had no `onPress`.
    //
    // `claimsBottomInset` is back to its DEFAULT (true). It was `false` because
    // a composer dock had to sit flush against the keyboard; there is no
    // composer and no keyboard on this screen any more, so the shell claims the
    // inset like every other detail screen.
    // ------------------------------------------------------------------
    <DetailShell title={ASSISTANT_NAME}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <AssistantIdentityHeader />
        <AiUnavailablePanel
          onEscalate={() => escalate.mutate()}
          escalating={escalate.isPending}
        />
      </ScrollView>

      <View className="border-t border-outline-variant bg-surface">
        <AiDisclosureLine />
      </View>

      <Toast message={toast.message} tone={toast.tone} onDismiss={toast.clear} />
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// AI Disclosure Line — 550:2971
// ---------------------------------------------------------------------------

/**
 * The pinned disclosure, present in ALL FOUR `ai_assistant` frames as
 * `AI Disclosure Line — pinned above the home gesture area`.
 *
 * WHY THIS IS NOT A MESSAGE FOOTNOTE. An earlier version carried the same
 * sentiment on ONE seeded message, as `disclaimer`. A disclosure attached to a
 * message scrolls off the top the moment the conversation is three turns long —
 * so the user who has been talking to the assistant for five minutes, i.e. the
 * one most likely to have started treating it as advice, is the one who can no
 * longer see it. In a health product a disclosure that scrolls past is not a
 * disclosure. It stays pinned even now that there is no conversation to scroll,
 * because it is also the boundary statement for the escalation above it.
 *
 * Spec, read off the node rather than the picture: `surface` fill,
 * `outline-variant` top hairline, 16px horizontal / 8px vertical inset
 * (spacing/16, spacing/8), text at `label-sm` in `on-surface-variant`.
 * `label-sm` is 12sp, which is exactly BRAND's floor and therefore legal.
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
// Assistant identity + the unavailable state
// ---------------------------------------------------------------------------

/**
 * `Assistant Identity Header` 550:2708 — a 56px `primary-tint` plate with the
 * 24px sparkle, the assistant's name at `headline-md`, and the boundary line at
 * `label-sm`.
 *
 * The boundary line is the point of the component: "not a clinician" is stated
 * once at full size at the top, and again in the pinned disclosure at the
 * bottom.
 *
 * `showPlate` is gone with the conversation — it existed to suppress the plate
 * on first run so the EmptyState's own plate was the only icon on screen, and
 * there is no EmptyState any more. This is the only plate.
 */
function AssistantIdentityHeader() {
  const glyph = useTokenColor("on-surface-variant");

  return (
    <View className="items-center pb-md" testID="assistant-identity-header">
      <View className="mb-sm h-14 w-14 items-center justify-center rounded-full bg-primary-tint">
        <Icon chrome="auto-awesome" size={24} color={glyph} />
      </View>
      <Text className="font-headline-md text-headline-md text-on-surface">{ASSISTANT_NAME}</Text>
      <Text className="mt-xs text-center font-label-sm text-label-sm text-on-surface-variant">
        {ASSISTANT_ROLE}
      </Text>
    </View>
  );
}

/**
 * What the screen says instead of simulating an assistant.
 *
 * It states the fact (there is no assistant yet), it does NOT hint that one is
 * "coming soon" with a date nobody has committed to, and it gives the user the
 * exit the two disabled buttons used to withhold.
 *
 * The emergency line is not boilerplate: this screen is where somebody with a
 * symptom arrives, and the honest answer to "the assistant is unavailable" has
 * to include what to do if the thing they wanted to ask about is urgent.
 */
function AiUnavailablePanel({
  onEscalate,
  escalating,
}: {
  onEscalate: () => void;
  escalating: boolean;
}) {
  return (
    <View className="gap-md" testID="ai-unavailable-panel">
      <InfoCallout tone="info" icon="info-outline" testID="ai-unavailable-notice">
        MedAI isn&apos;t available yet. Nothing on this screen can answer a health question, so
        rather than guess, it doesn&apos;t try.
      </InfoCallout>

      <View className="gap-sm rounded-card border border-outline-variant bg-surface-container p-md">
        <Text className="font-label-md text-label-md text-on-surface">
          You can still reach a person.
        </Text>
        <Text className="font-body-md text-body-md text-on-surface-variant">
          This opens a conversation in your inbox and puts it in the care team&apos;s queue. A
          clinician replies there.
        </Text>
        <Button
          label={escalating ? "Opening…" : "Talk to a Practitioner"}
          variant="primary"
          fullWidth
          loading={escalating}
          disabled={escalating}
          onPress={onEscalate}
        />
      </View>

      <InfoCallout tone="error" icon="warning-amber" testID="ai-emergency-callout">
        If this is an emergency — chest pain, trouble breathing, severe bleeding, sudden confusion —
        call your local emergency number now. Do not wait for a reply here.
      </InfoCallout>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Elevation — this screen has NO shadows, and the section is kept as the record
// of why, so the `Platform.select` tables can't quietly grow back.
//
//   cardShadow      the old "AI Health Insight" card, which appeared in no frame.
//   aiBubbleShadow  the assistant's message bubble. A bubble is a content
//                   surface — the card role — so it gets a hairline, not a blur.
//   appBarShadow    deleted with the hand-rolled app bar; DetailAppBar (Figma
//                   193:120) carries no effects.
//
// Nothing on this screen is a bottom sheet, menu, dialog, toast or FAB, so
// nothing here qualifies for BRAND's `elevation/floating` exception.
// ---------------------------------------------------------------------------
