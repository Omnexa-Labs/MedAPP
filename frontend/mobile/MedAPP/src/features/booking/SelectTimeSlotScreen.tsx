import { useMemo, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { DetailShell } from "@/components/shell";
import {
  Button,
  Card,
  ChoiceChip,
  ChoiceChipRow,
  DatePill,
  DockedActionBar,
  EmptyState,
  Icon,
  InfoCallout,
  Input,
  PractitionerSummaryRow,
  SectionHeader,
  KeyboardInset,
} from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import {
  useDateStrip,
  useSlots,
  type DateOption,
  type Slot,
} from "./hooks/use-booking-availability";
const GUTTER = 16;
const SCROLL_BOTTOM_PAD = 120;
const SLOT_COLUMNS = 3;
const SLOT_GAP = 12;
const GLYPH = 20;
const CONSULTATION_TYPES = [
  "Standard Consultation",
  "Follow-up Visit",
  "Specialist Review",
  "Diagnostic Report",
] as const;
export type ConsultationMode = "in-person" | "video";
const CONSULTATION_MODES: { id: ConsultationMode; label: string }[] = [
  { id: "in-person", label: "In person" },
  { id: "video", label: "Video" },
];
type Params = {
  practitionerId?: string;
  practitionerName?: string;
  practitionerSpecialty?: string;
  practitionerAvatar?: string;
  practitionerRating?: string;
  practitionerReviewCount?: string;
  practitionerFeeCents?: string;
  rescheduleOfId?: string;
  date?: string;
  time?: string;
  startsAtIso?: string;
  mode?: string;
  type?: string;
  reason?: string;
};
function asMode(value: string | undefined): ConsultationMode | undefined {
  return value === "in-person" || value === "video" ? value : undefined;
}
function asRating(
  value: string | undefined,
  count: string | undefined,
): { value: number; count: number } | undefined {
  if (value === undefined || count === undefined) return undefined;
  const parsedValue = Number(value);
  const parsedCount = Number(count);
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 5) return undefined;
  if (!Number.isInteger(parsedCount) || parsedCount < 0) return undefined;
  return { value: parsedValue, count: parsedCount };
}
function defined(params: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
export function SelectTimeSlotScreen() {
  const params = useLocalSearchParams<Params>();
  const dates = useDateStrip();
  const firstBookableIso = useMemo(
    () => (dates.find((d) => !d.unavailable) ?? dates[0])?.iso ?? "",
    [dates],
  );
  const [selectedDateId, setSelectedDateId] = useState<string>(
    () => params.date ?? firstBookableIso,
  );
  const [selectedSlot, setSelectedSlot] = useState<string>(() => params.startsAtIso ?? "");
  const [mode, setMode] = useState<ConsultationMode>(() => asMode(params.mode) ?? "in-person");
  const [selectedType, setSelectedType] = useState<string>(() => params.type ?? "");
  const [reason, setReason] = useState<string>(() => params.reason ?? "");
  const selectedDate = useMemo<DateOption | undefined>(
    () => dates.find((d) => d.iso === selectedDateId),
    [dates, selectedDateId],
  );
  const { slots, isLoading, isError, retry, timezoneLabel, location } = useSlots(
    params.practitionerId,
    selectedDateId,
  );
  const groups = useMemo(() => {
    const byPeriod = new Map<string, Slot[]>();
    for (const s of slots) {
      const bucket = byPeriod.get(s.period);
      if (bucket) bucket.push(s);
      else byPeriod.set(s.period, [s]);
    }
    return [...byPeriod.entries()];
  }, [slots]);
  const isEmpty = !isLoading && slots.length === 0;
  const selectedSlotDetail = useMemo(
    () => slots.find((s) => s.startsAtIso === selectedSlot),
    [slots, selectedSlot],
  );
  const canProceed =
    !isLoading &&
    !isError &&
    !isEmpty &&
    !!params.practitionerId &&
    !!selectedDate &&
    !!selectedSlotDetail?.available &&
    Date.parse(selectedSlotDetail.startsAtIso) > Date.now() &&
    selectedType !== "";
  const proceedToReview = () => {
    if (
      !canProceed ||
      !selectedDate ||
      !selectedSlotDetail ||
      Date.parse(selectedSlotDetail.startsAtIso) <= Date.now()
    )
      return;
    router.push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: "/(app)/review-appointment" as any,
      params: defined({
        practitionerId: params.practitionerId,
        practitionerName: params.practitionerName,
        practitionerSpecialty: params.practitionerSpecialty,
        practitionerAvatar: params.practitionerAvatar,
        date: selectedDate.iso,
        time: selectedSlotDetail.time,
        startsAtIso: selectedSlotDetail.startsAtIso,
        endsAtIso: selectedSlotDetail.endsAtIso,
        endTime: selectedSlotDetail?.endTime,
        timezone: selectedSlotDetail.timezone,
        duration: `${(Date.parse(selectedSlotDetail.endsAtIso) - Date.parse(selectedSlotDetail.startsAtIso)) / 60000} minutes`,
        locationName: location?.name,
        locationAddress: location?.address,
        mode,
        type: selectedType,
        reason,
        feeCents: params.practitionerFeeCents,
        rescheduleOfId: params.rescheduleOfId,
      }),
    });
  };
  return (
    <DetailShell title="Book Appointment" claimsBottomInset={false}>
      <KeyboardInset className="flex-1">
        <ScrollView
          contentContainerStyle={{ paddingTop: GUTTER, paddingBottom: SCROLL_BOTTOM_PAD }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="px-4">
            {isLoading ? (
              <PractitionerSkeleton />
            ) : (
              <PractitionerSummaryRow
                surface="card"
                name={params.practitionerName ?? ""}
                specialty={params.practitionerSpecialty ?? ""}
                avatarUri={params.practitionerAvatar}
                rating={asRating(params.practitionerRating, params.practitionerReviewCount)}
              />
            )}
          </View>
          <View className="mt-6">
            <View className="px-4">
              <SectionHeader title="Select Date" />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: SLOT_GAP, paddingHorizontal: GUTTER }}
            >
              {isLoading
                ? dates.map((d) => <SkeletonBlock key={d.iso} width={60} height={80} />)
                : dates.map((d) => (
                    <DatePill
                      key={d.iso}
                      day={d.day}
                      date={d.date}
                      month={d.month}
                      selected={d.iso === selectedDateId}
                      unavailable={d.unavailable}
                      onPress={() => {
                        setSelectedDateId(d.iso);
                        setSelectedSlot("");
                      }}
                    />
                  ))}
            </ScrollView>
          </View>
          <View className="mt-6 px-4">
            <SectionHeader title="Available Slots" />
            {timezoneLabel ? (
              <InfoCallout>
                Dates and times use {timezoneLabel}. Slots are confirmed when you finish booking.
              </InfoCallout>
            ) : null}
            {isError ? (
              <View className="gap-3">
                <InfoCallout tone="error">Couldn&apos;t load availability.</InfoCallout>
                <Button label="Retry availability" onPress={retry} />
              </View>
            ) : null}
            {isLoading ? (
              <SlotGridSkeleton />
            ) : isError ? null : isEmpty ? (
              <NoSlots
                dateLabel={
                  selectedDate
                    ? `${selectedDate.day} ${selectedDate.date} ${selectedDate.month}`
                    : ""
                }
              />
            ) : (
              groups.map(([period, periodSlots]) => (
                <SlotGroup
                  key={period}
                  label={period}
                  slots={periodSlots}
                  selected={selectedSlot}
                  onSelect={setSelectedSlot}
                />
              ))
            )}
          </View>
          <View className="mt-6 px-4">
            <SectionHeader title="Consultation Mode" />
            <ChoiceChipRow>
              {CONSULTATION_MODES.map((m) => (
                <ChoiceChip
                  key={m.id}
                  label={m.label}
                  role="radio"
                  layout="hug"
                  selected={m.id === mode}
                  onPress={() => setMode(m.id)}
                />
              ))}
            </ChoiceChipRow>
          </View>
          <View className="mt-6">
            <View className="px-4">
              <SectionHeader title="Consultation Type" />
            </View>
            <ChoiceChipRow scrollable>
              {CONSULTATION_TYPES.map((t) => (
                <ChoiceChip
                  key={t}
                  label={t}
                  role="radio"
                  selected={t === selectedType}
                  onPress={() => setSelectedType(t)}
                />
              ))}
            </ChoiceChipRow>
          </View>
          <View className="mt-6 px-4">
            <View className="mb-2 flex-row items-center gap-2">
              <Text className="font-label-md text-label-md text-on-surface">Reason for Visit</Text>
              <Text className="font-label-sm text-label-sm text-on-surface-variant">Optional</Text>
            </View>
            <Input
              multiline
              numberOfLines={3}
              value={reason}
              onChangeText={setReason}
              placeholder="Describe your symptoms or reason for the appointment…"
              accessibilityLabel="Reason for visit"
            />
          </View>
        </ScrollView>
        <DockedActionBar
          primary={{
            label: "Book Now",
            trailingIcon: "chevron-right",
            onPress: proceedToReview,
            disabled: !canProceed,
          }}
        />
      </KeyboardInset>
    </DetailShell>
  );
}
function SlotGroup({
  label,
  slots,
  selected,
  onSelect,
}: {
  label: string;
  slots: Slot[];
  selected: string;
  onSelect: (slot: string) => void;
}) {
  const glyphColor = useTokenColor("on-surface-variant");
  const rows: Slot[][] = [];
  for (let i = 0; i < slots.length; i += SLOT_COLUMNS) {
    rows.push(slots.slice(i, i + SLOT_COLUMNS));
  }
  return (
    <View className="mb-6">
      <View className="mb-2 flex-row items-center gap-2">
        <Icon chrome="schedule" size={GLYPH} color={glyphColor} />
        <Text
          className="font-label-md text-label-md text-on-surface-variant"
          style={{ textTransform: "uppercase", letterSpacing: 1 }}
        >
          {label}
        </Text>
      </View>
      <View style={{ gap: SLOT_GAP }}>
        {rows.map((row, rowIndex) => (
          <View key={row[0].startsAtIso} className="flex-row" style={{ gap: SLOT_GAP }}>
            {row.map((slot) => (
              <View key={slot.startsAtIso} className="flex-1">
                <ChoiceChip
                  label={slot.time}
                  role="radio"
                  layout="fill"
                  selected={slot.startsAtIso === selected}
                  unavailable={!slot.available}
                  onPress={() => onSelect(slot.startsAtIso)}
                />
              </View>
            ))}
            {Array.from({ length: SLOT_COLUMNS - row.length }, (_, i) => (
              <View key={`spacer-${rowIndex}-${i}`} className="flex-1" />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
function NoSlots({ dateLabel }: { dateLabel: string }) {
  return (
    <EmptyState
      container="inline"
      icon="search-off"
      title={`No slots on ${dateLabel}`}
      body="Pick another date in the strip above."
    />
  );
}
function SkeletonBlock({
  width,
  height,
  radius = 12,
  flex,
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  flex?: boolean;
}) {
  return (
    <View
      className="bg-surface-container-high"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, borderRadius: radius, ...(flex ? { flex: 1 } : null) }}
    />
  );
}
function PractitionerSkeleton() {
  return (
    <Card className="w-full flex-row items-center gap-3">
      <SkeletonBlock width={56} height={56} radius={999} />
      <View className="flex-1" style={{ gap: 8 }}>
        <SkeletonBlock width="70%" height={20} />
        <SkeletonBlock width="50%" height={16} />
        <SkeletonBlock width="40%" height={16} />
      </View>
    </Card>
  );
}
const SKELETON_SLOT_ROWS = 2;
function SlotGridSkeleton() {
  return (
    <View style={{ gap: 24 }}>
      {Array.from({ length: SKELETON_SLOT_ROWS }, (_, group) => (
        <View key={`group-${group}`} style={{ gap: SLOT_GAP }}>
          <SkeletonBlock width={96} height={16} />
          {Array.from({ length: 2 }, (_, row) => (
            <View key={`row-${row}`} className="flex-row" style={{ gap: SLOT_GAP }}>
              {Array.from({ length: SLOT_COLUMNS }, (_, col) => (
                <SkeletonBlock key={`cell-${col}`} height={44} flex />
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
