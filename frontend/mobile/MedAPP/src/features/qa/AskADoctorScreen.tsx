// Ask a doctor — the patient Q&A surface over `/v1/social/qa`.
// Figma `qa — ask a doctor (populated)` 1106:18349, dark proof 1110:2789,
// page 949:10202.
//
// ---------------------------------------------------------------------------
// WHY THIS SCREEN EXISTS
// ---------------------------------------------------------------------------
// `listQA` and `askQuestion` have been wrapped in the client since before this
// pass and NOTHING called either of them. A working endpoint pair with no screen
// is the same defect as a screen with no entry point, one layer down: the
// feature is paid for and undeliverable.
//
// ---------------------------------------------------------------------------
// ENTRY POINT
// ---------------------------------------------------------------------------
// The Community screen header, beside the Saved-posts button. Q&A is the second
// thing social_service serves and Community is the only screen that reads that
// service, so the list belongs one tap from it — the same argument that put
// Saved posts there rather than in Settings.
//
// `features/community/**` is owned elsewhere this pass, so that one-line change
// is REPORTED, not made. Until it lands this route is reachable only by URL,
// which is the `/(app)/onboarding-status` defect and must not be left standing.
//
// ---------------------------------------------------------------------------
// A DETAIL SHELL, NOT A SIXTH TAB
// ---------------------------------------------------------------------------
// `DetailShell` — back button, no bottom nav, per docs/BRAND.md §App shell
// ("Detail screens don't get the bottom nav"). A sixth tab was never available:
// `Patient BottomTabBar` 740:1015 ships exactly five values and BottomNav
// matches it 1:1.
//
// `claimsBottomInset={false}` because the composer is pinned here and handles
// the inset itself under `KeyboardInset` — the same contract PostDetailScreen
// and the chat screens use.
//
// No app-bar action. There is no share and no overflow, because every affordance
// that leads away from a question leads towards the person who asked it: there
// is no report route for a question, and a share sheet over an anonymous health
// question is a leak with a button on it.
//
// ---------------------------------------------------------------------------
// THERE IS NO PAGING, SO THIS IS A PLAIN `useQuery`
// ---------------------------------------------------------------------------
// `GET /v1/social/qa` takes no `limit`/`offset` and returns no `next_offset`. A
// `useInfiniteQuery` here would have to invent a stop condition the server never
// sends — the mirror of the bug the feed had, where a client that inferred "a
// full page means more" looped forever. A FlatList is still the right container
// (the list is unbounded even if the request is not), it just has no
// `onEndReached`.
//
// ---------------------------------------------------------------------------
// FOUR STATES, AND FOUR IS THE POINT
// ---------------------------------------------------------------------------
//   loading  a spinner. Something IS in flight.
//   error    "couldn't load" + retry. A fact about the request.
//   empty    "no questions yet" + the composer. A fact about the data.
//   rows     the list.
// Empty and error are drawn differently on purpose: "we could not load your
// questions" and "there are none" are different answers and must not look the
// same. Social has no seed data, so empty is what most testers see first.
//
// The composer stays visible in ALL FOUR, including error — the one control that
// can change the situation should not disappear because a read failed.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. Only expo-router is used, indirectly through DetailShell.

import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import {
  EmptyState,
  ErrorPanel,
  Icon,
  KeyboardInset,
  SkeletonCard,
} from "@/components/ui";
import { Toast, useToast } from "@/components/feedback";
import { useTokenColor } from "@/lib/tokens";
import { qaApi, qaKeys, QUESTION_MAX_LENGTH, type QAEntry } from "./api";
import { QuestionCard } from "./QuestionCard";

/** Where this screen lives. Named so the entry point is assertable from a test. */
export const ASK_A_DOCTOR_HREF = "/(app)/ask-a-doctor";

export function AskADoctorScreen() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  /**
   * Whether the next question goes out anonymously.
   *
   * TRUE, matching the server's own default for `is_anonymous`. Local state is
   * correct here — unlike a like button, this is a per-question intent being
   * composed, not a server fact being mirrored, so there is nothing for it to
   * disagree with.
   */
  const [anonymous, setAnonymous] = useState(true);

  const spinner = useTokenColor("primary");
  const muted = useTokenColor("on-surface-variant");
  const { message: toastMessage, tone: toastTone, show: showToast, clear: clearToast } = useToast();

  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    // Viewer-free: `QAOut` carries no per-viewer field, so this cache is correct
    // for anybody and survives an account switch. See api.ts.
    queryKey: qaKeys.list(),
    queryFn: () => qaApi.listQA(),
  });

  const ask = useMutation({
    mutationFn: (question: string) => qaApi.askQuestion(question, anonymous),
    onSuccess: () => {
      setDraft("");
      // Refetch rather than prepending the returned row: the server assigns the
      // id and the timestamp, and moderation could hold the question back
      // entirely. An optimistic row would show a question that may never be
      // published — and here it would also be the asker's own words appearing
      // under a promise the server had not yet made.
      void queryClient.invalidateQueries({ queryKey: qaKeys.all });
      showToast("success", anonymous ? "Question sent anonymously." : "Question sent.");
    },
    // The visible failure path. The draft is deliberately NOT cleared above
    // until success, so a retry costs a tap and not a retype.
    onError: () =>
      showToast("error", "Couldn't send your question. Check your connection and try again."),
  });

  const trimmed = draft.trim();
  const canSend = trimmed.length > 0 && !ask.isPending;
  const questions: QAEntry[] = isPending || isError ? [] : (data ?? []);

  return (
    <DetailShell title="Ask a doctor" claimsBottomInset={false} testID="ask-a-doctor-screen">
      <KeyboardInset>
        <FlatList
          data={questions}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => <QuestionCard entry={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          // md (24), the section step — not lg (48), which separates page
          // sections. Between cards that already carry a hairline, a surface fill
          // and a 24 radius, 48 reads as a hole rather than a rhythm.
          ItemSeparatorComponent={() => <View className="h-md" />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View className="py-md">
              {/* States the anonymity DEFAULT up front. `is_anonymous` defaults
                  TRUE server-side and a patient must not have to guess which way
                  it points before typing a symptom. */}
              <Text className="font-body-md text-body-md text-on-surface-variant">
                Ask a health question and a clinician answers it here. Questions are anonymous by
                default.
              </Text>
            </View>
          }
          ListEmptyComponent={
            isPending ? (
              // The shape of the thing that is coming, not a spinner in a void.
              // `post-card` rather than a fourth shape: a QA row and a post card
              // are the same silhouette — byline, body block — and inventing a
              // `qa-card` shape would be a second drawing of one thing.
              <View className="gap-md py-md" testID="qa-loading">
                <SkeletonCard shape="post-card" count={3} />
              </View>
            ) : isError ? (
              <View className="py-md">
                <ErrorPanel
                  testID="qa-error"
                  title="Couldn't load questions"
                  body="Check your connection and try again."
                  // `retry` takes a promise and the panel tracks it, so the
                  // in-flight label is the panel's job rather than a second
                  // piece of state here. `retrying` is still passed because a
                  // refetch can also be started by a remount.
                  retry={() => refetch()}
                  retrying={isRefetching}
                  retryAccessibilityLabel="Retry loading questions"
                />
              </View>
            ) : (
              <View className="py-md">
                {/* No action prop. The composer is on screen directly below, and
                    a second Ask control would be two affordances for one act. */}
                <EmptyState
                  testID="qa-empty"
                  icon="stethoscope"
                  title="No questions yet"
                  body="Ask the first one. Your name is not attached unless you choose to attach it."
                />
              </View>
            )
          }
        />

        {/* The anonymity control, where the decision is made rather than in a
            settings screen — the choice is per question. It is a real control
            over a real field (`is_anonymous`), not a reassurance graphic. */}
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Ask anonymously"
          accessibilityHint="When on, your name is not stored with the question"
          accessibilityState={{ checked: anonymous }}
          onPress={() => setAnonymous((prev) => !prev)}
          className="flex-row items-center gap-sm border-t border-outline-variant bg-surface px-base py-sm active:opacity-70"
        >
          <Icon chrome="shield" size={20} color={anonymous ? spinner : muted} />
          <View className="flex-1">
            <Text className="font-label-md text-label-md text-on-surface">Ask anonymously</Text>
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              {anonymous
                ? "Your name is not stored with the question."
                : "Your question will be attributed to you."}
            </Text>
          </View>
          {/* Not a Switch: RN's Switch cannot be tinted from a token in both
              modes without a platform fork, and the row itself is already the
              44pt target. The state is carried by `accessibilityState.checked`
              above, so it is announced, not just drawn. */}
          <View
            className={`h-8 w-[52px] justify-center rounded-full px-xs ${
              anonymous ? "items-end bg-primary" : "items-start bg-surface-container-high"
            }`}
          >
            <View
              className={`h-6 w-6 rounded-full ${anonymous ? "bg-on-primary" : "bg-outline"}`}
            />
          </View>
        </Pressable>

        {/* Composer, docked. No attachment and no voice button: the wire body is
            `{question, is_anonymous}` and social_service has no upload route and
            no transcription, so either control would be dead the day it shipped
            — which is the defect this codebase has spent several passes
            deleting. Figma `Composer / Chat` 550:2002 is instanced with both
            targets hidden for the same reason. */}
        <View className="border-t border-outline-variant bg-surface px-base py-sm">
          <View className="flex-row items-end gap-sm rounded-md bg-field-surface px-sm py-xs">
            <View className="flex-1">
              <QuestionInput value={draft} onChange={setDraft} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send question"
              accessibilityState={{ disabled: !canSend, busy: ask.isPending }}
              disabled={!canSend}
              onPress={() => ask.mutate(trimmed)}
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
              style={{ opacity: canSend ? 1 : 0.4 }}
            >
              <Icon chrome="send" size={22} color={spinner} />
            </Pressable>
          </View>
        </View>
      </KeyboardInset>

      <Toast message={toastMessage} tone={toastTone} onDismiss={clearToast} />
    </DetailShell>
  );
}

function QuestionInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const placeholder = useTokenColor("outline");
  return (
    <TextInput
      accessibilityLabel="Question input"
      value={value}
      onChangeText={onChange}
      placeholder="Ask a health question…"
      placeholderTextColor={placeholder}
      multiline
      // The server's own ceiling. Stopping here beats a 422 the user cannot see
      // the cause of.
      maxLength={QUESTION_MAX_LENGTH}
      className="font-body-md text-body-md text-on-surface"
      style={{ maxHeight: 120 }}
    />
  );
}
