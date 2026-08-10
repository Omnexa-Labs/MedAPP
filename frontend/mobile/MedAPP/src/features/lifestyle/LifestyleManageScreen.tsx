// Lifestyle Management screen — the daily logging form. Translated from the
// Stitch "Lifestyle Management" HTML. This is the second of the two Lifestyle
// screens (the first is LifestyleHubScreen).
//
// Reached from the Hub's "Go to Log" CTA, which pushes /(app)/lifestyle-manage.
// It is a modal-style task screen: the comp has a close (✕) in the app bar, so
// this is a focused flow opened over the Hub and dismissed with back. Like the
// AI chat screen, a task flow drops the BottomNav in favour of the close
// affordance.
//
// Translation rules (same as the sibling screens):
//   - bento 12-col grid → single-column stack on a phone.
//   - glass-card / shadow-sm → the shared <Card />, which casts NO shadow
//     (docs/BRAND.md §Elevation).
//   - <select> → tap-to-open Modal picker (no @react-native-picker dep);
//     <input type=range> → a dependency-free segmented tap track (no slider dep).
//   - hover:* / cursor-grab / focus:ring → dropped or mapped to active:scale.
//
// ============================================================================
// "SAVE & CLOSE" SAVED NOTHING (2026-08-08)
// ============================================================================
// The sticky extended FAB read "Save & Close" over a `task-alt` tick, and its
// entire implementation was `onPress={() => router.back()}`. Sleep, water,
// workout, mood, stress and meals lived in component `useState` and were
// discarded on dismiss. There is no lifestyle API in this repo, no
// device-storage write, and the Hub's charts could never reflect an entry.
//
// A control that is shaped like a save, labelled like a save and tick-glyphed
// like a save IS a claim that the data was recorded — and a patient logging
// symptoms daily under that impression is building a record that does not
// exist. So the FAB is DELETED rather than relabelled: DetailShell already
// carries a ✕ dismiss, and a second bottom-right button reading "Close" would
// only be a quieter version of the same affordance. In its place, one plain
// sentence at the top of the form saying what happens to what you type.
//
// The AI MEAL PLANNER card went with it, and that deletion is the larger one:
//
//   * "Generate with AI" revealed a hardcoded RECOMMENDATION — "Grilled Salmon
//     & Quinoa", 45g protein, and an "AI Reasoning" paragraph reading "Based on
//     your intense morning workout, your muscles require high-quality protein…"
//     There was no model, no request, and no workout: the app has never
//     recorded one. That is fabricated dietary advice attributed to an analysis
//     of the patient, which is a stronger claim than any chart on these
//     screens made.
//   * "Upload Food Photo" — a Pressable with NO `onPress`, under the caption
//     "AI will identify ingredients automatically". No image picker is a
//     dependency of this project.
//   * the prompt field and the ingredient chips, which fed the above and
//     nothing else.
//
// Recorded in docs/api/README.md's gap register.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { DetailShell } from "@/components/shell";
import { Card, InfoCallout } from "@/components/ui";
import { Icon } from "@/components/ui/icons/Icon";
import { useTokenColor } from "@/lib/tokens";
import { MaterialIcons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

const WORKOUT_OPTIONS = [
  "Active Recovery (Walk/Yoga)",
  "Strength Training (Upper Body)",
  "Cardio Blast (HIIT)",
  "Full Body Resistance",
  "Rest Day",
];

// Worst -> best. Registry glyphs, not emoji: docs/BRAND.md forbids emoji
// outright, and an emoji can't take a token colour or render consistently across
// devices. `label` is what a screen reader announces, so the scale is no longer
// "Mood 3 of 5" with no idea what 3 means.
const MOODS = [
  { icon: "mood-distressed", label: "Distressed" },
  { icon: "mood-low", label: "Low" },
  { icon: "mood-neutral", label: "Neutral" },
  { icon: "mood-good", label: "Good" },
  { icon: "mood-great", label: "Great" },
] as const;

function stressLabel(v: number): string {
  if (v < 4) return "Low";
  if (v < 7) return "Moderate";
  return "High";
}

export function LifestyleManageScreen() {
  // Mood glyph colours. Resolved through the token map rather than a Tailwind
  // class, because no cssInterop is registered for icon components.
  const onPrimaryContainer = useTokenColor("on-primary-container");
  // `on-surface-variant` does double duty here, both the same role — secondary
  // content on a neutral surface: the unselected mood glyph and the select's
  // chevron. Both were frozen literals (`#6d7a77`, which is light `outline`,
  // and `#3d4947`, which is light `on-surface-variant`).
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  // Brand-accent glyphs that can't be classes (MaterialIcons takes a string).
  const primary = useTokenColor("primary");

  // Daily vitality log
  const [sleepHours, setSleepHours] = useState(7.5); // 0.5h steps
  const [water, setWater] = useState(1.8); // 0.1L steps
  const [workout, setWorkout] = useState(WORKOUT_OPTIONS[0]);
  const [workoutPickerOpen, setWorkoutPickerOpen] = useState(false);

  // Mindset
  const [mood, setMood] = useState(2); // index into MOODS — 2 is "Neutral"
  const [stress, setStress] = useState(4); // 1..10

  const waterPct = Math.min(100, Math.round((water / 2.8) * 100));

  return (
    // ------------------------------------------------------------------
    // DetailShell (safe area + DetailAppBar + body).
    //
    // `backIcon="close"` preserves this screen's task/modal affordance; the
    // dismiss still pops, so no `onBack` override is needed. It is now the ONLY
    // dismiss on the screen — see the note at the head of the file for why the
    // sticky "Save & Close" FAB is gone.
    // ------------------------------------------------------------------
    <DetailShell title="Lifestyle Management" backIcon="close">
      {/* `paddingBottom: 32`, down from the 120 that reserved room for the
          deleted FAB. Keeping 120 would leave ~90px of dead space under the
          last card. */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 32,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* The one thing the user has to know before they type anything. It is
            first, not a footnote, and it does not promise a future release —
            "coming soon" is a claim too. */}
        <InfoCallout icon="info-outline" testID="lifestyle-not-stored">
          Nothing you enter here is stored yet. These controls work, but the
          values are cleared when you leave this screen — MedApp has nowhere to
          keep a daily log.
        </InfoCallout>

        {/* Daily Vitality Log */}
        <Card>
          <SectionLabel>Daily Vitality Log</SectionLabel>
          <View className="gap-md">
            <Stepper
              icon="bedtime"
              label="Sleep Duration"
              value={formatHrs(sleepHours)}
              unit="hrs"
              onDec={() => setSleepHours((v) => Math.max(0, +(v - 0.5).toFixed(1)))}
              onInc={() => setSleepHours((v) => Math.min(14, +(v + 0.5).toFixed(1)))}
            />

            <View className="gap-sm">
              <Stepper
                icon="water-drop"
                label="Water Intake"
                value={water.toFixed(1)}
                unit="Liters"
                onDec={() => setWater((v) => Math.max(0, +(v - 0.1).toFixed(1)))}
                onInc={() => setWater((v) => Math.min(5, +(v + 0.1).toFixed(1)))}
              />
              <View className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
                <View className="h-full bg-primary" style={{ width: `${waterPct}%` }} />
              </View>
            </View>

            {/* Workout select */}
            <View className="gap-sm">
              <Label icon="fitness-center">Workout Plan</Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Workout plan: ${workout}. Tap to change`}
                onPress={() => setWorkoutPickerOpen(true)}
                className="flex-row items-center justify-between rounded-xl bg-surface-container-low p-sm active:scale-[0.99]"
              >
                <Text className="font-body-md text-body-md text-on-surface">{workout}</Text>
                <MaterialIcons name="expand-more" size={22} color={onSurfaceVariant} />
              </Pressable>
            </View>
          </View>
        </Card>

        {/* Mindset Check-in */}
        <Card>
          <SectionLabel>Mindset Check-in</SectionLabel>

          <View className="mb-md">
            <Text className="mb-sm font-label-md text-label-md text-on-surface">Current Mood</Text>
            <View className="flex-row justify-between">
              {MOODS.map((option, i) => {
                const on = i === mood;
                return (
                  <Pressable
                    key={option.icon}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Mood: ${option.label}`}
                    onPress={() => setMood(i)}
                    className={`h-12 w-12 items-center justify-center rounded-xl border ${
                      on
                        ? "border-primary-container bg-primary-container"
                        : "border-transparent bg-surface-container-low"
                    }`}
                  >
                    <Icon
                      name={option.icon}
                      size={24}
                      color={on ? onPrimaryContainer : onSurfaceVariant}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Stress level — tap track (no slider dep) */}
          <View>
            <View className="mb-sm flex-row items-center justify-between">
              <Text className="font-label-md text-label-md text-on-surface">Stress Level</Text>
              <Text className="font-label-md text-primary" style={{ fontWeight: "700" }}>
                {stressLabel(stress)}
              </Text>
            </View>
            <View className="flex-row gap-xs">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                const on = n <= stress;
                return (
                  <Pressable
                    key={n}
                    accessibilityRole="button"
                    accessibilityLabel={`Set stress to ${n}`}
                    onPress={() => setStress(n)}
                    className="flex-1"
                    hitSlop={{ top: 8, bottom: 8 }}
                  >
                    {/* Filled = `primary`; unfilled = the same empty-track
                        token the water bar above uses. The literals were light
                        `primary` and light `surface-container-high`, so in dark
                        mode the whole track sat at near-white regardless of
                        value — the "filled" and "empty" halves were the same
                        two frozen colours on a #0E1514 page. */}
                    <View
                      className={on ? "bg-primary" : "bg-surface-container-highest"}
                      style={{ height: 8, borderRadius: 4 }}
                    />
                  </Pressable>
                );
              })}
            </View>
            <View className="mt-xs flex-row justify-between">
              <Text className="text-outline" style={{ fontSize: 10, fontWeight: "700" }}>
                CALM
              </Text>
              <Text className="text-outline" style={{ fontSize: 10, fontWeight: "700" }}>
                INTENSE
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>

      {/* Workout picker modal. A <Modal> renders into its own native host
          window, so its position in the tree does not affect its layout. */}
      <Modal
        visible={workoutPickerOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setWorkoutPickerOpen(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-scrim/40"
          onPress={() => setWorkoutPickerOpen(false)}
        >
          <Pressable className="rounded-t-2xl bg-surface-container-lowest p-md" onPress={() => {}}>
            <Text
              className="mb-md text-center font-headline-md text-on-surface"
              style={{ fontSize: 18 }}
            >
              Workout Plan
            </Text>
            {WORKOUT_OPTIONS.map((opt) => {
              const on = opt === workout;
              return (
                <Pressable
                  key={opt}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setWorkout(opt);
                    setWorkoutPickerOpen(false);
                  }}
                  className={`flex-row items-center justify-between rounded-xl px-md py-md active:scale-[0.99] ${
                    on ? "bg-primary-container/15" : ""
                  }`}
                >
                  <Text
                    className={`font-body-md text-body-md ${on ? "text-primary" : "text-on-surface"}`}
                  >
                    {opt}
                  </Text>
                  {on ? <MaterialIcons name="check" size={20} color={primary} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// The private `Card` that used to live here is gone: it was a hand-rolled twin
// of the shared primitive (same hairline, same inset) that additionally carried
// a `cardShadow`. Call sites now use `Card` imported from "@/components/ui",
// which cannot take a shadow even through `style`.
//
// `RecommendationCard` went with the AI meal planner — see the head of the file.

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="mb-md font-label-md text-label-md uppercase text-outline"
      style={{ letterSpacing: 1.5 }}
    >
      {children}
    </Text>
  );
}

function Label({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  const primary = useTokenColor("primary");
  return (
    <View className="flex-row items-center gap-xs">
      <MaterialIcons name={icon} size={20} color={primary} />
      <Text className="font-label-md text-label-md text-on-surface">{children}</Text>
    </View>
  );
}

function Stepper({
  icon,
  label,
  value,
  unit,
  onDec,
  onInc,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View className="gap-sm">
      <Label icon={icon}>{label}</Label>
      <View className="flex-row items-center justify-between rounded-xl bg-surface-container-low p-sm">
        <StepBtn icon="remove" label={`Decrease ${label}`} onPress={onDec} />
        <View className="flex-row items-baseline gap-xs">
          <Text className="font-headline-md text-on-surface" style={{ fontSize: 22 }}>
            {value}
          </Text>
          <Text className="font-label-sm text-label-sm text-outline">{unit}</Text>
        </View>
        <StepBtn icon="add" label={`Increase ${label}`} onPress={onInc} />
      </View>
    </View>
  );
}

function StepBtn({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  // Chrome glyph on the outlined control — `on-surface-variant`, whose light
  // value IS the `#3d4947` this replaces, so light mode is unchanged.
  const glyph = useTokenColor("on-surface-variant");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-8 w-8 items-center justify-center rounded-full border border-outline-variant active:bg-primary/10"
    >
      <MaterialIcons name={icon} size={18} color={glyph} />
    </Pressable>
  );
}

function formatHrs(h: number): string {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Elevation
// ---------------------------------------------------------------------------
//
// Nothing on this screen floats any more. `cardShadow` was deleted with the
// private `Card` wrapper and `appBarShadow` with the hand-rolled app bar —
// DetailAppBar (Figma 193:120) carries no effects. `FAB_SHADOW`, the sanctioned
// `0 2px 6px` @8% pair, went with the extended FAB itself: the one genuinely
// floating surface here was the control that claimed a save, and it is gone.
