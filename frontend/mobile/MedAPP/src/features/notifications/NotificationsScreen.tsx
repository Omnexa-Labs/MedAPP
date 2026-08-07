// NotificationsScreen — Figma `notifications — inbox` 1073:1433,
// dark proof 1074:17968, page 548:615.
//
// ---------------------------------------------------------------------------
// WHAT THIS SCREEN DELIBERATELY DOES NOT HAVE
// ---------------------------------------------------------------------------
// NO unread badge, no read/unread styling, no mark-as-read, no dismiss.
//
// `notification_service` has NO READ STATE. Nothing marks a notification seen,
// there is no delete, and `InboxMessageOut` carries no action payload. Every
// one of those controls would be a promise the backend cannot keep — the exact
// dead-control defect this codebase has spent the week removing. The frame was
// drawn to the same limit, so screen and API agree.
//
// The consequence worth stating plainly: the app bar bell CANNOT show a count.
// A badge needs read state to subtract, and there is none. Adding one
// server-side is the single change that would make the bell meaningful.
//
// ---------------------------------------------------------------------------
// TWO CONTRACT SUBTLETIES THAT SHAPE THE LIST
// ---------------------------------------------------------------------------
// 1. `deliveryId` is NOT the event. One happening can be delivered over several
//    channels (push AND in-app) and each is a row sharing one `eventId`. The
//    list de-duplicates on `eventId` so a patient sees one line per thing that
//    happened, not one per transport.
// 2. `deliveredAtIso` is NULL while queued or failed — not merely old. Those
//    rows say "Sending…" rather than a time, because a timestamp would assert
//    the patient was told when they may not have been.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.
// Only expo-router is used.

import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import { Icon, type ChromeIconName } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { notificationsApi, type InboxMessage } from "./api";

/**
 * Glyph and tint per event family.
 *
 * `eventType` is FREE TEXT on the wire (max 64), not an enum, so this matches
 * loosely and falls back rather than dropping a notification it does not
 * recognise. An unrecognised notice is still a notice the patient was sent.
 */
function presentationFor(eventType: string): { icon: ChromeIconName; tint: string } {
  const t = eventType.toLowerCase();
  if (t.includes("appointment") || t.includes("booking")) {
    return { icon: "calendar-today", tint: "bg-primary-container" };
  }
  if (t.includes("lab") || t.includes("result")) {
    return { icon: "science", tint: "bg-success-container" };
  }
  if (t.includes("message") || t.includes("thread") || t.includes("chat")) {
    return { icon: "mail-outline", tint: "bg-primary-container" };
  }
  return { icon: "notifications-none", tint: "bg-surface-container-high" };
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 2880) return "Yesterday";
  return `${Math.floor(mins / 1440)}d ago`;
}

/** Delivered today, by local calendar day — not "within 24 hours". */
function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <View className="self-start rounded-full bg-surface-container-low px-base py-xs">
      <Text className="font-label-sm text-label-sm text-outline">{children}</Text>
    </View>
  );
}

function NotificationRow({ message }: { message: InboxMessage }) {
  const { icon, tint } = presentationFor(message.eventType);
  const glyph = useTokenColor("on-surface-variant");
  const queued = message.deliveredAtIso === null;

  return (
    <View className="flex-row gap-3 rounded-card border border-outline-variant bg-card-surface p-3">
      <View className={`h-10 w-10 items-center justify-center rounded-md ${tint}`}>
        <Icon chrome={icon} size={20} color={glyph} />
      </View>
      <View className="flex-1 gap-[2px]">
        <Text className="font-label-md text-label-md text-on-surface">{message.title}</Text>
        <Text className="font-body-md text-on-surface-variant" style={{ fontSize: 13, lineHeight: 19 }}>
          {message.body}
        </Text>
        {/* Queued or failed says so. A timestamp here would assert the patient
            was told, when the service only knows it tried. */}
        <Text
          className={`font-body-md ${queued ? "text-outline" : "text-on-surface-variant"}`}
          style={{ fontSize: 12 }}
        >
          {queued ? "Sending…" : timeAgo(message.deliveredAtIso as string)}
        </Text>
      </View>
    </View>
  );
}

export function NotificationsScreen() {
  const spinner = useTokenColor("primary");
  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: ["notifications", "inbox"],
    queryFn: () => notificationsApi.listInbox(),
  });

  const { today, earlier } = useMemo(() => {
    // One row per HAPPENING, not per transport. See the header.
    const seen = new Set<string>();
    const unique: InboxMessage[] = [];
    for (const m of data ?? []) {
      if (seen.has(m.eventId)) continue;
      seen.add(m.eventId);
      unique.push(m);
    }
    // Undelivered first: "Sending…" is current, and burying it under yesterday
    // would hide the one row whose state is still moving.
    unique.sort((a, b) => {
      if (a.deliveredAtIso === null && b.deliveredAtIso !== null) return -1;
      if (b.deliveredAtIso === null && a.deliveredAtIso !== null) return 1;
      return (b.deliveredAtIso ?? "").localeCompare(a.deliveredAtIso ?? "");
    });
    return {
      today: unique.filter((m) => isToday(m.deliveredAtIso) || m.deliveredAtIso === null),
      earlier: unique.filter((m) => m.deliveredAtIso !== null && !isToday(m.deliveredAtIso)),
    };
  }, [data]);

  return (
    <DetailShell title="Notifications" testID="notifications-screen">
      <ScrollView className="flex-1" contentContainerClassName="gap-sm px-md py-md">
        {isPending ? (
          <View className="items-center py-2xl">
            <ActivityIndicator color={spinner} />
          </View>
        ) : isError ? (
          <View className="items-center gap-sm py-2xl">
            <Text className="font-headline-md text-headline-md text-on-surface">
              Couldn&apos;t load notifications
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading notifications"
              onPress={() => refetch()}
              disabled={isRefetching}
              className="min-h-[44px] justify-center rounded-full border border-outline px-lg active:opacity-70"
            >
              <Text className="font-label-md text-label-md text-on-surface">
                {isRefetching ? "Retrying…" : "Try again"}
              </Text>
            </Pressable>
          </View>
        ) : today.length === 0 && earlier.length === 0 ? (
          <View className="items-center gap-xs py-2xl">
            <Text className="font-headline-md text-headline-md text-on-surface">
              Nothing yet
            </Text>
            <Text className="text-center font-body-md text-body-md text-on-surface-variant">
              Appointment updates, lab results and messages will appear here.
            </Text>
          </View>
        ) : (
          <>
            {today.length > 0 ? (
              <>
                <GroupLabel>Today</GroupLabel>
                {today.map((m) => (
                  <NotificationRow key={m.id} message={m} />
                ))}
              </>
            ) : null}
            {earlier.length > 0 ? (
              <>
                <View className="mt-sm" />
                <GroupLabel>Earlier</GroupLabel>
                {earlier.map((m) => (
                  <NotificationRow key={m.id} message={m} />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </DetailShell>
  );
}
