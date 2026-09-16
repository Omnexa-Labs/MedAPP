import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { BackHandler, Linking, Modal, Platform, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import {
  Button,
  Card,
  DockedActionBar,
  Icon,
  IconTile,
  InfoCallout,
  KeyValueRow,
  PractitionerSummaryRow,
  SectionHeader,
} from "@/components/ui";
import { bookingApi, validInstant, type CreateBookingPayload } from "@/features/booking/api";
import { consultationFee } from "@/features/practitioner/format";
import { useTokenColor, useTokenShadow } from "@/lib/tokens";
import { useSessionScope } from "@/hooks/use-session-scope";

function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
function parseRating(
  value: string | undefined,
  count: string | undefined,
): { value: number; count: number } | undefined {
  if (!value || !count) return undefined;
  const parsedValue = Number(value.trim());
  const parsedCount = Number(count.trim());
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 5) return undefined;
  if (!Number.isInteger(parsedCount) || parsedCount < 0) return undefined;
  return { value: parsedValue, count: parsedCount };
}
function parseTags(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const tags = [
    ...new Set(
      value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
  return tags.length > 0 ? tags : undefined;
}
export type ConsultationMode = "in-person" | "video";
function readMode(value: string | undefined): ConsultationMode | undefined {
  return value === "in-person" || value === "video" ? value : undefined;
}
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTHS = [
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
function formatLongDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return value;
  return `${WEEKDAYS[date.getDay()]}, ${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}
const POLICY = "Contact the clinic about fees and cancellation terms.";
function feeLabel(value: string | undefined): string | null {
  if (value === undefined) return null;
  const cents = Number(value.trim());
  if (!Number.isInteger(cents) || cents < 0) return null;
  return consultationFee(cents);
}
function failureCopy(status: number | undefined, time: string, practitioner: string) {
  if (status === 409) {
    return {
      title: "That slot was just taken",
      body: `Someone booked ${time} with ${practitioner} while you were reviewing. Nothing has been charged. Pick another time to continue.`,
    };
  }
  return {
    title: "We couldn't confirm this booking",
    body: "We could not verify the result. Check My Appointments before retrying to avoid booking twice.",
  };
}
const DIALOG_SHADOW = { y: 2, blur: 6, opacity: 0.08 } as const;
const ERROR_PLATE_LARGE = 56;
const ERROR_PLATE_SMALL = 40;
const DOCKED_CLEARANCE = 168;
export function ReviewAppointmentScreen() {
  const scope = useSessionScope();
  return <Review key={`${scope.owner}:${scope.revision}`} scope={scope} />;
}

function Review({ scope }: { scope: ReturnType<typeof useSessionScope> }) {
  const submitting = useRef(false);
  const params = useLocalSearchParams<{
    practitionerId?: string;
    practitionerName?: string;
    practitionerSpecialty?: string;
    practitionerAvatar?: string;
    rating?: string;
    reviewCount?: string;
    tags?: string;
    date?: string;
    time?: string;
    endTime?: string;
    startsAtIso?: string;
    endsAtIso?: string;
    timezone?: string;
    mode?: string;
    type?: string;
    reason?: string;
    duration?: string;
    locationName?: string;
    locationAddress?: string;
    feeCents?: string;
    rescheduleOfId?: string;
  }>();
  const practitionerName = text(params.practitionerName);
  const practitionerSpecialty = text(params.practitionerSpecialty);
  const date = text(params.date);
  const time = text(params.time);
  const endTime = text(params.endTime);
  const timezone = text(params.timezone);
  const type = text(params.type);
  const reason = text(params.reason);
  const duration = text(params.duration);
  const locationName = text(params.locationName);
  const locationAddress = text(params.locationAddress);
  const mode = readMode(params.mode);
  const rating = parseRating(text(params.rating), text(params.reviewCount));
  const tags = parseTags(text(params.tags));
  const fee = feeLabel(text(params.feeCents));
  const rescheduleOfId = text(params.rescheduleOfId);
  const [discardOpen, setDiscardOpen] = useState(false);
  const queryClient = useQueryClient();
  const confirmMutation = useMutation({
    gcTime: 0,
    mutationFn: (payload: CreateBookingPayload) =>
      rescheduleOfId
        ? bookingApi.rescheduleBooking(rescheduleOfId, payload, {
            isSessionCurrent: scope.isCurrent,
          })
        : bookingApi.createBooking(payload, { isSessionCurrent: scope.isCurrent }),
    onSettled: () => {
      submitting.current = false;
    },
    onSuccess: async (booking) => {
      if (!scope.isCurrent()) return;
      void queryClient.invalidateQueries({ queryKey: ["slots"] });
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      router.replace({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pathname: "/(app)/booking-confirmed" as any,
        params: { bookingId: booking.bookingId },
      });
    },
  });
  const isPending = confirmMutation.isPending;
  const requestDiscard = useCallback(() => {
    if (isPending) return;
    setDiscardOpen(true);
  }, [isPending]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      requestDiscard();
      return true;
    });
    return () => subscription.remove();
  }, [requestDiscard]);
  const goEdit = useCallback(() => {
    router.back();
  }, []);
  const keepEditing = useCallback(() => setDiscardOpen(false), []);
  const discardBooking = useCallback(() => {
    setDiscardOpen(false);
    router.dismissAll();
  }, []);
  const confirm = useCallback(() => {
    const doctorId = text(params.practitionerId);
    if (
      !doctorId ||
      !validInstant(params.startsAtIso) ||
      !validInstant(params.endsAtIso) ||
      submitting.current ||
      !scope.isCurrent()
    )
      return;
    submitting.current = true;
    confirmMutation.mutate({
      doctorId,
      startsAtIso: params.startsAtIso!,
      endsAtIso: params.endsAtIso!,
      reason,
      mode,
    });
  }, [
    confirmMutation,
    params.practitionerId,
    params.startsAtIso,
    params.endsAtIso,
    reason,
    mode,
    scope,
  ]);
  const openDirections = useCallback(async () => {
    if (!locationAddress) return;
    const query = encodeURIComponent(
      locationName ? `${locationName}, ${locationAddress}` : locationAddress,
    );
    const nativeUrl = Platform.select({
      ios: `maps://?daddr=${query}`,
      android: `geo:0,0?q=${query}`,
      default: "",
    });
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    try {
      const canOpenNative = nativeUrl ? await Linking.canOpenURL(nativeUrl) : false;
      await Linking.openURL(canOpenNative && nativeUrl ? nativeUrl : webUrl);
    } catch {
      try {
        await Linking.openURL(webUrl);
      } catch {}
    }
  }, [locationAddress, locationName]);
  const failure = useMemo(() => {
    const status = (confirmMutation.error as { status?: number } | null)?.status;
    return failureCopy(status, time ?? "this slot", practitionerName ?? "another patient");
  }, [confirmMutation.error, time, practitionerName]);
  const errorPlate = useTokenColor("on-error-container");
  const dialogShadow = useTokenShadow("shadow", DIALOG_SHADOW);
  if (
    !text(params.practitionerId) ||
    !practitionerName ||
    !date ||
    !time ||
    !type ||
    !mode ||
    !validInstant(params.startsAtIso) ||
    !validInstant(params.endsAtIso)
  ) {
    return (
      <DetailShell title="Review Appointment">
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 32,
            flexGrow: 1,
            justifyContent: "center",
          }}
          showsVerticalScrollIndicator={false}
        >
          <Card className="items-center">
            <View
              className="items-center justify-center rounded-full bg-error-container"
              style={{ width: ERROR_PLATE_LARGE, height: ERROR_PLATE_LARGE }}
            >
              <Icon chrome="error-outline" size={28} color={errorPlate} />
            </View>
            <Text className="mt-4 text-center font-headline-md text-headline-md text-on-surface">
              This booking session has expired
            </Text>
            <Text className="mt-2 text-center font-body-md text-body-md text-on-surface-variant">
              We no longer have the practitioner, date or time you chose. Nothing was booked. Start
              again from the provider you were viewing.
            </Text>
            <View className="mt-6 w-full">
              <Button
                label="Start again"
                size="docked"
                pill={false}
                fullWidth
                onPress={() => router.dismissAll()}
              />
            </View>
          </Card>
        </ScrollView>
      </DetailShell>
    );
  }
  const showTimezoneBadge = !!timezone;
  const timeValue = endTime ? `${time} – ${endTime}` : time;
  return (
    <DetailShell title="Review Appointment" onBack={requestDiscard} claimsBottomInset={false}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: DOCKED_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
      >
        <PractitionerSummaryRow
          surface="card"
          verified
          name={practitionerName}
          specialty={practitionerSpecialty ?? ""}
          avatarUri={text(params.practitionerAvatar)}
          rating={rating}
          tags={tags}
        />
        <View className="mt-6">
          <SectionHeader title="Time & Schedule" />
          <Card className="gap-4">
            <View className="flex-row items-start gap-4">
              <IconTile icon="calendar-today" />
              <KeyValueRow label="Date" value={formatLongDate(date)} />
            </View>
            <View className="flex-row items-start gap-4">
              <IconTile icon="schedule" />
              {showTimezoneBadge ? (
                <KeyValueRow
                  label="Time"
                  value={timeValue}
                  badge={{ label: timezone, tone: "success" }}
                />
              ) : (
                <KeyValueRow label="Time" value={timeValue} />
              )}
            </View>
          </Card>
        </View>
        <View className="mt-6">
          <SectionHeader title="Service Details" />
          <Card className="gap-4">
            <View className="flex-row items-start gap-4">
              <IconTile icon="stethoscope" />
              <KeyValueRow label="Consultation type" value={type} />
            </View>
            {duration ? (
              <View className="flex-row items-start gap-4">
                <IconTile icon="schedule" />
                <KeyValueRow label="Duration" value={duration} />
              </View>
            ) : null}
            {fee ? (
              <View className="flex-row items-start gap-4">
                <IconTile icon="payments" />
                <KeyValueRow label="Consultation fee" value={fee} />
              </View>
            ) : null}
            {reason ? (
              <View className="flex-row items-start gap-4">
                <IconTile icon="prescription" />
                <KeyValueRow label="Reason for visit" value={reason} />
              </View>
            ) : null}
          </Card>
        </View>
        {mode === "video" ? (
          <View className="mt-6">
            <SectionHeader title="Consultation" />
            <Card>
              <View className="flex-row items-start gap-4">
                <IconTile icon="videocam" />
                <KeyValueRow
                  label="Video consultation"
                  value="Join link opens 10 minutes before the start"
                />
              </View>
            </Card>
          </View>
        ) : locationAddress ? (
          <View className="mt-6">
            <SectionHeader title="Location" />
            <Card>
              <View className="flex-row items-start gap-4">
                <IconTile icon="location-on" />
                <KeyValueRow
                  label={locationName ?? "Clinic address"}
                  value={locationAddress}
                  action={isPending ? undefined : { label: "Directions", onPress: openDirections }}
                />
              </View>
            </Card>
          </View>
        ) : null}
        {rescheduleOfId ? (
          <View className="mt-6">
            <InfoCallout tone="info">
              Confirming replaces your original appointment. If this slot cannot be booked, your
              original appointment stays booked.
            </InfoCallout>
          </View>
        ) : null}
        <View className="mt-6">
          <InfoCallout>{POLICY}</InfoCallout>
        </View>
        {confirmMutation.isError ? (
          <View className="mt-6 items-center" accessibilityLiveRegion="polite">
            <View
              className="items-center justify-center rounded-full bg-error-container"
              style={{ width: ERROR_PLATE_SMALL, height: ERROR_PLATE_SMALL }}
            >
              <Icon chrome="error-outline" size={20} color={errorPlate} />
            </View>
            <Text className="mt-4 text-center font-body-md text-body-md text-on-surface">
              {failure.title}
            </Text>
            <Text className="mt-2 text-center font-label-sm text-label-sm text-on-surface-variant">
              {failure.body}
            </Text>
            <View className="mt-4 w-full gap-3">
              <Button
                label="Check My Appointments"
                variant="outline"
                onPress={() => router.replace("/(app)/appointments")}
              />
              <Button
                label="Choose another time"
                variant="outline"
                size="docked"
                pill={false}
                fullWidth
                onPress={() => router.back()}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
      <DockedActionBar
        secondary={{ label: "Edit", onPress: goEdit, disabled: isPending }}
        primary={{
          label: isPending
            ? "Confirming…"
            : confirmMutation.isError
              ? "Try again"
              : "Confirm Booking",
          loading: isPending,
          onPress: confirm,
        }}
      />
      <Modal visible={discardOpen} transparent animationType="fade" onRequestClose={keepEditing}>
        <View className="flex-1 items-center justify-center bg-scrim/40 px-4">
          <View
            accessibilityViewIsModal
            className="w-full rounded-card bg-card-surface p-6"
            style={[{ maxWidth: 313 }, dialogShadow]}
          >
            <Text
              accessibilityRole="header"
              className="font-headline-md text-headline-md text-on-surface"
            >
              Discard this booking?
            </Text>
            <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
              Your current selections will be lost. If you already tried to confirm, check My
              Appointments for the result.
            </Text>
            <View className="mt-6 gap-3">
              <Button
                label="Keep editing"
                size="docked"
                pill={false}
                fullWidth
                onPress={keepEditing}
              />
              <Button
                label="Discard booking"
                variant="outline"
                size="docked"
                pill={false}
                fullWidth
                onPress={discardBooking}
              />
            </View>
          </View>
        </View>
      </Modal>
    </DetailShell>
  );
}
