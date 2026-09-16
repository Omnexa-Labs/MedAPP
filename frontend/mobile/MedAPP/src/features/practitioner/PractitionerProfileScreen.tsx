import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, ScrollView, Switch, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useNavigation, usePreventRemove, type NavigationAction } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import {
  AvatarWithFallback,
  Button,
  Card,
  InfoCallout,
  Input,
  KeyboardInset,
} from "@/components/ui";
import { ApiError } from "@/types/api";
import { useTokenColor } from "@/lib/tokens";
import { ProfessionalNotice } from "./ProfessionalAccess";
import {
  professionalApi,
  type ProfessionalProfile,
  type ProfessionalChanges,
} from "./professional-api";
import {
  professionalChanges,
  professionalDefaults,
  professionalErrors,
  type ProfessionalForm,
} from "./professional-profile-form";
import { useProfessionalProfile } from "./use-professional-profile";
import { practitionerApi } from "./api";
import { weeklyHours } from "./format";

export function PractitionerProfileScreen() {
  const scope = useProfessionalProfile();
  const client = useQueryClient();
  const { query, kind, owner, revision, isCurrent } = scope;
  if (!owner || !kind)
    return (
      <ProfessionalNotice
        title="Professional account required"
        message="A doctor or nurse account must be activated before you can edit a professional profile. Application approval alone does not activate professional access."
      />
    );
  if (query.isPending)
    return (
      <ProfessionalNotice
        title="Loading professional profile"
        message="Retrieving your saved details…"
        loading
      />
    );
  if (query.error)
    return (
      <ProfessionalNotice
        title={
          query.error instanceof ApiError && query.error.status === 404
            ? "Profile activation needed"
            : "Could not load your profile"
        }
        message="Your saved profile could not be retrieved. Check your application status or try again."
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data?.isActive)
    return (
      <ProfessionalNotice
        title="Professional profile inactive"
        message="You can review your application status. Editing is unavailable while your profile is inactive."
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <ProfessionalProfileEditor
      key={`${owner}:${revision}:${kind}`}
      profile={query.data}
      isCurrent={isCurrent}
      refreshing={query.isFetching}
      onSave={async (changes, signal) => {
        const updated = await professionalApi.updateSelf(kind, owner, changes, {
          signal,
          isSessionCurrent: isCurrent,
        });
        if (signal.aborted || !isCurrent()) throw new Error("Profile session ended");
        client.setQueryData(scope.queryKey, updated);
        void client.invalidateQueries({ queryKey: ["care"] });
        void client.invalidateQueries({ queryKey: ["practitioner", "profile", owner, revision] });
        return updated;
      }}
    >
      {kind === "doctors" ? <ProfessionalHours profileId={query.data.id} scope={scope} /> : null}
    </ProfessionalProfileEditor>
  );
}

function ProfessionalHours({
  profileId,
  scope,
}: {
  profileId: string;
  scope: ReturnType<typeof useProfessionalProfile>;
}) {
  const query = useQuery({
    queryKey: ["practitioner", "availability", scope.owner, scope.revision, profileId],
    gcTime: 0,
    queryFn: ({ signal }) =>
      practitionerApi.listAvailability(profileId, { signal, isSessionCurrent: scope.isCurrent }),
  });
  const hours = weeklyHours(query.data ?? []);
  return (
    <Card className="gap-sm">
      <Text
        accessibilityRole="header"
        className="font-headline-md text-headline-md text-on-surface"
      >
        Weekly hours
      </Text>
      <Text className="font-body-md text-body-md text-on-surface-variant">
        {query.isPending
          ? "Loading consulting hours…"
          : query.error
            ? "Could not load consulting hours."
            : (hours.label ?? "No availability set.")}
      </Text>
      {!query.error && !query.isPending && hours.timezone ? (
        <Text className="font-body-sm text-body-sm text-on-surface-variant">{hours.timezone}</Text>
      ) : null}
      {!query.error && !query.isPending && hours.closedLabel ? (
        <Text className="font-body-sm text-body-sm text-on-surface-variant">
          {hours.closedLabel}
        </Text>
      ) : null}
      {query.error ? (
        <Button
          label="Retry consulting hours"
          variant="outline"
          onPress={() => void query.refetch()}
        />
      ) : null}
    </Card>
  );
}

export function ProfessionalProfileEditor({
  profile,
  onSave,
  isCurrent,
  refreshing = false,
  children,
}: {
  profile: ProfessionalProfile;
  onSave: (changes: ProfessionalChanges, signal: AbortSignal) => Promise<ProfessionalProfile>;
  isCurrent: () => boolean;
  refreshing?: boolean;
  children?: ReactNode;
}) {
  const [baseline, setBaseline] = useState(profile);
  const [form, setForm] = useState(() => professionalDefaults(profile));
  const [errors, setErrors] = useState<ReturnType<typeof professionalErrors>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pendingExit, setPendingExit] = useState<NavigationAction | null>(null);
  const flight = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const seenProfile = useRef(profile);
  const navigation = useNavigation();
  const scrim = useTokenColor("scrim", 0.4);
  const dirty = Object.keys(professionalChanges(baseline, form)).length > 0;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      flight.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (profile !== seenProfile.current) {
      seenProfile.current = profile;
      if (!dirty && !saving) {
        setBaseline(profile);
        setForm(professionalDefaults(profile));
        setSaved(false);
      }
    }
  }, [profile, dirty, saving]);
  usePreventRemove((dirty || saving) && isCurrent(), ({ data }) => {
    if (!flight.current) setPendingExit(data.action);
  });
  const canAct = () => alive.current && isCurrent();
  const update = <K extends keyof ProfessionalForm>(key: K, value: ProfessionalForm[K]) => {
    setForm((old) => ({ ...old, [key]: value }));
    setSaved(false);
    setError(null);
  };
  const save = async () => {
    if (flight.current || refreshing || !canAct()) return;
    const validation = professionalErrors(form);
    setErrors(validation);
    if (Object.keys(validation).length) {
      setError("Check the highlighted fields.");
      return;
    }
    const changes = professionalChanges(baseline, form);
    if (!Object.keys(changes).length) return;
    const controller = new AbortController();
    flight.current = controller;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await onSave(changes, controller.signal);
      if (!canAct()) return;
      setBaseline(result);
      setForm(professionalDefaults(result));
      setSaved(true);
    } catch {
      if (canAct()) setError("Could not save your profile. Your edits are still here; try again.");
    } finally {
      flight.current = null;
      if (canAct()) setSaving(false);
    }
  };
  const leave = () => {
    if (!saving) {
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/onboarding-status" as Href);
    }
  };
  const fields: {
    key: Exclude<keyof ProfessionalForm, "isListable">;
    label: string;
    maxLength: number;
    multiline?: boolean;
  }[] = [
    { key: "firstName", label: "Professional first name", maxLength: 255 },
    { key: "lastName", label: "Professional last name", maxLength: 255 },
    { key: "specialty", label: "Clinical specialty", maxLength: 255 },
    { key: "bio", label: "Clinical bio", maxLength: 10000, multiline: true },
    { key: "languages", label: "Languages (separate with commas)", maxLength: 2500 },
  ];
  const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
  return (
    <DetailShell title="Professional profile" onBack={leave} testID="professional.editor">
      <KeyboardInset>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        >
          <Text
            accessibilityRole="header"
            className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface"
          >
            Manage professional identity
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            Keep the details patients see up to date. Your account details and professional profile
            are saved separately.
          </Text>
          <View className="flex-row gap-sm">
            <Button
              className="flex-1"
              label={preview ? "Edit details" : "Preview profile"}
              variant="outline"
              onPress={() => setPreview(!preview)}
              disabled={saving}
            />
            <Button
              className="flex-1"
              label="Save changes"
              loading={saving}
              disabled={!dirty || refreshing || saving}
              onPress={() => void save()}
            />
          </View>
          {refreshing ? (
            <Text className="font-body-sm text-body-sm text-on-surface-variant">
              Checking current profile…
            </Text>
          ) : null}
          {error ? <InfoCallout tone="error">{error}</InfoCallout> : null}
          {saved ? (
            <Text accessibilityRole="alert" className="font-body-md text-body-md text-primary">
              Professional profile saved.
            </Text>
          ) : null}
          {preview ? (
            <Card className="gap-md">
              <Text className="font-label-md text-label-md text-on-surface">
                Preview · {dirty ? "Unsaved changes" : "Saved details"}
              </Text>
              <AvatarWithFallback
                uri={baseline.photoUrl}
                label={name}
                initials={`${form.firstName[0] ?? ""}${form.lastName[0] ?? ""}`}
                size={80}
              />
              <Text className="font-headline-md text-headline-md text-on-surface">
                {baseline.kind === "doctors" ? "Dr. " : ""}
                {name}
              </Text>
              <Text className="font-body-md text-body-md text-on-surface-variant">
                {form.specialty.trim() || (baseline.kind === "doctors" ? "Doctor" : "Nurse")}
              </Text>
              <Text className="font-body-md text-body-md text-on-surface">
                {form.bio.trim() || "No biography provided."}
              </Text>
              <Text className="font-body-sm text-body-sm text-on-surface-variant">
                Languages: {form.languages.trim() || "Not provided"}
              </Text>
              <Text className="font-body-sm text-body-sm text-on-surface-variant">
                {form.isListable
                  ? "Visible in Find Care after saving"
                  : "Hidden from Find Care after saving"}
              </Text>
            </Card>
          ) : (
            <Card className="gap-md">
              {fields.map((field) => (
                <View key={field.key} className="gap-xs">
                  <Text className="font-label-md text-label-md text-on-surface">{field.label}</Text>
                  <Input
                    accessibilityLabel={field.label}
                    accessibilityHint={errors[field.key]}
                    value={form[field.key]}
                    onChangeText={(value) => update(field.key, value)}
                    hasError={!!errors[field.key]}
                    maxLength={field.maxLength}
                    multiline={field.multiline}
                    editable={!saving}
                  />
                  {errors[field.key] ? (
                    <Text className="font-body-sm text-body-sm text-error">
                      {errors[field.key]}
                    </Text>
                  ) : null}
                </View>
              ))}
              <View className="flex-row items-center justify-between gap-sm">
                <Text className="font-label-md text-label-md text-on-surface">
                  Visible in Find Care
                </Text>
                <Switch
                  accessibilityLabel="Visible in Find Care"
                  value={form.isListable}
                  disabled={saving}
                  onValueChange={(value) => update("isListable", value)}
                />
              </View>
              <Text className="font-body-sm text-body-sm text-on-surface-variant">
                Visibility changes take effect when saved. Existing appointments are unaffected.
              </Text>
            </Card>
          )}
          {children}
          <Button
            label="Account settings and sign out"
            variant="outline"
            disabled={saving}
            onPress={() => router.push("/(app)/settings" as Href)}
          />
          <Button
            label="Credential application status"
            variant="outline"
            disabled={saving}
            onPress={() => router.push("/(app)/onboarding-status" as Href)}
          />
        </ScrollView>
      </KeyboardInset>
      <Modal
        visible={!!pendingExit}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingExit(null)}
      >
        <View className="flex-1 justify-center p-md" style={{ backgroundColor: scrim }}>
          <Card className="gap-md">
            <Text className="font-headline-md text-headline-md text-on-surface">
              Discard unsaved changes?
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              Your professional profile has not been saved.
            </Text>
            <Button label="Keep editing" onPress={() => setPendingExit(null)} />
            <Button
              label="Discard changes"
              variant="outline"
              onPress={() => {
                const action = pendingExit;
                setPendingExit(null);
                if (action) navigation.dispatch(action);
              }}
            />
          </Card>
        </View>
      </Modal>
    </DetailShell>
  );
}
