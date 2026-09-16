import { client, type RequestOptions } from "@/lib/api/client";
import type { Vital } from "@/features/overview/api";

interface VitalWire {
  vital_id: string;
  patient_id: string;
  recorded_by_user_id: string;
  kind: string;
  value: string;
  unit: string | null;
  recorded_at: string;
  note: string | null;
}
export interface VitalPage {
  items: Vital[];
  nextCursor: string | null;
}
export interface TimelineFilters {
  kind?: string;
  from?: string;
  to?: string;
}

export const vitalTimelineApi = {
  async list(
    owner: string,
    filters: TimelineFilters,
    cursor: string | null,
    options: RequestOptions,
  ): Promise<VitalPage> {
    const params = new URLSearchParams({ limit: "25" });
    if (filters.kind) params.set("kind", filters.kind);
    if (filters.from) params.set("from_date", filters.from);
    if (filters.to) params.set("to_date", filters.to);
    if (cursor) params.set("cursor", cursor);
    const result = await client.get<{ items: VitalWire[]; next_cursor: string | null }>(
      `/v1/patients/${encodeURIComponent(owner)}/vitals?${params}`,
      options,
    );
    return {
      items: result.items.map((row) => ({
        id: row.vital_id,
        patientId: row.patient_id,
        recordedByUserId: row.recorded_by_user_id,
        kind: row.kind,
        value: row.value,
        unit: row.unit,
        recordedAtIso: row.recorded_at,
        note: row.note,
      })),
      nextCursor: result.next_cursor,
    };
  },
};

export function vitalLabel(kind: string): string {
  const known: Record<string, string> = {
    heart_rate: "Heart rate",
    heartrate: "Heart rate",
    blood_pressure: "Blood pressure",
    bloodpressure: "Blood pressure",
    temperature: "Temperature",
    weight: "Weight",
    pulse: "Pulse",
    spo2: "Oxygen saturation",
    sleep_minutes: "Sleep",
    steps: "Steps",
  };
  return known[kind.toLowerCase()] ?? kind.replaceAll("_", " ");
}

export function rangeStart(days: number | null, now: number): string | undefined {
  if (days === null) return undefined;
  const start = new Date(now);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}
