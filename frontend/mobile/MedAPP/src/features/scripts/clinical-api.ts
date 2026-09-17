import { z } from "zod";
import { client, type RequestOptions } from "@/lib/api/client";

export const medicineSchema = z.object({
  drug_name: z.string().trim().min(1).max(255),
  strength: z.string().trim().min(1).max(64),
  form: z.string().trim().min(1).max(64),
  dose: z.string().trim().min(1).max(80),
  route: z.string().trim().min(1).max(40),
  frequency: z.string().trim().min(1).max(80),
  duration: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(1_000_000),
  instructions: z.string().trim().max(200),
});
export const draftSchema = z.object({
  items: z.array(medicineSchema).min(1).max(20),
  clinical_goal: z.string().trim().max(500),
  valid_until: z.iso.date(),
});
const prescriptionSchema = draftSchema.extend({
  id: z.string().uuid(),
  patient_user_id: z.string().uuid(),
  author_id: z.string().uuid(),
  prescriber_name: z.string().min(1),
  version: z.number().int().positive(),
  status: z.enum(["draft", "issued", "cancelled", "superseded"]),
  issued_at: z.iso.datetime({ offset: true }).nullable(),
  cancelled_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
  change_reason: z.string().nullable(),
  replaces_id: z.string().uuid().nullable(),
  replacement_id: z.string().uuid().nullable(),
  pharmacy_id: z.string().uuid().nullable(),
  deliveries: z.array(
    z.object({
      id: z.string().uuid(),
      operation: z.enum(["send", "cancel"]),
      state: z.enum(["queued", "sending", "delivered", "attention", "withdrawn"]),
      attempts: z.number().int().nonnegative(),
      error_code: z.string().nullable(),
    }),
  ),
});
const pageSchema = z.object({
  items: z.array(prescriptionSchema).max(25),
  offset: z.number().int().nonnegative(),
  limit: z.literal(25),
  next_offset: z.number().int().nonnegative().nullable(),
});
export type ClinicalPrescription = z.infer<typeof prescriptionSchema>;
export type ClinicalDraft = z.infer<typeof draftSchema>;
export type Medicine = z.infer<typeof medicineSchema>;
export type PrescriptionOperation =
  "create" | "update" | "issue" | "cancel" | "correct" | "route" | "retry";

function base(patientId: string) {
  return `/v1/patients/${encodeURIComponent(z.string().uuid().parse(patientId))}/prescriptions`;
}
function record(value: unknown, patientId: string) {
  const rx = prescriptionSchema.parse(value);
  if (rx.patient_user_id !== patientId)
    throw new Error("Prescription owner could not be confirmed.");
  return rx;
}
export const clinicalApi = {
  async list(patientId: string, offset: number, options: RequestOptions) {
    const page = pageSchema.parse(
      await client.get<unknown>(`${base(patientId)}?limit=25&offset=${offset}`, options),
    );
    if (
      page.offset !== offset ||
      page.items.some((rx) => rx.patient_user_id !== patientId) ||
      new Set(page.items.map((rx) => rx.id)).size !== page.items.length ||
      (page.next_offset !== null && page.next_offset !== offset + 25)
    )
      throw new Error("Prescription history could not be confirmed.");
    return page;
  },
  async detail(patientId: string, id: string, options: RequestOptions) {
    const rx = record(
      await client.get<unknown>(`${base(patientId)}/${encodeURIComponent(id)}`, options),
      patientId,
    );
    if (rx.id !== id) throw new Error("Prescription identity could not be confirmed.");
    return rx;
  },
  async command(
    patientId: string,
    id: string | undefined,
    operation: PrescriptionOperation,
    body: unknown,
    key: string,
    options: RequestOptions,
  ) {
    const path =
      operation === "create"
        ? base(patientId)
        : `${base(patientId)}/${encodeURIComponent(id ?? "")}${operation === "update" ? "" : `/${operation}`}`;
    const request = { ...options, headers: { ...options.headers, "Idempotency-Key": key } };
    return record(
      await (operation === "update"
        ? client.put<unknown>(path, body, request)
        : client.post<unknown>(path, body, request)),
      patientId,
    );
  },
};

export function prescriptionStatus(rx: ClinicalPrescription) {
  if (rx.status === "issued" && rx.valid_until < new Date().toISOString().slice(0, 10))
    return "Expired for dispensing";
  return { draft: "Draft", issued: "Issued", cancelled: "Cancelled", superseded: "Replaced" }[
    rx.status
  ];
}
export function handoffLabel(delivery: ClinicalPrescription["deliveries"][number]) {
  if (delivery.operation === "cancel")
    return delivery.state === "delivered"
      ? "Pharmacy withdrawal confirmed"
      : "Pharmacy withdrawal pending — contact the pharmacy if urgent";
  return {
    queued: "Queued for pharmacy",
    sending: "Awaiting pharmacy confirmation",
    delivered: "Received by pharmacy",
    attention: "Pharmacy delivery needs attention",
    withdrawn: "Withdrawn before delivery",
  }[delivery.state];
}

export function prescriptionCopy(rx: ClinicalPrescription): string {
  return [
    "MedApp prescription record — patient copy",
    `Prescription: ${rx.id}`,
    `Patient: ${rx.patient_user_id}`,
    `Status: ${prescriptionStatus(rx)}`,
    `Prescriber: ${rx.prescriber_name}`,
    `Issued: ${rx.issued_at ?? "Not issued"}`,
    `Valid for dispensing through: ${rx.valid_until} (UTC)`,
    `Retrieved: ${new Date().toISOString()}`,
    ...(rx.change_reason ? [`Change reason: ${rx.change_reason}`] : []),
    "",
    ...rx.items.flatMap((item, index) => [
      `${index + 1}. ${item.drug_name} ${item.strength} · ${item.form}`,
      `Dose: ${item.dose}; route: ${item.route}; frequency: ${item.frequency}; duration: ${item.duration}`,
      `Quantity: ${item.quantity}`,
      item.instructions,
      "",
    ]),
    ...rx.deliveries.map(handoffLabel),
    "",
    "This text copy has no verification signature. Check the current prescription and pharmacy status in MedApp.",
  ].join("\n");
}
