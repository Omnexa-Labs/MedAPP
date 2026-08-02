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
//   - glass-card / shadow-sm → the shared <Card />, which casts NO shadow
//     (docs/BRAND.md §Elevation). This screen's private `Card` wrapper — a
//     hand-rolled twin of the primitive that also carried a `cardShadow` — is
//     deleted in favour of it. The sticky "Save & Close" is the ONE surface
//     here that genuinely floats, so it keeps a shadow, retokenised to the
//     sanctioned tight pair.
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
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { DetailShell } from "@/components/shell";
import { Card, ChoiceChip, ChoiceChipRow } from "@/components/ui";
import { Icon } from "@/components/ui/icons/Icon";
import { useTokenColor, useTokenShadow } from "@/lib/tokens";

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
  // Mood glyph colours. Resolved through the token map rather than a Tailwind
  // class, because no cssInterop is registered for icon components.
  const onPrimaryContainer = useTokenColor("on-primary-container");
  // `on-surface-variant` does triple duty here, all three the same role —
  // secondary content on a neutral surface: the unselected mood glyph, the two
  // TextInput placeholders (BRAND: "`on-surface-variant` for placeholders") and
  // the select's chevron. All three were frozen literals (`#6d7a77`, which is
  // light `outline`, and `#3d4947`, which is light `on-surface-variant`).
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  // Brand-accent glyphs that can't be classes (MaterialIcons takes a string).
  const primary = useTokenColor("primary");
  // Glyphs ON the `primary` fill — the "Generate with AI" bolt and the FAB's
  // check. Their `#ffffff` is `on-primary`'s LIGHT value; in dark mode that
  // painted white on #6BD8CB, which is what the capture shows.
  const onPrimary = useTokenColor("on-primary");
  const onSecondaryContainer = useTokenColor("on-secondary-container");
  // The extended FAB's elevation — see FAB_SHADOW at the foot of this file.
  const fabShadow = useTokenShadow("shadow", FAB_SHADOW);
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
  const [mood, setMood] = useState(2); // index into MOODS — 2 is "Neutral"
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
    // ------------------------------------------------------------------
    // DetailShell (safe area + DetailAppBar + body), replacing this screen's
    // hand-rolled `View > StatusBar style="dark" > SafeAreaView` wrapper —
    // one of the eleven screens that froze the status bar to light mode.
    //
    // `backIcon="close"` preserves this screen's task/modal affordance; the
    // dismiss still pops, so no `onBack` override is needed.
    //
    // The bottom inset is left to the SHELL (the default). The sticky
    // "Save & Close" FAB is absolutely positioned inside the body and does
    // NOT render its own `<SafeAreaView edges={["bottom"]}>`, so under the
    // old ["top","left","right"] wrapper its `bottom-6` measured from the
    // raw screen edge and sat in the gesture bar. It now measures from the
    // inset edge, which is the bug the shell's default exists to fix.
    // ------------------------------------------------------------------
    <DetailShell title="Lifestyle Management" backIcon="close">
      {/* `paddingBottom: 120` is KEPT: it reserves room for the sticky
            "Save & Close" FAB below, not for a bottom nav (this screen never
            had one), so nothing about the shell makes it wrong. */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 120,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* AI Meal Planner */}
        <Card>
          <View className="mb-md flex-row items-center gap-xs">
            <MaterialIcons name="auto-awesome" size={22} color={primary} />
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
              placeholderTextColor={onSurfaceVariant}
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
              <MaterialIcons name="bolt" size={18} color={onPrimary} />
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
                <MaterialIcons name="photo-camera" size={26} color={primary} />
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
            {/* The shared ChoiceChip (Figma 11:104), replacing a private pill.
                  TWO disclosed changes, neither of them cosmetic:

                  1. EMPHASIS. This screen selected with `bg-primary-container`
                     (low emphasis) while CommunityHub and Explore used
                     `bg-primary` (high emphasis) for the same control. 11:104
                     draws `color/primary`, so high emphasis wins and THIS
                     SCREEN CHANGES VISUALLY. Worth confirming with the product
                     owner rather than landing silently.
                  2. WRAP, not scroll. The row was a horizontal ScrollView, but
                     it sits inside a padded Card. A scrollable ChoiceChipRow
                     applies BRAND's 16px gutter as its own content inset and so
                     must be full-bleed (BRAND §"Horizontal strips and
                     carousels"); nested in a card's 24px padding it would start
                     the chips 40px in. A wrapping row is the correct in-card
                     treatment, and it is the component's safe default.

                  The 44pt floor now holds too — `py-sm` + `label-md` measured
                  ~38pt. */}
            <ChoiceChipRow>
              {SUGGESTED_INGREDIENTS.map((ing) => (
                <ChoiceChip
                  key={ing}
                  label={ing}
                  selected={selected.has(ing)}
                  onPress={() => toggleIngredient(ing)}
                />
              ))}
            </ChoiceChipRow>

            {/* Manual add */}
            <View className="mt-md flex-row gap-sm">
              <TextInput
                value={manualIngredient}
                onChangeText={setManualIngredient}
                placeholder="Add specific ingredients manually..."
                placeholderTextColor={onSurfaceVariant}
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
                <MaterialIcons name="add" size={20} color={onSecondaryContainer} />
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
                      onPress={() => setExtraIngredients((prev) => prev.filter((x) => x !== ing))}
                    >
                      <MaterialIcons name="close" size={14} color={primary} />
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
                <View
                  className="h-full bg-primary"
                  style={{ width: `${waterPct}%` }}
                />
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

      {/* Sticky Save & Close — an extended FAB.
            CLASSIFIED FLOATING, and the only such surface on this screen. It is
            absolutely positioned over a ScrollView, content passes underneath
            it, and it is not attached to any surface — so it is the FAB role
            docs/BRAND.md §Elevation explicitly permits an effect on, not a
            card. It therefore KEEPS a shadow, but a retokenised one: the
            sanctioned tight `0 2px 6px` at 8%, tinted with the `shadow` token
            through `useTokenShadow`. What went is the literal — `#00685f` at
            35% over a 14px radius was a brand-teal glow, both a hardcoded hex
            (frozen in light mode) and roughly four times the permitted
            strength. */}
      <View className="absolute bottom-6 right-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save and close"
          onPress={() => router.back()}
          className="flex-row items-center gap-sm rounded-full bg-primary px-lg py-md active:scale-95"
          style={fabShadow}
        >
          <MaterialIcons name="task-alt" size={22} color={onPrimary} />
          <Text className="font-headline-md text-on-primary" style={{ fontSize: 16 }}>
            Save & Close
          </Text>
        </Pressable>
      </View>

      {/* Workout picker modal. It used to sit OUTSIDE the SafeAreaView, beside
          it in the root view; it is now inside the shell's body. A <Modal>
          renders into its own native host window, so its position in the tree
          does not affect its layout — the visible result is identical. */}
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

function RecommendationCard({ onSave }: { onSave: () => void }) {
  const primary = useTokenColor("primary");
  const onPrimary = useTokenColor("on-primary");
  return (
    <View className="overflow-hidden rounded-xl border border-primary/20 bg-primary-container/10">
      <Image source={{ uri: RECOMMENDATION.imageUri }} className="h-48 w-full" resizeMode="cover" />
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
          <Text
            className="mt-xs font-body-md text-on-surface-variant"
            style={{ fontStyle: "italic" }}
          >
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

        {/* `border-white/60` was a literal, and the one on this screen that a
            find-and-replace would have got wrong: it is a HAIRLINE on a tinted
            inner panel, not a surface and not label-on-a-fill, so it takes
            `outline-variant` — which is the light hairline BRAND specifies and
            flips to #3D4947 in dark, instead of staying a 60% white edge over a
            dark panel. */}
        <View className="rounded-lg border border-outline-variant bg-surface/40 p-sm">
          <View className="mb-xs flex-row items-center gap-xs">
            <MaterialIcons name="psychology" size={16} color={primary} />
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
          <MaterialIcons name="save" size={20} color={onPrimary} />
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
// Elevation
// ---------------------------------------------------------------------------
//
// `cardShadow` was deleted with the private `Card` wrapper, and `appBarShadow`
// with the hand-rolled app bar — DetailAppBar (Figma 193:120) carries no
// effects. Only the extended FAB remains elevated.

/**
 * Figma's sanctioned `elevation/floating` effect: `0 2px 6px` of the `shadow`
 * token at 8% — the heavier half of BRAND's `0 1px 2px` / `0 2px 6px` pair,
 * since an extended FAB sits furthest from the page. Expressed in design space
 * (CSS blur) and converted to RN's props by `tokenShadow`.
 */
const FAB_SHADOW = { y: 2, blur: 6, opacity: 0.08 } as const;
