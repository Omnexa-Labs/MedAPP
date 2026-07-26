// Lifestyle Management screen — the daily logging + AI meal planner form.
// Translated from the Stitch "Lifestyle Management" HTML. This is the
// second of the two Lifestyle screens (the first is LifestyleHubScreen).
//
// Reached from the Hub's "Go to Log" and "View Full Schedule" CTAs, which
// push /(app)/lifestyle-manage. It is a modal-style task screen: the comp
// has a close (✕) in the app bar and a sticky "Save & Close" — so this is
// a focused editing flow, opened over the Hub and dismissed with back.
// Like the AI chat screen, a task flow like this drops the BottomNav in
// favour of the close affordance (the comp keeps a nav bar, but on a phone
// a Save/Close task sheet reads better without it; back returns to the Hub).
//
// Translation rules (same as the sibling screens):
//   - bento 12-col grid → single-column stack on a phone.
//   - glass-card / shadow-sm → opaque surface + Platform.select shadow.
//   - <textarea> → multiline TextInput; <select> → tap-to-open Modal
//     picker (no @react-native-picker dep); <input type=range> → a
//     dependency-free segmented tap track (no slider dep).
//   - hover:* / cursor-grab / focus:ring / drag-scroll JS → dropped or
//     mapped to active:scale; horizontal ingredient row → ScrollView.
//   - "Generate with AI" / photo upload / "Add" are interactive but LOCAL:
//     ingredients append to a chip list; Generate reveals the canned
//     recommendation card. No backend — design-only pass.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

const SUGGESTED_INGREDIENTS = [
  "Avocado",
  "Quinoa",
  "Salmon",
  "Sweet Potato",
  "Kale",
  "Blueberries",
];

const WORKOUT_OPTIONS = [
  "Active Recovery (Walk/Yoga)",
  "Strength Training (Upper Body)",
  "Cardio Blast (HIIT)",
  "Full Body Resistance",
  "Rest Day",
];

const MOODS = ["😫", "😕", "😐", "🙂", "🤩"];

const RECOMMENDATION = {
  title: "Grilled Salmon & Quinoa",
  tagline: '"High protein, omega-3 rich dinner for muscular recovery."',
  macros: [
    { label: "Protein", value: "45g" },
    { label: "Carbs", value: "30g" },
    { label: "Fats", value: "18g" },
  ],
  reasoning:
    "Based on your intense morning workout, your muscles require high-quality protein and complex carbohydrates for glycogen replenishment. Salmon provides essential DHA for cardiovascular health.",
  imageUri:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBnHEFuNHtnQDzxBBuwRAslqPoQR1RoO2UeI4A6xoy4NbFgbOcALRiBnmXOoh8UFBT58u2LhC7KW_itP-znuEI9e2Bhj4cdlfBCZKsLBlVMto5a6tCRuYKweB4FObgkRxR8dDp4XSOw5iPtsECooncA9ailipFAxmyVthrVlIh4fh2XZJYarmHyF_JuZOhiDaHD0_u4SdjuWioYWR9OP_ub1dIotY3Ukf-7mdanEXb9payPNaVA9wUpDt7zoyAy48Eul2f23kI9kwfd",
};

function stressLabel(v: number): string {
  if (v < 4) return "Low";
  if (v < 7) return "Moderate";
  return "High";
}

export function LifestyleManageScreen() {
  // AI meal planner
  const [prompt, setPrompt] = useState("");
  const [showRecommendation, setShowRecommendation] = useState(false);

  // Ingredient chips: which suggested ones are selected + manual additions.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [manualIngredient, setManualIngredient] = useState("");
  const [extraIngredients, setExtraIngredients] = useState<string[]>([]);

  // Daily vitality log
  const [sleepHours, setSleepHours] = useState(7.5); // 0.5h steps
  const [water, setWater] = useState(1.8); // 0.1L steps
  const [workout, setWorkout] = useState(WORKOUT_OPTIONS[0]);
  const [workoutPickerOpen, setWorkoutPickerOpen] = useState(false);

  // Mindset
  const [mood, setMood] = useState(2); // index into MOODS (😐)
  const [stress, setStress] = useState(4); // 1..10

  const toggleIngredient = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const addManual = () => {
    const v = manualIngredient.trim();
    if (!v) return;
    setExtraIngredients((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setManualIngredient("");
  };

  const waterPct = Math.min(100, Math.round((water / 2.8) * 100));

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* App bar — close + title (this is a task/modal flow) */}
        <View
          className="flex-row items-center gap-md border-b border-outline-variant/20 bg-surface/80 px-gutter py-sm"
          style={appBarShadow}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            onPress={() => router.back()}
            className="rounded-full p-xs active:scale-95"
          >
            <MaterialIcons name="close" size={24} color="#00685f" />
          </Pressable>
          <Text className="font-headline-md text-headline-md text-primary">
            Lifestyle Management
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, gap: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* AI Meal Planner */}
          <Card>
            <View className="mb-md flex-row items-center gap-xs">
              <MaterialIcons name="auto-awesome" size={22} color="#00685f" />
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 22 }}>
                AI Meal Planner
              </Text>
            </View>

            {/* Prompt */}
            <View className="mb-md">
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder="Ask AI to plan a meal (e.g., 'High protein dinner for post-workout')"
                placeholderTextColor="#6d7a77"
                multiline
                className="rounded-xl border-2 border-transparent bg-surface-container-low p-md font-body-md text-body-md text-on-surface"
                style={{ minHeight: 96, textAlignVertical: "top" }}
                accessibilityLabel="Meal planning prompt"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Generate meal with AI"
                onPress={() => setShowRecommendation(true)}
                className="mt-sm flex-row items-center justify-center gap-xs self-end rounded-full bg-primary px-md py-sm active:scale-95"
              >
                <Text className="font-label-md text-label-md text-on-primary">Generate with AI</Text>
                <MaterialIcons name="bolt" size={18} color="#ffffff" />
              </Pressable>
            </View>

            {/* Photo upload */}
            <View className="mb-md">
              <Text className="mb-sm font-label-md text-label-md text-on-surface-variant">
                Analyze Meal via Photo:
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Upload food photo"
                className="items-center gap-sm rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low p-md active:bg-surface-container"
              >
                <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-container/20">
                  <MaterialIcons name="photo-camera" size={26} color="#00685f" />
                </View>
                <View className="items-center">
                  <Text className="font-label-md text-label-md text-on-surface">
                    Upload Food Photo
                  </Text>
                  <Text className="text-outline" style={{ fontSize: 12 }}>
                    AI will identify ingredients automatically
                  </Text>
                </View>
              </Pressable>
            </View>

            {/* Ingredient chips */}
            <View className="mb-md">
              <Text className="mb-sm font-label-md text-label-md text-on-surface-variant">
                Add ingredients to your meal:
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
              >
                {SUGGESTED_INGREDIENTS.map((ing) => {
                  const on = selected.has(ing);
                  return (
                    <Pressable
                      key={ing}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => toggleIngredient(ing)}
                      className={`rounded-full px-md py-sm active:scale-95 ${
                        on ? "bg-primary-container" : "bg-surface-container-high"
                      }`}
                    >
                      <Text
                        className={`font-label-md text-label-md ${
                          on ? "text-on-primary-container" : "text-on-surface"
                        }`}
                      >
                        {ing}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Manual add */}
              <View className="mt-md flex-row gap-sm">
                <TextInput
                  value={manualIngredient}
                  onChangeText={setManualIngredient}
                  placeholder="Add specific ingredients manually..."
                  placeholderTextColor="#6d7a77"
                  onSubmitEditing={addManual}
                  returnKeyType="done"
                  className="flex-1 rounded-lg border border-outline-variant bg-surface-container-low px-md font-body-md text-body-md text-on-surface"
                  style={{ paddingVertical: 8 }}
                  accessibilityLabel="Add ingredient manually"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add ingredient"
                  onPress={addManual}
                  className="flex-row items-center gap-xs rounded-lg bg-secondary-container px-md active:scale-95"
                >
                  <MaterialIcons name="add" size={20} color="#3a485b" />
                  <Text className="font-label-md text-label-md text-on-secondary-container">Add</Text>
                </Pressable>
              </View>

              {/* Manually-added chips */}
              {extraIngredients.length > 0 ? (
                <View className="mt-sm flex-row flex-wrap gap-sm">
                  {extraIngredients.map((ing) => (
                    <View
                      key={ing}
                      className="flex-row items-center gap-xs rounded-full bg-primary-container/20 px-sm py-xs"
                    >
                      <Text className="font-label-sm text-label-sm text-primary">{ing}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${ing}`}
                        hitSlop={6}
                        onPress={() =>
                          setExtraIngredients((prev) => prev.filter((x) => x !== ing))
                        }
                      >
                        <MaterialIcons name="close" size={14} color="#00685f" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Recommendation (revealed by Generate) */}
            {showRecommendation ? <RecommendationCard onSave={() => router.back()} /> : null}
          </Card>

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
                  <View style={{ width: `${waterPct}%`, height: "100%", backgroundColor: "#00685f" }} />
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
                  <MaterialIcons name="expand-more" size={22} color="#3d4947" />
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
                {MOODS.map((emoji, i) => {
                  const on = i === mood;
                  return (
                    <Pressable
                      key={emoji}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`Mood ${i + 1} of 5`}
                      onPress={() => setMood(i)}
                      className={`h-12 w-12 items-center justify-center rounded-xl border ${
                        on
                          ? "border-primary-container bg-primary-container"
                          : "border-transparent bg-surface-container-low"
                      }`}
                    >
                      <Text style={{ fontSize: 22 }}>{emoji}</Text>
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
                      <View
                        style={{
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: on ? "#00685f" : "#e4e9e7",
                        }}
                      />
                    </Pressable>
                  );
                })}
              </View>
              <View className="mt-xs flex-row justify-between">
                <Text className="text-outline" style={{ fontSize: 10, fontWeight: "700" }}>CALM</Text>
                <Text className="text-outline" style={{ fontSize: 10, fontWeight: "700" }}>INTENSE</Text>
              </View>
            </View>
          </Card>
        </ScrollView>

        {/* Sticky Save & Close */}
        <View className="absolute bottom-6 right-6">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save and close"
            onPress={() => router.back()}
            className="flex-row items-center gap-sm rounded-full bg-primary px-lg py-md active:scale-95"
            style={fabShadow}
          >
            <MaterialIcons name="task-alt" size={22} color="#ffffff" />
            <Text className="font-headline-md text-on-primary" style={{ fontSize: 16 }}>
              Save & Close
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Workout picker modal */}
      <Modal
        visible={workoutPickerOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setWorkoutPickerOpen(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setWorkoutPickerOpen(false)}
        >
          <Pressable className="rounded-t-2xl bg-surface-container-lowest p-md" onPress={() => {}}>
            <Text className="mb-md text-center font-headline-md text-on-surface" style={{ fontSize: 18 }}>
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
                  {on ? <MaterialIcons name="check" size={20} color="#00685f" /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
      style={cardShadow}
    >
      {children}
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-md font-label-md text-label-md uppercase text-outline" style={{ letterSpacing: 1.5 }}>
      {children}
    </Text>
  );
}

function Label({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-xs">
      <MaterialIcons name={icon} size={20} color="#00685f" />
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-8 w-8 items-center justify-center rounded-full border border-outline-variant active:bg-primary/10"
    >
      <MaterialIcons name={icon} size={18} color="#3d4947" />
    </Pressable>
  );
}

function RecommendationCard({ onSave }: { onSave: () => void }) {
  return (
    <View className="overflow-hidden rounded-xl border border-primary/20 bg-primary-container/10">
      <Image
        source={{ uri: RECOMMENDATION.imageUri }}
        className="h-48 w-full"
        resizeMode="cover"
      />
      <View className="gap-md p-md">
        <View>
          <View className="flex-row items-start justify-between gap-sm">
            <Text className="flex-1 font-headline-md text-primary" style={{ fontSize: 20 }}>
              {RECOMMENDATION.title}
            </Text>
            <View className="rounded bg-primary-container px-sm py-xs">
              <Text
                className="font-label-sm uppercase text-on-primary-container"
                style={{ fontSize: 10, letterSpacing: 0.5, fontWeight: "700" }}
              >
                Optimal Choice
              </Text>
            </View>
          </View>
          <Text className="mt-xs font-body-md text-on-surface-variant" style={{ fontStyle: "italic" }}>
            {RECOMMENDATION.tagline}
          </Text>
        </View>

        <View className="flex-row gap-sm">
          {RECOMMENDATION.macros.map((m) => (
            <View key={m.label} className="flex-1 items-center rounded-lg bg-surface/50 p-sm">
              <Text className="uppercase text-outline" style={{ fontSize: 10, fontWeight: "700" }}>
                {m.label}
              </Text>
              <Text className="font-headline-md text-primary" style={{ fontSize: 18 }}>
                {m.value}
              </Text>
            </View>
          ))}
        </View>

        <View className="rounded-lg border border-white/60 bg-surface/40 p-sm">
          <View className="mb-xs flex-row items-center gap-xs">
            <MaterialIcons name="psychology" size={16} color="#00685f" />
            <Text className="font-label-md text-label-md text-primary">AI Reasoning</Text>
          </View>
          <Text className="text-on-surface-variant" style={{ fontSize: 13, lineHeight: 19 }}>
            {RECOMMENDATION.reasoning}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save meal and close"
          onPress={onSave}
          className="flex-row items-center justify-center gap-xs rounded-lg bg-primary py-sm active:scale-[0.98]"
        >
          <MaterialIcons name="save" size={20} color="#ffffff" />
          <Text className="font-headline-md text-on-primary" style={{ fontSize: 16 }}>
            Save & Close
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatHrs(h: number): string {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Shadows — same Platform.select pattern as the other screens.
// ---------------------------------------------------------------------------

const cardShadow =
  Platform.select({
    ios: { shadowColor: "#475569", shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 4 } },
    web: { boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.05)" },
    android: { elevation: 2 },
  }) || {};

const appBarShadow =
  Platform.select({
    ios: { shadowColor: "#000000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    web: { boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.04)" },
    android: { elevation: 3 },
  }) || {};

const fabShadow =
  Platform.select({
    ios: { shadowColor: "#00685f", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    web: { boxShadow: "0px 6px 14px rgba(0, 104, 95, 0.35)" },
    android: { elevation: 8 },
  }) || {};
