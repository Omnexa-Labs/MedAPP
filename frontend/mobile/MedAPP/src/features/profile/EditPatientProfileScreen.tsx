import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, View } from "react-native";
import { useNavigation, usePreventRemove, type NavigationAction } from "@react-navigation/native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DetailShell } from "@/components/shell/DetailShell";
import { Button, Card, ChoiceChip, InfoCallout, Input, KeyboardInset } from "@/components/ui";
import { BloodTypes, Genders, HealthGoals } from "@/features/auth/schema";
import type { UpdateProfilePayload } from "@/features/auth/api";
import { ApiError } from "@/types/api";
import type { User } from "@/types/user";
import { useTokenColor } from "@/lib/tokens";
import {
  createProfileSchema,
  GENDER_LABELS,
  GOAL_LABELS,
  profileChanges,
  profileDefaults,
  type ProfileFormValues,
} from "./profile-form";

interface Props {
  user: User;
  onSave: (changes: UpdateProfilePayload) => Promise<User>;
  onBack: () => void;
}

// Extends the existing profile and signup form treatments. The references have
// an Edit Profile affordance but no dedicated patient editor frame.
export function EditPatientProfileScreen({ user, onSave, onBack }: Props) {
  const schema = useMemo(() => createProfileSchema(user), [user]);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: profileDefaults(user),
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pendingExit, setPendingExit] = useState<NavigationAction | null>(null);
  const inFlight = useRef(false);
  const navigation = useNavigation();
  const scrim = useTokenColor("scrim", 0.4);
  const primary = useTokenColor("primary");

  usePreventRemove(isDirty || isSubmitting, ({ data }) => {
    if (!inFlight.current) setPendingExit(data.action);
  });

  const submit = () => {
    // Lock before asynchronous validation: a second tap must not start another
    // handleSubmit that can clear isSubmitting while the first save is pending.
    if (inFlight.current) return;
    inFlight.current = true;
    return handleSubmit(
      async (values) => {
        setError(null);
        setSaved(false);
        try {
          const changes = profileChanges(user, values);
          const updated = Object.keys(changes).length ? await onSave(changes) : user;
          reset(profileDefaults(updated));
          setSaved(true);
        } catch (err) {
          setError(
            err instanceof ApiError && err.isNetwork
              ? "Couldn't save your profile. Check your connection and try again."
              : err instanceof ApiError && err.status === 422
                ? "Some details weren't accepted. Check your entries and try again."
                : err instanceof ApiError && err.isUnauthorized
                  ? "Your session has ended. Sign in again to update your profile."
                  : "Couldn't save your profile. Your entries are still here; try again.",
          );
        } finally {
          inFlight.current = false;
        }
      },
      () => {
        inFlight.current = false;
        setSaved(false);
        setError("Check the highlighted fields before saving.");
      },
    )();
  };

  const choices = [
    { name: "gender", label: "Gender", options: Genders, labels: GENDER_LABELS },
    { name: "bloodType", label: "Blood type (self-reported)", options: BloodTypes, labels: {} },
    {
      name: "primaryGoal",
      label: "Primary health goal",
      options: HealthGoals,
      labels: GOAL_LABELS,
    },
  ] as const;

  return (
    <DetailShell
      title="Edit profile"
      onBack={() => {
        if (!inFlight.current) onBack();
      }}
      testID="profile.editor"
    >
      <KeyboardInset>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="gap-md p-md"
          className="flex-1"
        >
          <Text className="font-body-md text-body-md text-on-surface-variant">
            Keep your personal details up to date. Changes are saved when you tap Save changes.
          </Text>
          <Card className="gap-md">
            <Text
              accessibilityRole="header"
              className="font-headline-md text-headline-md text-on-surface"
            >
              Your name
            </Text>
            {(
              [
                ["firstName", "First name"],
                ["lastName", "Last name (optional)"],
              ] as const
            ).map(([name, label]) => (
              <View key={name} className="gap-2">
                <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
                <Controller
                  control={control}
                  name={name}
                  render={({ field }) => (
                    <Input
                      ref={field.ref}
                      accessibilityLabel={label}
                      accessibilityHint={errors[name]?.message}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      editable={!isSubmitting}
                      autoCapitalize="words"
                      autoCorrect={false}
                      hasError={!!errors[name]}
                    />
                  )}
                />
                <FieldError message={errors[name]?.message} />
              </View>
            ))}
            <View className="gap-1">
              <Text className="font-label-md text-label-md text-on-surface">Email address</Text>
              <Text className="font-body-md text-body-md text-on-surface-variant" selectable>
                {user.email}
              </Text>
            </View>
          </Card>
          <Card className="gap-md">
            <Text
              accessibilityRole="header"
              className="font-headline-md text-headline-md text-on-surface"
            >
              Personal details
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              These details are optional. Clear the date or choose Not provided to remove a saved
              value.
            </Text>
            <View className="gap-2">
              <Text className="font-label-md text-label-md text-on-surface">Date of birth</Text>
              <Controller
                control={control}
                name="dateOfBirth"
                render={({ field }) => (
                  <Input
                    ref={field.ref}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    accessibilityLabel="Date of birth"
                    accessibilityHint={
                      errors.dateOfBirth?.message ?? "Day, month and year, separated by slashes"
                    }
                    placeholder="DD / MM / YYYY"
                    editable={!isSubmitting}
                    hasError={!!errors.dateOfBirth}
                    autoCorrect={false}
                  />
                )}
              />
              <FieldError message={errors.dateOfBirth?.message} />
            </View>
            {choices.map(({ name, label, options, labels }) => (
              <View key={name} className="gap-2">
                <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
                <Controller
                  control={control}
                  name={name}
                  render={({ field }) => {
                    const available: readonly string[] = options;
                    const original = user[name];
                    const values = [
                      "",
                      ...available,
                      ...(original && !available.includes(original) ? [original] : []),
                    ];
                    return (
                      <View
                        className="flex-row flex-wrap gap-2"
                        accessibilityRole="radiogroup"
                        accessibilityLabel={label}
                      >
                        {values.map((value) => (
                          <ChoiceChip
                            key={value}
                            role="radio"
                            label={
                              value
                                ? ((labels as Record<string, string>)[value] ?? value)
                                : "Not provided"
                            }
                            accessibilityLabel={`${label}: ${value ? ((labels as Record<string, string>)[value] ?? value) : "Not provided"}`}
                            selected={field.value === value}
                            disabled={isSubmitting}
                            onPress={() => field.onChange(value)}
                          />
                        ))}
                      </View>
                    );
                  }}
                />
                <FieldError message={errors[name]?.message} />
              </View>
            ))}
          </Card>
          {error ? (
            <View accessibilityRole="alert" accessibilityLiveRegion="assertive">
              <InfoCallout tone="error">{error}</InfoCallout>
            </View>
          ) : null}
          {saved && !isDirty ? (
            <View accessibilityLiveRegion="polite">
              <InfoCallout>Profile saved.</InfoCallout>
            </View>
          ) : null}
          {isSubmitting ? (
            <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
              <ActivityIndicator color={primary} />
              <Text className="font-body-md text-body-md text-on-surface">
                Saving your profile…
              </Text>
            </View>
          ) : null}
          <Button
            label="Save changes"
            onPress={submit}
            disabled={!isDirty || isSubmitting}
            loading={isSubmitting}
            pill={false}
            shadow={false}
            size="cta"
          />
          <Button
            label={isDirty ? "Cancel" : "Back to profile"}
            variant="outline"
            onPress={onBack}
            disabled={isSubmitting}
            pill={false}
            shadow={false}
            size="cta"
          />
        </ScrollView>
      </KeyboardInset>
      <Modal
        visible={pendingExit !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingExit(null)}
      >
        <View className="flex-1 justify-center p-md" style={{ backgroundColor: scrim }}>
          <Card className="gap-md" accessibilityViewIsModal>
            <Text
              accessibilityRole="header"
              className="font-headline-md text-headline-md text-on-surface"
            >
              Discard changes?
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Your changes haven't been saved.
            </Text>
            <Button
              label="Keep editing"
              onPress={() => setPendingExit(null)}
              pill={false}
              shadow={false}
            />
            <Button
              label="Discard changes"
              variant="outline"
              onPress={() => {
                const action = pendingExit;
                setPendingExit(null);
                if (action) navigation.dispatch(action);
              }}
              pill={false}
              shadow={false}
            />
          </Card>
        </View>
      </Modal>
    </DetailShell>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="font-label-sm text-label-sm text-error"
    >
      {message}
    </Text>
  ) : null;
}
