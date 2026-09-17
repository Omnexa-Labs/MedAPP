import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { usePreventRemove } from "@react-navigation/native";
import { randomUUID } from "expo-crypto";
import { Button, Card, InfoCallout, Input } from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { ApiError } from "@/types/api";
import { type RequestOptions } from "@/lib/api/client";
import { medicationApi, courseLabel, type Command, type Course, type Dose } from "./medication-api";

export const text = "font-body-md text-body-md text-on-surface";
export type Scope = ReturnType<typeof useSessionScope>;
export function back() {
  if (router.canGoBack()) router.back();
  else router.replace("/(app)/active-medications" as Href);
}
export function Field({
  label,
  value,
  onChange,
  disabled = false,
  maxLength = 255,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <View className="gap-xs">
      <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
      <Input
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        maxLength={maxLength}
      />
    </View>
  );
}
export function Paging({
  offset,
  next,
  onPage,
  disabled = false,
}: {
  offset: number;
  next?: number | null;
  onPage: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <View className="gap-sm">
      {offset > 0 ? (
        <Button
          label="Previous page"
          variant="outline"
          disabled={disabled}
          onPress={() => onPage(Math.max(0, offset - 25))}
        />
      ) : null}
      {next != null ? (
        <Button label="Next page" disabled={disabled} onPress={() => onPage(next)} />
      ) : null}
    </View>
  );
}
export function CourseContents({ course }: { course: Course }) {
  const m = course.medicine;
  return (
    <Card className="gap-sm">
      <Text
        accessibilityRole="header"
        className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface"
      >
        {m.drug_name}
      </Text>
      <Text className={text}>
        {m.strength} · {m.form}
      </Text>
      <Text className={text}>
        {course.source === "prescribed"
          ? `Prescribed by ${course.prescriber_name}`
          : "Self-reported medicine"}
      </Text>
      <Text className={text}>
        {m.dose} · {m.route} · {m.frequency}
      </Text>
      {m.duration ? <Text className={text}>Directions duration: {m.duration}</Text> : null}
      {m.instructions ? <Text className={text}>{m.instructions}</Text> : null}
      <Text className={text}>Tracking: {courseLabel(course)}</Text>
      <Text className={text}>
        Planned dates: {course.start_date}
        {course.end_date ? ` to ${course.end_date}` : " · no end date set"}
      </Text>
      <Text className={text}>
        {course.daily_times.length
          ? `Daily tracking: ${course.daily_times.join(", ")}`
          : "Manual dose tracking"}{" "}
        · {course.timezone}
      </Text>
    </Card>
  );
}
export function useMedicationQuery<T>(
  scope: Scope,
  key: unknown[],
  fetch: (options: RequestOptions) => Promise<T>,
  enabled = true,
) {
  const query = useQuery({
    queryKey: ["medications", scope.owner, scope.revision, ...key],
    enabled: !!scope.owner && enabled,
    gcTime: 0,
    staleTime: 0,
    queryFn: ({ signal }) => fetch({ signal, isSessionCurrent: scope.isCurrent }),
  });
  useFocusEffect(
    useCallback(() => {
      if (scope.owner && enabled) void query.refetch();
    }, [scope.owner, enabled, query.refetch]),
  );
  return query;
}
export function useMedicationWrite(scope: Scope, saved: (result: Course | Dose) => Promise<void>) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<Command | null>(null),
    [stale, setStale] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () => mounted.current && scope.isCurrent();
  usePreventRemove(busy && scope.isCurrent(), () => {});
  async function execute(command: Command) {
    if (pending.current || !current() || !scope.owner) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    let acknowledged = false;
    try {
      const result = await medicationApi.write(scope.owner, command, { isSessionCurrent: current });
      acknowledged = true;
      if (!current()) return;
      await saved(result);
      if (!current()) return;
      setUncertain(null);
      setStale(false);
      setMessage("Saved to your medication record.");
    } catch (failure) {
      if (!current()) return;
      setError(
        failure instanceof ApiError ? failure.message : "The saved result could not be confirmed.",
      );
      if (
        acknowledged ||
        !(failure instanceof ApiError) ||
        failure.status === 0 ||
        failure.status === 408 ||
        failure.status >= 500
      )
        setUncertain(command);
      else {
        setUncertain(null);
        if (failure.status === 409) setStale(true);
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    busy,
    error,
    message,
    stale,
    uncertain,
    locked: busy || !!uncertain || stale,
    send: (command: Omit<Command, "key">) => {
      if (!busy && !uncertain && !stale) void execute({ ...command, key: randomUUID() });
    },
    retry: () => {
      if (uncertain) void execute(uncertain);
    },
    reloaded: () => {
      setStale(false);
      setError(null);
      setMessage(null);
    },
  };
}
export function WriteFeedback({
  write,
  reload,
}: {
  write: ReturnType<typeof useMedicationWrite>;
  reload: () => Promise<void>;
}) {
  return (
    <View className="gap-sm">
      {write.error ? <InfoCallout tone="error">{write.error}</InfoCallout> : null}
      {write.message ? (
        <Text accessibilityLiveRegion="polite" className={text}>
          {write.message}
        </Text>
      ) : null}
      {write.uncertain ? (
        <>
          <InfoCallout>
            The request may have saved. Retry the same request before making another change. If you
            leave, check your saved history before adding another entry.
          </InfoCallout>
          <Button label="Retry the same request" disabled={write.busy} onPress={write.retry} />
        </>
      ) : null}
      {write.stale ? <Button label="Reload saved record" onPress={() => void reload()} /> : null}
    </View>
  );
}
