// Sign-up Step 2 — "Tell us about yourself".
//
// Translated from the Stitch HTML. Notable translation calls:
//   - The Stitch md:grid-cols-2 bento (DOB + blood type side-by-side) →
//     single column on phone; side-by-side at this width is cramped.
//   - <input type="date"> doesn't exist in RN. Captured as three numeric
//     inputs (DD / MM / YYYY) and normalized to ISO yyyy-mm-dd before the
//     schema sees it. Swap to @react-native-community/datetimepicker later
//     when we're ready to add the dependency.
//   - <select> → an inline chip grid for blood type (8 options, fits cleanly
//     and avoids a modal). Same UX pattern as the gender chips above.
//   - Gender chips use the same selected/unselected style as the HTML
//     :checked variant.
//   - Goal cards: outlined card → teal ring + tinted bg when selected,
//     matching the HTML `:has(input:checked)` rule.
//   - Bottom hero image + help button: dropped (no destination yet, and the
//     image was filler on mobile).

import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MaterialIcons } from "@expo/vector-icons";
import {
  BloodTypes,
  Genders,
  HealthGoals,
  SignUpStep2Schema,
  type BloodType,
  type Gender,
  type HealthGoal,
  type SignUpStep2Values,
} from "@/features/auth/schema";

interface Props {
  onBack?: () => void;
  onNext?: (values: SignUpStep2Values) => void;
}

const GENDER_LABELS: Record<Gender, string> = {
  female: "Female",
  male: "Male",
  nonbinary: "Non-binary",
  other: "Other",
};

const GOAL_META: Record<
  HealthGoal,
  { title: string; description: string; icon: React.ComponentProps<typeof MaterialIcons>["name"] }
> = {
  meds: {
    title: "Manage Meds",
    description: "Stay on top of prescriptions with timely reminders.",
    icon: "medication",
  },
  vitals: {
    title: "Track Vitals",
    description: "Monitor heart rate, blood pressure, and more.",
    icon: "monitor-heart",
  },
  tele: {
    title: "Telemedicine",
    description: "Consult with specialists from home.",
    icon: "video-camera-front",
  },
  wellness: {
    title: "Wellness",
    description: "Improve sleep, diet, and mental wellbeing.",
    icon: "spa",
  },
};

export function SignUpStep2Screen({ onBack, onNext }: Props) {
  // DOB is split into three inputs and composed into an ISO string the schema
  // can validate. RHF stores the composed value under `dateOfBirth`.
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");

  const composedDob = useMemo(() => {
    if (!dobDay || !dobMonth || !dobYear) return "";
    const dd = dobDay.padStart(2, "0");
    const mm = dobMonth.padStart(2, "0");
    return `${dobYear}-${mm}-${dd}`;
  }, [dobDay, dobMonth, dobYear]);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignUpStep2Values>({
    resolver: zodResolver(SignUpStep2Schema),
    defaultValues: {
      dateOfBirth: "",
      bloodType: undefined,
      gender: undefined,
      primaryGoal: undefined,
    },
    mode: "onSubmit",
  });

  const onSubmit = () => {
    // Compose DOB at submit time so a user who taps Continue without first
    // blurring the year field still gets validated.
    setValue("dateOfBirth", composedDob, { shouldValidate: false });
    handleSubmit((values) => {
      onNext?.(values);
    })();
  };

  // Keep the composed ISO in sync with the three inputs so the resolver sees
  // it when the user taps Continue.
  const handleDobBlur = () => {
    setValue("dateOfBirth", composedDob, { shouldValidate: false });
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* Decorative corner blobs — match Step 1 / SignIn for continuity. */}
      <View
        pointerEvents="none"
        className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary-fixed opacity-10"
      />
      <View
        pointerEvents="none"
        className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-tertiary-fixed opacity-[0.05]"
      />

      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 64,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="mx-auto w-full max-w-[480px]">
              {/* Top row: back + step indicator. */}
              <View className="mb-md flex-row items-center justify-between">
                <Pressable
                  onPress={onBack}
                  accessibilityRole="button"
                  accessibilityLabel="Back to step 1"
                  hitSlop={8}
                  className="flex-row items-center gap-xs active:opacity-70"
                >
                  <MaterialIcons name="arrow-back" size={20} color="#3d4947" />
                  <Text className="font-label-md text-label-md text-on-surface-variant">
                    Back
                  </Text>
                </Pressable>
                <Text className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Step 2 of 3
                </Text>
              </View>

              {/* Progress bar */}
              <View className="mb-lg">
                <View className="mb-sm flex-row items-center justify-between">
                  <Text className="font-label-md text-label-md text-primary">
                    Personal Details
                  </Text>
                  <Text className="font-label-sm text-label-sm text-on-surface-variant">
                    66%
                  </Text>
                </View>
                <View className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
                  <View
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: "66%",
                      shadowColor: "#00685f",
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 0 },
                    }}
                  />
                </View>
              </View>

              {/* Header */}
              <View className="mb-lg items-center">
                <Text className="font-headline-lg-mobile text-headline-lg-mobile text-center text-on-surface">
                  Tell us about yourself
                </Text>
                <Text className="font-body-md text-body-md mt-sm max-w-[320px] text-center text-on-surface-variant">
                  This helps us personalize your health journey and surface the most
                  relevant care recommendations.
                </Text>
              </View>

              {/* Date of Birth */}
              <Card>
                <Text className="font-label-md text-label-md mb-base text-on-surface">
                  Date of Birth
                </Text>
                <View className="flex-row gap-sm">
                  <DobInput
                    placeholder="DD"
                    maxLength={2}
                    value={dobDay}
                    onChangeText={setDobDay}
                    onBlur={handleDobBlur}
                  />
                  <DobInput
                    placeholder="MM"
                    maxLength={2}
                    value={dobMonth}
                    onChangeText={setDobMonth}
                    onBlur={handleDobBlur}
                  />
                  <DobInput
                    placeholder="YYYY"
                    maxLength={4}
                    flex={1.5}
                    value={dobYear}
                    onChangeText={setDobYear}
                    onBlur={handleDobBlur}
                  />
                </View>
                {/* Hidden controller — surfaces dateOfBirth errors */}
                <Controller
                  control={control}
                  name="dateOfBirth"
                  render={() => <View />}
                />
                {errors.dateOfBirth && (
                  <Text className="font-label-sm text-label-sm mt-xs text-error">
                    {errors.dateOfBirth.message}
                  </Text>
                )}
              </Card>

              {/* Blood type */}
              <View className="mt-md">
                <Card>
                  <Text className="font-label-md text-label-md mb-base text-on-surface">
                    Blood Type (Optional)
                  </Text>
                  <Controller
                    control={control}
                    name="bloodType"
                    render={({ field }) => (
                      <View className="flex-row flex-wrap gap-sm">
                        {BloodTypes.map((bt) => (
                          <Chip
                            key={bt}
                            label={bt}
                            selected={field.value === bt}
                            onPress={() =>
                              field.onChange(
                                field.value === bt ? undefined : (bt as BloodType),
                              )
                            }
                          />
                        ))}
                      </View>
                    )}
                  />
                </Card>
              </View>

              {/* Gender */}
              <View className="mt-md">
                <Card>
                  <Text className="font-label-md text-label-md mb-md text-on-surface">
                    Gender Identification
                  </Text>
                  <Controller
                    control={control}
                    name="gender"
                    render={({ field }) => (
                      <View className="flex-row flex-wrap gap-sm">
                        {Genders.map((g) => (
                          <Chip
                            key={g}
                            label={GENDER_LABELS[g]}
                            selected={field.value === g}
                            onPress={() => field.onChange(g)}
                          />
                        ))}
                      </View>
                    )}
                  />
                  {errors.gender && (
                    <Text className="font-label-sm text-label-sm mt-sm text-error">
                      {errors.gender.message}
                    </Text>
                  )}
                </Card>
              </View>

              {/* Primary goal */}
              <View className="mt-md">
                <Text className="font-label-md text-label-md mb-sm ml-xs text-on-surface">
                  Primary Health Goal
                </Text>
                <Controller
                  control={control}
                  name="primaryGoal"
                  render={({ field }) => (
                    <View className="gap-sm">
                      {HealthGoals.map((goal) => (
                        <GoalCard
                          key={goal}
                          icon={GOAL_META[goal].icon}
                          title={GOAL_META[goal].title}
                          description={GOAL_META[goal].description}
                          selected={field.value === goal}
                          onPress={() => field.onChange(goal)}
                        />
                      ))}
                    </View>
                  )}
                />
                {errors.primaryGoal && (
                  <Text className="font-label-sm text-label-sm mt-xs ml-xs text-error">
                    {errors.primaryGoal.message}
                  </Text>
                )}
              </View>

              {/* Privacy reassurance — keeps the spirit of the Stitch footer
                  image caption without the desktop-only hero image. */}
              <View className="mt-lg flex-row items-center gap-sm rounded-xl bg-surface-container-low p-md">
                <MaterialIcons name="lock-outline" size={20} color="#00685f" />
                <Text className="font-label-sm text-label-sm flex-1 italic text-on-surface-variant">
                  Your medical data is encrypted and never shared without your consent.
                </Text>
              </View>

              {/* Continue */}
              <View className="pt-lg">
                <Pressable
                  testID="signup.step2.next"
                  accessibilityRole="button"
                  accessibilityLabel="Continue to step 3"
                  onPress={onSubmit}
                  disabled={isSubmitting}
                  className="w-full flex-row items-center justify-center gap-base rounded-full bg-primary px-lg py-4 active:scale-[0.98]"
                  style={({ pressed }) => ({
                    opacity: isSubmitting ? 0.6 : 1,
                    backgroundColor: pressed ? "#008378" : "#00685f",
                    shadowColor: "#00685f",
                    shadowOpacity: 0.25,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 6,
                  })}
                >
                  <Text className="font-label-md text-label-md text-on-primary">Continue</Text>
                  <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />
                </Pressable>
                <Text className="font-label-sm text-label-sm mt-md text-center text-on-surface-variant">
                  You can always update these later in your profile settings.
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local primitives — promote to components/ui/ once a third screen uses them.
// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-md"
      style={{
        shadowColor: "#475569",
        shadowOpacity: 0.05,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
    >
      {children}
    </View>
  );
}

function DobInput({
  placeholder,
  maxLength,
  flex = 1,
  value,
  onChangeText,
  onBlur,
}: {
  placeholder: string;
  maxLength: number;
  flex?: number;
  value: string;
  onChangeText: (v: string) => void;
  onBlur: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      className="rounded-lg bg-surface-container"
      style={{
        flex,
        borderWidth: focused ? 2 : 0,
        borderColor: focused ? "#00685f" : "transparent",
      }}
    >
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#bcc9c6"
        value={value}
        onChangeText={(v) => onChangeText(v.replace(/[^0-9]/g, ""))}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur();
        }}
        keyboardType="number-pad"
        maxLength={maxLength}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          color: "#171d1c",
          fontSize: 16,
          lineHeight: 20,
          textAlign: "center",
        }}
      />
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`rounded-full border px-md py-sm ${
        selected
          ? "border-primary bg-primary"
          : "border-outline-variant bg-surface-container-low"
      } active:scale-95`}
    >
      <Text
        className={`font-label-md text-label-md ${
          selected ? "text-on-primary" : "text-on-surface-variant"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function GoalCard({
  icon,
  title,
  description,
  selected,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-row items-start gap-md rounded-xl border p-md active:scale-[0.99] ${
        selected
          ? "border-primary bg-primary-container/10"
          : "border-outline-variant/50 bg-surface-container-lowest"
      }`}
      style={{
        shadowColor: "#475569",
        shadowOpacity: selected ? 0.08 : 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 2 },
        elevation: selected ? 3 : 1,
      }}
    >
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary-container/20">
        <MaterialIcons name={icon} size={22} color="#00685f" />
      </View>
      <View className="flex-1">
        <Text className="font-label-md text-label-md text-on-surface">{title}</Text>
        <Text className="font-label-sm text-label-sm mt-xs text-on-surface-variant">
          {description}
        </Text>
      </View>
      <View
        className={`mt-1 h-5 w-5 items-center justify-center rounded-full border-2 ${
          selected ? "border-primary bg-primary" : "border-outline-variant bg-transparent"
        }`}
      >
        {selected ? <MaterialIcons name="check" size={12} color="#ffffff" /> : null}
      </View>
    </Pressable>
  );
}
