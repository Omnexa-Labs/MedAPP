import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { router, type Href } from "expo-router";
import * as Calendar from "expo-calendar";
import { DetailShell } from "@/components/shell";
import {
  Button,
  Card,
  Icon,
  IconTile,
  InfoCallout,
  KeyValueRow,
  PractitionerSummaryRow,
  SectionHeader,
  SuccessMedallion,
  type AnyIconName,
} from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

type ConsultationMode = "in-person" | "video";

const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatLongDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return `${WEEKDAY_LONG[parsed.getUTCDay()]}, ${parsed.getUTCDate()} ${
    MONTH_LONG[parsed.getUTCMonth()]
  } ${parsed.getUTCFullYear()}`;
}

function toInstant(value: string | undefined): Date | null {
  if (!value || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const CHECKLIST: Record<ConsultationMode, { icon: AnyIconName; text: string }[]> = {
  "in-person": [
    { icon: "credential", text: "Bring photo ID and any recent test results" },
    { icon: "schedule", text: "Arrive 10 minutes early to complete check-in" },
    { icon: "medication", text: "List any medication you are currently taking" },
  ],
  video: [
    { icon: "videocam", text: "Test your microphone and camera" },

    { icon: "schedule", text: "Join from My Appointments when it is time" },
    { icon: "wifi", text: "Find a quiet spot with a stable connection" },
  ],
};

const SUPPORTING_COPY: Record<ConsultationMode, string> = {
  "in-person": "Your in-person appointment is confirmed. We've saved it to My Appointments.",
  video: "Your video consultation is confirmed. You'll join it from My Appointments.",
};

type CalendarState = "idle" | "working" | "added" | "denied" | "failed";

const CALENDAR_MESSAGE: Record<"denied" | "failed", string> = {
  denied:
    "MedApp can't add this to your calendar without calendar access. You can turn it on in Settings.",
  failed:
    "We couldn't add this to your calendar. Your appointment is still confirmed — you can find it in My Appointments.",
};

async function resolveWritableCalendarId(): Promise<string | null> {
  if (Platform.OS === "ios") {
    const preferred = await Calendar.getDefaultCalendarAsync();
    if (preferred?.id) return preferred.id;
  }
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((calendar) => calendar.allowsModifications);
  return writable.find((calendar) => calendar.isPrimary)?.id ?? writable[0]?.id ?? null;
}

export type ConfirmationParams = {
  practitionerName?: string;
  practitionerSpecialty?: string;
  practitionerAvatar?: string;
  date?: string;
  time?: string;
  endTime?: string;
  timezone?: string;
  type?: string;
  mode?: ConsultationMode;

  startsAtIso?: string;
  endsAtIso?: string;
  locationName?: string;
  locationAddress?: string;

  reason?: string;
  notes?: string;
};

export function BookingConfirmationDetails({
  params,
  isCurrent,
  status = "booked",
  isPast = false,
  providerNotice,
  onRefresh,
  refreshing = false,
}: {
  params: ConfirmationParams;
  isCurrent: () => boolean;
  status?: "booked" | "cancelled";
  isPast?: boolean;
  providerNotice?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const upcoming = status === "booked" && !isPast;
  const headline =
    status === "cancelled"
      ? "Appointment cancelled"
      : isPast
        ? "Past appointment"
        : "Appointment Confirmed";
  const calendarBusy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const canAct = useCallback(() => alive.current && isCurrent(), [isCurrent]);
  const mode: ConsultationMode = params.mode === "video" ? "video" : "in-person";
  const checklist = CHECKLIST[mode];

  const [calendarState, setCalendarState] = useState<CalendarState>("idle");

  const primary = useTokenColor("primary");

  const close = useCallback(() => {
    router.replace("/(app)" as Href);
  }, []);

  const goToAppointments = useCallback(() => {
    router.replace("/(app)/appointments" as Href);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close]);

  const startsAt = toInstant(params.startsAtIso);
  const endsAt = toInstant(params.endsAtIso);

  const canAddToCalendar =
    upcoming && !!startsAt && !!endsAt && endsAt.getTime() > startsAt.getTime();
  const startsAtTime = startsAt?.getTime();
  const endsAtTime = endsAt?.getTime();

  const addToCalendar = useCallback(async () => {
    if (
      !canAddToCalendar ||
      startsAtTime === undefined ||
      endsAtTime === undefined ||
      !canAct() ||
      calendarBusy.current
    )
      return;
    calendarBusy.current = true;
    setCalendarState("working");
    try {
      const permission = await Calendar.requestCalendarPermissionsAsync();
      if (!canAct()) return;
      if (!permission.granted) {
        setCalendarState("denied");
        AccessibilityInfo.announceForAccessibility(CALENDAR_MESSAGE.denied);
        return;
      }

      const calendarId = await resolveWritableCalendarId();
      if (!canAct()) return;
      if (!calendarId) {
        setCalendarState("failed");
        AccessibilityInfo.announceForAccessibility(CALENDAR_MESSAGE.failed);
        return;
      }

      await Calendar.createEventAsync(calendarId, {
        title: params.practitionerName
          ? `Appointment with ${params.practitionerName}`
          : "MedApp appointment",
        startDate: new Date(startsAtTime),
        endDate: new Date(endsAtTime),

        ...(mode === "video"
          ? null
          : {
              location:
                [params.locationName, params.locationAddress].filter(Boolean).join(", ") ||
                undefined,
            }),
      });

      if (!canAct()) return;
      setCalendarState("added");
      AccessibilityInfo.announceForAccessibility("Added to calendar");
    } catch {
      if (!canAct()) return;
      setCalendarState("failed");
      AccessibilityInfo.announceForAccessibility(CALENDAR_MESSAGE.failed);
    } finally {
      calendarBusy.current = false;
    }
  }, [
    canAddToCalendar,
    canAct,
    startsAtTime,
    endsAtTime,
    mode,
    params.locationAddress,
    params.locationName,
    params.practitionerName,
  ]);

  const openSettings = useCallback(() => {
    void Linking.openSettings().catch(() => {});
  }, []);

  const shareAppointment = useCallback(() => {
    if (!canAct()) return;
    const summary = [
      upcoming ? null : headline,
      params.practitionerName
        ? `Appointment with ${params.practitionerName}`
        : "MedApp appointment",
      params.date ? formatLongDate(params.date) : null,
      [[params.time, params.endTime].filter(Boolean).join(" – "), params.timezone]
        .filter(Boolean)
        .join(" · ") || null,
    ]
      .filter(Boolean)
      .join("\n");
    void Share.share({ message: summary }).catch(() => {});
  }, [
    params.date,
    params.endTime,
    params.practitionerName,
    params.time,
    params.timezone,
    canAct,
    upcoming,
    headline,
  ]);

  const secondaryTimeLine =
    [[params.time, params.endTime].filter(Boolean).join(" – "), params.timezone]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <DetailShell
      title={upcoming ? "Booking Confirmed" : "Appointment details"}
      backIcon="close"
      onBack={close}
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share appointment"
          onPress={shareAppointment}
          className="h-full w-full items-center justify-center rounded-full active:opacity-70"
        >
          <Icon chrome="ios-share" size={22} color={primary} />
        </Pressable>
      }
    >
      <ScrollView
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
        }

        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {upcoming ? <SuccessMedallion /> : null}

        <Text className="mt-8 text-center font-headline-lg text-headline-lg text-on-surface">
          {headline}
        </Text>
        <Text
          className="mt-2 self-center text-center font-body-md text-body-md text-on-surface-variant"
          style={{ maxWidth: 280 }}
        >
          {upcoming
            ? SUPPORTING_COPY[mode]
            : status === "cancelled"
              ? "This appointment is cancelled. You can book another time from Find Care."
              : "The scheduled time has passed. This record does not confirm whether the visit took place."}
        </Text>

        {providerNotice}
        <Card className="mt-8 w-full">
          {params.practitionerName ? (
            <>
              <PractitionerSummaryRow
                surface="bare"
                name={params.practitionerName}
                specialty={params.practitionerSpecialty ?? ""}
                avatarUri={params.practitionerAvatar}
              />
              <View className="my-4 h-px w-full bg-outline-variant" />
            </>
          ) : null}

          {params.date ? (
            <View className="flex-row items-start gap-4">
              <IconTile icon="calendar-today" />
              <KeyValueRow
                label="Date & Time"
                value={formatLongDate(params.date)}
                secondaryValue={secondaryTimeLine}
              />
            </View>
          ) : null}

          {params.type ? (
            <View className="mt-4 flex-row items-start gap-4">
              <IconTile icon="stethoscope" />
              <KeyValueRow
                label="Consultation Type"
                value={params.type}

                badge={{ label: mode === "video" ? "Video" : "In person", tone: "success" }}
              />
            </View>
          ) : null}
        </Card>

        {params.reason || params.notes ? (
          <Card className="mt-4">
            <KeyValueRow label="Reason for visit" value={params.reason || "Not provided"} />
            {params.notes ? (
              <Text className="mt-2 text-on-surface-variant">{params.notes}</Text>
            ) : null}
          </Card>
        ) : null}
        {upcoming ? (
          <View className="mt-6 w-full">
            <SectionHeader title="Before your appointment" icon="lightbulb" />
            <View className="mt-8 gap-3">
              {checklist.map((item) => (
                <View key={item.text} className="flex-row items-start gap-3">
                  <IconTile size={32} icon={item.icon} label={item.text} />
                  <Text className="flex-1 font-body-md text-body-md text-on-surface-variant">
                    {item.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <View className="mt-2 w-full">
          {canAddToCalendar ? (
            <Button
              label={calendarState === "added" ? "Added to Calendar" : "Add to Calendar"}
              size="docked"
              pill={false}
              fullWidth

              shadow={false}
              leadingIcon={calendarState === "added" ? "check" : undefined}
              loading={calendarState === "working"}
              disabled={calendarState === "added"}
              onPress={() => void addToCalendar()}
            />
          ) : null}

          {calendarState === "denied" || calendarState === "failed" ? (
            <View className="mt-4 w-full">
              <InfoCallout tone="error" icon="error-outline">
                <Text className="font-body-md text-body-md text-on-error-container">
                  {CALENDAR_MESSAGE[calendarState]}
                </Text>
                {calendarState === "denied" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open Settings"
                    onPress={openSettings}
                    hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                    className="mt-2 self-start active:opacity-80"
                  >
                    <Text className="font-label-md text-label-md text-on-error-container underline">
                      Open Settings
                    </Text>
                  </Pressable>
                ) : null}
              </InfoCallout>
            </View>
          ) : null}

          <View className="mt-4">
            <Button
              label="View My Appointments"
              variant="outline"
              size="docked"
              pill={false}
              fullWidth
              onPress={goToAppointments}
            />
          </View>
        </View>
      </ScrollView>
    </DetailShell>
  );
}
