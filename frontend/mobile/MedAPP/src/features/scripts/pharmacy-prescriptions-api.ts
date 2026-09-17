import { z } from "zod";
import { client, type RequestOptions } from "@/lib/api/client";

const count = z.number().int().min(0).max(1_000_000);
const itemSchema = z
  .object({
    prescription_item_id: z.string().uuid(),
    drug_name: z.string().trim().min(1).max(255),
    dosage_instructions: z.string().max(512).nullable(),
    quantity_prescribed: count.min(1),
    quantity_dispensed: count,
    quantity_returned: count,
  })
  .refine(
    (item) =>
      item.quantity_returned <= item.quantity_dispensed &&
      item.quantity_dispensed <= item.quantity_prescribed,
  );
const snapshotSchema = z
  .object({
    rx_number: z.string().min(1).max(32),
    rx_version: z.number().int().positive(),
    status: z.enum(["pending", "partially_dispensed", "dispensed", "cancelled"]),
    prescriber_name: z.string().max(255).nullable(),
    items: z.array(itemSchema).min(1).max(100),
  })
  .refine((snapshot) => {
    if (
      new Set(snapshot.items.map((item) => item.prescription_item_id)).size !==
      snapshot.items.length
    )
      return false;
    const any = snapshot.items.some((item) => item.quantity_dispensed > 0);
    const all = snapshot.items.every(
      (item) => item.quantity_dispensed === item.quantity_prescribed,
    );
    return (
      snapshot.status === "cancelled" ||
      (snapshot.status === "pending" ? !any : snapshot.status === "dispensed" ? all : any && !all)
    );
  });
const recordSchema = z.object({
  id: z.string().uuid(),
  pharmacy_id: z.string().uuid(),
  pharmacy_name: z.string().trim().min(1).max(255),
  sequence: z.number().int().positive(),
  reported_at: z.iso.datetime({ offset: true }),
  snapshot: snapshotSchema,
});
const pageSchema = z.object({
  items: z.array(recordSchema).max(25),
  total: z.number().int().nonnegative(),
  limit: z.literal(25),
  offset: z.number().int().nonnegative(),
});
export type PharmacyPrescription = z.infer<typeof recordSchema>;
export async function pharmacyPrescriptions(offset: number, options: RequestOptions) {
  const data = await client.get<unknown>(
    `/v1/me/pharmacy-prescriptions?limit=25&offset=${offset}`,
    options,
  );
  const result = pageSchema.safeParse(data);
  if (
    !result.success ||
    result.data.offset !== offset ||
    result.data.total < result.data.items.length ||
    new Set(result.data.items.map((item) => item.id)).size !== result.data.items.length
  ) {
    throw new Error("Your pharmacy records could not be confirmed. Please refresh.");
  }
  return result.data;
}
