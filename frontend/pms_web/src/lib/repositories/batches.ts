import apiClient from "@/lib/api/client";

export interface Batch {
  id: string;
  version: number;
  drug_name?: string | null;
  drug_id: string;
  supplier_id?: string | null;
  purchase_order_id?: string | null;
  purchase_order_item_id?: string | null;
  delivery_reference?: string | null;
  batch_number: string;
  quantity_received: number;
  quantity_on_hand: number;
  unit_cost_cents: number;
  selling_price_cents: number;
  currency: string;
  received_at: string;
  expiry_date: string;
}

export interface BatchCreate {
  drug_id: string;
  supplier_id?: string | null;
  batch_number: string;
  quantity_received: number;
  unit_cost_cents: number;
  selling_price_cents?: number | null;
  received_at: string;
  expiry_date: string;
}

export interface BatchAdjust {
  version: number;
  delta: number;
  reason: "adjust" | "expire" | "return";
  note: string;
}

export const batchesRepo = {
  page: async (
    params: {
      drug_id?: string;
      purchase_order_id?: string;
      state?: string;
      limit?: number;
      offset?: number;
    },
    signal?: AbortSignal,
  ) => {
    const { data } = await apiClient.get<{
      items: Batch[];
      inventory_date: string;
      total: number;
      limit: number;
      offset: number;
    }>("/v1/batches", { params, signal });
    return data;
  },
  movements: async (id: string, offset: number, signal?: AbortSignal) => {
    const { data } = await apiClient.get<{
      items: {
        id: string;
        delta: number;
        reason: string;
        note: string | null;
        actor_name: string | null;
        created_at: string;
      }[];
      has_more: boolean;
    }>(`/v1/batches/${id}/movements`, { params: { offset }, signal });
    return data;
  },
  list: async (drugId?: string): Promise<Batch[]> => {
    const { data } = await apiClient.get("/v1/batches", {
      params: drugId ? { drug_id: drugId } : undefined,
    });
    return data.items;
  },
  create: async (
    body: BatchCreate,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<Batch> => {
    const { data } = await apiClient.post("/v1/batches", body, {
      signal,
      headers: { "Idempotency-Key": requestId },
    });
    return data;
  },
  adjust: async (
    id: string,
    body: BatchAdjust,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<Batch> => {
    const { data } = await apiClient.post(`/v1/batches/${id}/adjust`, body, {
      signal,
      headers: { "Idempotency-Key": requestId },
    });
    return data;
  },
};
