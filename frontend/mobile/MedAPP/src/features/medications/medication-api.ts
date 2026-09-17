import { z } from "zod";
import { client, type RequestOptions } from "@/lib/api/client";

const uuid = z.string().uuid();
const timestamp = z.iso.datetime({ offset: true });
export const courseStatus = z.enum(["active", "paused", "stopped", "completed"]);
export const medicineSchema = z.object({
  drug_name: z.string().trim().min(1).max(255),
  strength: z.string().trim().min(1).max(64),
  form: z.string().trim().min(1).max(64),
  dose: z.string().trim().min(1).max(80),
  route: z.string().trim().min(1).max(40),
  frequency: z.string().trim().min(1).max(80),
  duration: z.string().trim().max(80),
  instructions: z.string().trim().max(200),
});
export const scheduleRevision = z.object({
  effective_date: z.iso.date(),
  end_date: z.iso.date().nullable(),
  daily_times: z.array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)).max(12),
});
export const scheduleChange = scheduleRevision
  .extend({
    version: z.number().int().positive(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (v) => new Set(v.daily_times).size === v.daily_times.length,
    "Use each tracking time once",
  )
  .refine(
    (v) => !v.end_date || v.end_date >= v.effective_date,
    "End date must follow the new plan start",
  );
export const courseSchema = z.object({
  id: uuid,
  patient_user_id: uuid,
  source: z.enum(["prescribed", "self_reported"]),
  prescription_id: uuid.nullable(),
  prescription_item: z.number().int().nonnegative().nullable(),
  prescription_status: z.enum(["issued", "cancelled", "superseded"]).nullable(),
  prescriber_name: z.string().nullable(),
  medicine: medicineSchema,
  status: courseStatus,
  version: z.number().int().positive(),
  start_date: z.iso.date(),
  end_date: z.iso.date().nullable(),
  timezone: z.string().min(1),
  daily_times: z.array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)).max(12),
  created_at: timestamp,
  schedule_changes: z.array(scheduleRevision).max(101).default([]),
  reminders_enabled: z.boolean().default(false),
});
export const doseSchema = z.object({
  id: uuid,
  course_id: uuid,
  patient_user_id: uuid,
  day: z.iso.date(),
  time: z.string().nullable(),
  scheduled_at: timestamp.nullable(),
  occurred_at: timestamp.nullable(),
  outcome: z.enum(["taken", "skipped", "voided"]),
  note: z.string(),
  version: z.number().int().positive(),
  reported_at: timestamp,
});
const pagination = {
  offset: z.number().int().nonnegative(),
  limit: z.literal(25),
  next_offset: z.number().int().nonnegative().nullable(),
};
const coursePage = z.object({ items: z.array(courseSchema).max(25), ...pagination });
const dosePage = z.object({ items: z.array(doseSchema).max(25), ...pagination });
const eventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("schedule_changed"),
    payload: z.object({
      before: z.array(scheduleRevision),
      after: z.array(scheduleRevision),
      reason: z.string(),
    }),
  }),
  z.object({ kind: z.literal("reminders_changed"), payload: z.object({ enabled: z.boolean() }) }),
  z.object({
    kind: z.literal("created"),
    payload: z.object({
      status: z.literal("active"),
      source: z.enum(["prescribed", "self_reported"]),
      start_date: z.iso.date(),
      daily_times: z.array(z.string()),
      timezone: z.string(),
    }),
  }),
  z.object({
    kind: z.literal("status"),
    payload: z.object({
      from: courseStatus,
      to: courseStatus,
      reason: z.string(),
      effective_at: timestamp,
    }),
  }),
  z.object({ kind: z.literal("dose_recorded"), payload: doseSchema }),
  z.object({
    kind: z.literal("dose_corrected"),
    payload: z.object({ before: doseSchema, after: doseSchema, reason: z.string() }),
  }),
]);
const eventPage = z.object({
  items: z
    .array(z.intersection(eventSchema, z.object({ id: uuid, recorded_at: timestamp })))
    .max(25),
  ...pagination,
});
const trackingPage = z.object({
  day: z.iso.date(),
  server_now: timestamp,
  ...pagination,
  items: z
    .array(
      z.object({
        course: courseSchema,
        slots: z
          .array(
            z.object({
              time: z.string(),
              scheduled_at: timestamp.nullable(),
              state: z.enum(["due", "upcoming", "not_scheduled", "taken", "skipped", "voided"]),
              dose: doseSchema.nullable(),
            }),
          )
          .max(12),
        manual_entries: z.array(doseSchema),
      }),
    )
    .max(25),
});
export type Course = z.infer<typeof courseSchema>;
export type Medicine = z.infer<typeof medicineSchema>;
export type Dose = z.infer<typeof doseSchema>;
export type MedicationEvent = z.infer<typeof eventPage>["items"][number];
export type TrackingPage = z.infer<typeof trackingPage>;
export type Command = { suffix: string; body: unknown; kind: "course" | "dose"; key: string };
function base(owner: string) {
  return `/v1/patients/${encodeURIComponent(uuid.parse(owner))}/medications`;
}
function owned<T extends { patient_user_id: string }>(record: T, owner: string): T {
  if (record.patient_user_id !== owner) throw new Error("Medication owner could not be confirmed.");
  return record;
}
function page<T extends { offset: number; next_offset: number | null; items: { id: string }[] }>(
  result: T,
  offset: number,
): T {
  if (
    result.offset !== offset ||
    (result.next_offset !== null && result.next_offset !== offset + 25) ||
    new Set(result.items.map((i) => i.id)).size !== result.items.length
  )
    throw new Error("Medication page could not be confirmed.");
  return result;
}
export const medicationApi = {
  async list(owner: string, status: string, offset: number, options: RequestOptions) {
    const result = page(
      coursePage.parse(
        await client.get(
          `${base(owner)}?status=${encodeURIComponent(status)}&limit=25&offset=${offset}`,
          options,
        ),
      ),
      offset,
    );
    result.items.forEach((item) => owned(item, owner));
    return result;
  },
  async detail(owner: string, id: string, options: RequestOptions) {
    const result = owned(
      courseSchema.parse(await client.get(`${base(owner)}/${uuid.parse(id)}`, options)),
      owner,
    );
    if (result.id !== id) throw new Error("Medication identity could not be confirmed.");
    return result;
  },
  async doses(owner: string, id: string, offset: number, options: RequestOptions) {
    const result = page(
      dosePage.parse(
        await client.get(
          `${base(owner)}/${uuid.parse(id)}/doses?limit=25&offset=${offset}`,
          options,
        ),
      ),
      offset,
    );
    result.items.forEach((item) => {
      owned(item, owner);
      if (item.course_id !== id) throw new Error("Dose identity could not be confirmed.");
    });
    return result;
  },
  async events(owner: string, id: string, offset: number, options: RequestOptions) {
    const result = page(
      eventPage.parse(
        await client.get(
          `${base(owner)}/${uuid.parse(id)}/events?limit=25&offset=${offset}`,
          options,
        ),
      ),
      offset,
    );
    for (const event of result.items) {
      const doses =
        event.kind === "dose_recorded"
          ? [event.payload]
          : event.kind === "dose_corrected"
            ? [event.payload.before, event.payload.after]
            : [];
      for (const dose of doses) {
        owned(dose, owner);
        if (dose.course_id !== id) throw new Error("Dose history identity could not be confirmed.");
      }
    }
    return result;
  },
  async tracker(owner: string, day: string, offset: number, options: RequestOptions) {
    const result = trackingPage.parse(
      await client.get(
        `${base(owner)}/tracker?day=${z.iso.date().parse(day)}&limit=25&offset=${offset}`,
        options,
      ),
    );
    page({ ...result, items: result.items.map((row) => row.course) }, offset);
    if (result.day !== day) throw new Error("Tracking day could not be confirmed.");
    for (const row of result.items) {
      owned(row.course, owner);
      for (const dose of [
        ...row.manual_entries,
        ...row.slots.flatMap((s) => (s.dose ? [s.dose] : [])),
      ]) {
        owned(dose, owner);
        if (dose.course_id !== row.course.id || dose.day !== day)
          throw new Error("Tracking entry could not be confirmed.");
      }
    }
    return result;
  },
  async write(owner: string, command: Command, options: RequestOptions) {
    const result = await client.post(`${base(owner)}${command.suffix}`, command.body, {
      ...options,
      headers: { ...options.headers, "Idempotency-Key": uuid.parse(command.key) },
    });
    const parsed =
      command.kind === "course"
        ? owned(courseSchema.parse(result), owner)
        : owned(doseSchema.parse(result), owner);
    const parts = command.suffix.split("/");
    if (parts[1] && ("course_id" in parsed ? parsed.course_id : parsed.id) !== parts[1])
      throw new Error("Saved medication identity could not be confirmed.");
    if (parts[3] && parsed.id !== parts[3])
      throw new Error("Saved dose identity could not be confirmed.");
    return parsed;
  },
};
export const statusLabel = {
  active: "Active",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
};
export function courseLabel(course: Course) {
  if (course.prescription_status === "cancelled" || course.prescription_status === "superseded")
    return `${statusLabel[course.status]} · prescription withdrawn`;
  return statusLabel[course.status];
}
export function eventLabel(event: MedicationEvent) {
  if (event.kind === "schedule_changed")
    return `Future schedule changed: ${event.payload.reason}. ${event.payload.after.map((p) => `${p.effective_date}: ${p.daily_times.join(", ") || "manual"}, through ${p.end_date ?? "no end date"}`).join("; ")}`;
  if (event.kind === "reminders_changed")
    return `Reminders ${event.payload.enabled ? "enabled" : "disabled"}`;
  if (event.kind === "created") return `Tracking started from ${event.payload.start_date}`;
  if (event.kind === "status")
    return `${statusLabel[event.payload.from]} → ${statusLabel[event.payload.to]}: ${event.payload.reason}`;
  if (event.kind === "dose_recorded")
    return `${event.payload.outcome} · ${event.payload.day} ${event.payload.time ?? "manual entry"}`;
  return `Entry corrected: ${event.payload.before.outcome} → ${event.payload.after.outcome}. ${event.payload.reason}`;
}
export function occurrenceTime(value: string | null, timezone: string) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  } catch {
    return `${new Date(value).toISOString().slice(11, 16)} UTC`;
  }
}
