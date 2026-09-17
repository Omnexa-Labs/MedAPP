import apiClient from "@/lib/api/client";

export interface MedAppDelivery {
  id: string;
  sequence: number;
  kind: "received" | "dispensed" | "corrected" | "cancelled" | "reconciled";
  state: "pending" | "retry" | "sending" | "delivered" | "attention_required";
  version: number;
  attempts: number;
  created_at: string;
  next_attempt_at: string;
  delivered_at: string | null;
  last_error: string | null;
  can_retry: boolean;
}
export interface DeliveryPage {
  items: MedAppDelivery[];
  total: number;
  limit: number;
  offset: number;
}
export const deliveriesRepo = {
  async page(
    rxId: string,
    offset: number,
    signal?: AbortSignal,
  ): Promise<DeliveryPage> {
    const { data } = await apiClient.get(
      `/v1/prescriptions/${rxId}/medapp-deliveries`,
      { params: { offset, limit: 25 }, signal },
    );
    return data;
  },
  async retry(
    rxId: string,
    delivery: MedAppDelivery,
    key: string,
    signal: AbortSignal,
  ): Promise<MedAppDelivery> {
    const { data } = await apiClient.post(
      `/v1/prescriptions/${rxId}/medapp-deliveries/${delivery.id}/retry`,
      { version: delivery.version },
      { headers: { "Idempotency-Key": key }, signal },
    );
    return data;
  },
};
