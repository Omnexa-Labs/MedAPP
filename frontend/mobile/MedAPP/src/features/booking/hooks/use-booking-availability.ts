import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { bookingApi, type AvailableSlot } from "../api";
import { useSessionScope } from "@/hooks/use-session-scope";

export type Slot = {
  time: string;
  endTime?: string;
  period: string;
  available: boolean;
  startsAtIso: string;
  endsAtIso: string;
  timezone: string;
};
export type AppointmentLocation = { name?: string; address?: string };
export type DateOption = {
  iso: string;
  day: string;
  date: string;
  month: string;
  unavailable: boolean;
};
export type SlotsResult = {
  slots: Slot[];
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
  timezoneLabel?: string;
  location?: AppointmentLocation;
};
export const SLOTS_QUERY_KEY = (id: string | undefined, date: string) =>
  ["slots", id, date] as const;
export function parseClockMinutes(value: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)?$/i.exec(value.trim());
  if (!m) return undefined;
  let h = Number(m[1]);
  const minutes = Number(m[2]);
  if (minutes > 59 || (m[3] ? h < 1 || h > 12 : h > 23)) return undefined;
  if (m[3]) h = (h % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + minutes;
}
export function displaySlot(slot: AvailableSlot): Slot {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: slot.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const start = new Date(slot.startsAtIso);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: slot.timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(start),
  );
  // Offset distinguishes repeated wall clocks during daylight-saving changes.
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: slot.timezone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(start)
    .find((p) => p.type === "timeZoneName")?.value;
  return {
    ...slot,
    time: `${format.format(start)} ${zone ?? slot.timezone}`,
    endTime: format.format(new Date(slot.endsAtIso)),
    period: hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening",
    available: start.getTime() > Date.now(),
  };
}
export function useDateStrip(): DateOption[] {
  return useMemo(() => {
    const today = new Date();
    return Array.from({ length: 31 }, (_, i) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 12);
      return {
        iso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
        day: date.toLocaleDateString("en-US", { weekday: "short" }),
        date: String(date.getDate()),
        month: date.toLocaleDateString("en-US", { month: "short" }),
        unavailable: false,
      };
    });
  }, []);
}
export function useSlots(id: string | undefined, date: string): SlotsResult {
  const scope = useSessionScope();
  const query = useQuery({
    queryKey: [...SLOTS_QUERY_KEY(id, date), scope.owner, scope.revision],
    enabled: !!id && !!scope.owner,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30_000,
    queryFn: ({ signal }) =>
      bookingApi.listSlots(id!, date, { signal, isSessionCurrent: scope.isCurrent }),
  });
  // On refresh failures discard stale offerings; do not silently offer old slots.
  const slots = query.isError ? [] : (query.data ?? []).map(displaySlot);
  return {
    slots,
    isLoading: query.isFetching,
    isError: query.isError,
    retry: () => {
      void query.refetch();
    },
    timezoneLabel: [...new Set(slots.map((slot) => slot.timezone))].join(", ") || undefined,
  };
}
