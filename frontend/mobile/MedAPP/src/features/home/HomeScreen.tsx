// Patient home: live appointments and wellness, with explicit loading, empty and retry states.
import { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSessionScope } from "@/hooks/use-session-scope";
import { PatientShell } from "@/components/shell";
import {
  AvatarWithFallback,
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  Icon,
  InfoCallout,
  SkeletonCard,
  type ChromeIconName,
} from "@/components/ui";
import { useTokenColor, type ColorToken } from "@/lib/tokens";
import { appointmentsApi, type Appointment } from "@/features/appointments/api";
import { wearablesApi } from "@/features/wearables/api";
import { dailyTotalFor, localDayKey } from "@/features/wearables/daily";

function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;

  const day = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

function initialsOf(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function doctorName(a: Appointment): string {
  return a.doctor?.name ?? "Unknown clinician";
}

export function HomeScreen() {
  const { user, owner, revision, isCurrent } = useSessionScope();
  const [now, setNow] = useState(() => Date.now());
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";
  const appointments = useQuery({
    queryKey: ["appointments", owner, revision],
    queryFn: ({ signal }) =>
      appointmentsApi.listAppointments({ signal, isSessionCurrent: isCurrent }),
    enabled: !!owner,
    gcTime: 0,
  });
  // Cached booking buckets can cross an appointment's end while Home stays open.
  const nextAppointment =
    appointments.data?.upcoming.find((entry) => Date.parse(entry.endsAtIso) > now) ?? null;
  const wellness = useQuery({
    queryKey: ["wearables", "summary", owner, revision],
    queryFn: ({ signal }) => wearablesApi.getSummary({ signal, isSessionCurrent: isCurrent }),
    enabled: !!owner,
    gcTime: 0,
  });
  const samples = wellness.data?.recentSamples ?? [];
  const day = localDayKey(new Date(now).toISOString());
  const sleep = dailyTotalFor(samples, "sleep_minutes", day);
  const steps = dailyTotalFor(samples, "steps", day);
  const refetchAppointments = appointments.refetch;
  const refetchWellness = wellness.refetch;
  const refresh = useCallback(async () => {
    if (!isCurrent()) return;
    setNow(Date.now());
    await Promise.all([refetchAppointments(), refetchWellness()]);
  }, [isCurrent, refetchAppointments, refetchWellness]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh]);
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const onHero = useTokenColor("on-primary-container");
  const onHeroWash = useTokenColor("on-primary-container", 0.1);

  return (
    <PatientShell
      activeTab="home"
      avatarUri={user?.avatarUrl}
      avatarInitials={firstName[0]}
      avatarLabel={user?.displayName ?? "Your profile"}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={appointments.isRefetching || wellness.isRefetching}
            onRefresh={() => void refresh()}
          />
        }
      >
        <Text
          accessibilityRole="header"
          className="mt-md font-headline-md text-headline-md text-on-surface"
        >
          Hello, {firstName}
        </Text>
        <View className="mt-md overflow-hidden rounded-3xl bg-primary-container p-md">
          <Animated.View
            pointerEvents={Platform.OS === "web" ? undefined : "none"}
            style={[
              {
                position: "absolute",
                right: -40,
                top: -40,
                height: 160,
                width: 160,
                borderRadius: 80,
                backgroundColor: onHeroWash,
                ...(Platform.OS === "web" ? { pointerEvents: "none" } : {}),
              },
              pulseStyle,
            ]}
          />
          <View
            pointerEvents={Platform.OS === "web" ? undefined : "none"}
            style={Platform.OS === "web" ? { pointerEvents: "none" } : undefined}
            className="absolute -bottom-5 -left-5 h-24 w-24 rounded-full bg-primary/20"
          />
          <View className="z-10 gap-sm">
            <View className="h-12 w-12 items-center justify-center rounded-xl bg-on-primary-container/20">
              <Icon chrome="auto-awesome" size={24} color={onHero} />
            </View>
            <Text className="font-headline-md text-headline-md text-on-primary-container">
              Talk to MedAI
            </Text>

            <Text
              className="font-body-md text-on-primary-container/90"
              style={{ fontSize: 15, lineHeight: 21, maxWidth: "80%" }}
            >
              Ask about symptoms, a medicine or a lab report. MedAI gives general information, not a
              diagnosis.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ask MedAI"
              onPress={() => router.push("/(app)/ai-assistant" as Href)}
              className="mt-sm w-fit flex-row items-center gap-sm self-start rounded-full bg-surface px-md py-sm active:scale-95"
            >
              <Text className="font-inter-semibold text-[14px] text-primary">Ask MedAI</Text>
            </Pressable>
          </View>
        </View>

        <Section title="Quick Services">
          <View className="gap-md">
            <View className="flex-row gap-base">
              <QuickService
                icon="person-search"
                label="Find Care"
                tint="primary"
                onPress={() => router.push("/(app)/find-care" as Href)}
              />
              <QuickService
                icon="event-available"
                label="Appts"
                tint="primary"
                onPress={() => router.push("/(app)/appointments" as Href)}
              />

              <QuickService icon="local-pharmacy" label="Pharmacy" tint="primary" />
            </View>
            <View className="flex-row gap-base">
              <QuickService
                icon="science"
                label="Labs"
                tint="primary"
                onPress={() => router.push("/(app)/lab-results" as Href)}
              />
              <QuickService
                icon="monitor-heart"
                label="Vitals"
                tint="primary"
                onPress={() => router.push("/(app)/vitals-timeline" as Href)}
              />
              <QuickService
                icon="folder-shared"
                label="Records"
                tint="primary"
                onPress={() => router.push("/(app)/medical-records" as Href)}
              />
            </View>
          </View>
        </Section>

        <Section
          title="Daily Wellness"
          actionLabel="View lifestyle"
          onAction={() => router.push("/(app)/lifestyle" as Href)}
        >
          {wellness.isPending ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Loading wellness"
              testID="home-wellness-loading"
            >
              <SkeletonCard shape="vital-stat-card" />
            </View>
          ) : wellness.isError ? (
            <ErrorPanel
              title="Wellness couldn't load"
              body="Check your connection and retry to see your recorded activity."
              retry={() => wellness.refetch()}
              retryAccessibilityLabel="Retry home wellness"
            />
          ) : sleep || steps ? (
            <View className="gap-sm">
              {sleep ? (
                <WellnessRow icon="bedtime" label="Sleep" value={formatSleep(sleep.value)} />
              ) : null}
              {steps ? (
                <WellnessRow
                  icon="directions-walk"
                  label="Steps Today"
                  value={Math.round(steps.value).toLocaleString()}
                />
              ) : null}
              {Math.max(sleep?.deviceCount ?? 0, steps?.deviceCount ?? 0) > 1 ? (
                <InfoCallout>Readings from multiple devices may overlap.</InfoCallout>
              ) : null}
              <Text className="font-body-md text-body-md text-on-surface-variant">
                Recorded today. Last reading{" "}
                {new Date(
                  [sleep?.latestAtIso, steps?.latestAtIso].filter(Boolean).sort().at(-1) as string,
                ).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                .
              </Text>
            </View>
          ) : (
            <EmptyState
              title="No wellness readings today"
              body="No sleep or step readings are available for today. Review your connected devices for data sources and sync status."
              action={{
                label: "Manage connected devices",
                onPress: () => router.push("/(app)/connect-devices" as Href),
              }}
            />
          )}
        </Section>

        <Section
          title="Upcoming Appointments"
          actionLabel="View All"
          onAction={() => router.push("/(app)/appointments" as Href)}
        >
          {appointments.isPending ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Loading appointments"
              testID="home-appointments-loading"
            >
              <SkeletonCard shape="list-row" />
            </View>
          ) : appointments.isError ? (
            <ErrorPanel
              title="Appointments couldn't load"
              body="Your schedule is unavailable right now. Retry before making plans from this screen."
              retry={() => appointments.refetch()}
              retryAccessibilityLabel="Retry home appointments"
            />
          ) : nextAppointment ? (
            <Card className="gap-sm">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 flex-row items-center gap-sm">
                  <AvatarWithFallback
                    size={44}
                    uri={nextAppointment.doctor?.avatarUri}
                    initials={initialsOf(doctorName(nextAppointment))}
                    label={doctorName(nextAppointment)}
                  />
                  <View className="flex-1">
                    <Text
                      numberOfLines={1}
                      className="font-headline-md text-on-surface"
                      style={{ fontSize: 15 }}
                    >
                      {doctorName(nextAppointment)}
                    </Text>

                    {nextAppointment.doctor?.specialty ? (
                      <Text
                        numberOfLines={1}
                        className="font-body-md text-on-surface-variant"
                        style={{ fontSize: 13 }}
                      >
                        {nextAppointment.doctor.specialty}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View className="rounded-full bg-primary-container/20 px-sm py-xs">
                  <Text className="font-label-sm text-label-sm text-primary">
                    {nextAppointment.mode === "video" ? "Virtual" : "In person"}
                  </Text>
                </View>
              </View>
              <View className="gap-xs rounded-2xl bg-surface-container-low p-sm">
                <Text className="font-inter-semibold text-[13px] text-on-surface">
                  {formatWhen(nextAppointment.startsAtIso, new Date(now))}
                </Text>

                {nextAppointment.mode === "video" ? (
                  <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 12 }}>
                    Video call via MedApp Secure Link
                  </Text>
                ) : null}
              </View>

              {nextAppointment.mode === "video" && nextAppointment.roomId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Join video call"
                  onPress={() =>
                    router.push({
                      pathname: "/(app)/waiting-room",
                      params: {
                        sessionId: nextAppointment.roomId,
                        appointmentId: nextAppointment.id,
                        viewerRole: "patient",
                        providerId: nextAppointment.doctorId,
                        providerName: doctorName(nextAppointment),
                        providerSpecialty: nextAppointment.doctor?.specialty ?? "",
                        startAt: nextAppointment.startsAtIso,
                      },
                    })
                  }
                  className="w-full flex-row items-center justify-center gap-sm rounded-full bg-primary py-sm active:scale-95 active:opacity-90"
                >
                  <Text className="font-inter-semibold text-[14px] text-on-primary">Join Call</Text>
                </Pressable>
              ) : nextAppointment.mode === "video" ? (
                <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 12 }}>
                  The video room is not ready yet — check back closer to your appointment.
                </Text>
              ) : null}
              <Button
                label="Manage appointment"
                variant="outline"
                onPress={() => router.push("/(app)/appointments" as Href)}
              />
            </Card>
          ) : (
            <EmptyState
              title="No upcoming appointments"
              body="Find a clinician when you're ready to book care. Previous appointments remain in your history."
              action={{
                label: "Find a clinician",
                onPress: () => router.push("/(app)/find-care" as Href),
              }}
            />
          )}
        </Section>
      </ScrollView>
    </PatientShell>
  );
}

type SectionAction =
  { actionLabel: string; onAction: () => void } | { actionLabel?: never; onAction?: never };

function Section({
  title,
  children,
  ...action
}: { title: string; children: React.ReactNode } & SectionAction) {
  const { actionLabel, onAction } = action;
  return (
    <View className="mt-lg">
      <View className="mb-sm flex-row items-center justify-between px-xs">
        <Text className="font-headline-md text-on-surface-variant" style={{ fontSize: 18 }}>
          {title}
        </Text>
        {actionLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel} ${title}`}
            hitSlop={6}
            onPress={onAction}
            className="active:scale-95"
          >
            <Text className="font-label-md text-label-md text-primary">{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

type Tint = "primary" | "secondary" | "tertiary" | "neutral" | "error";

const TINTS: Record<Tint, { bg: string; fg: ColorToken }> = {
  primary: { bg: "bg-primary/10", fg: "primary" },
  secondary: { bg: "bg-secondary-container", fg: "on-secondary-container" },
  tertiary: { bg: "bg-tertiary-fixed", fg: "on-tertiary-fixed-variant" },
  neutral: { bg: "bg-surface-container-high", fg: "on-surface-variant" },
  error: { bg: "bg-error-container", fg: "on-error-container" },
};

function QuickService({
  icon,
  label,
  tint,
  onPress,
}: {
  icon: ChromeIconName;
  label: string;
  tint: Tint;
  onPress?: () => void;
}) {
  const t = TINTS[tint];
  const glyph = useTokenColor(t.fg);
  const body = (
    <>
      <View className={`h-14 w-14 items-center justify-center rounded-md ${t.bg}`}>
        <Icon chrome={icon} size={24} color={glyph} />
      </View>

      <Text
        numberOfLines={1}
        className="text-center font-label-sm text-label-sm text-on-surface-variant"
      >
        {label}
      </Text>
    </>
  );
  if (!onPress) return <View className="flex-1 items-center gap-base">{body}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-1 items-center gap-base active:scale-95"
    >
      {body}
    </Pressable>
  );
}

function formatSleep(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function WellnessRow({
  icon,
  label,
  value,
}: {
  icon: ChromeIconName;
  label: string;
  value: string;
}) {
  const accent = useTokenColor("primary");
  return (
    <View className="flex-row items-center justify-between rounded-2xl border border-outline-variant/20 bg-surface-container-low p-sm">
      <View className="flex-row items-center gap-sm">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10">
          <Icon chrome={icon} size={18} color={accent} />
        </View>
        <Text className="font-inter-medium text-[14px] text-on-surface">{label}</Text>
      </View>
      <Text className="font-manrope-bold text-[14px] text-on-surface">{value}</Text>
    </View>
  );
}
