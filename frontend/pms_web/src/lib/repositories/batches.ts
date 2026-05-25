import apiClient from "@/lib/api/client";

export interface Batch {
  id: string;
  drug_id: string;
  supplier_id?: string | null;
  purchase_order_id?: string | null;
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
  selling_price_cents: number;
  received_at: string;
  expiry_date: string;
}

export interface BatchAdjust {
  delta: number;
  reason: string;
  note?: string;
}

export const batchesRepo = {
  list: async (drugId?: string): Promise<Batch[]> => {
    const { data } = await apiClient.get("/v1/batches", {
      params: drugId ? { drug_id: drugId } : undefined,
    });
    return data.items;
  },
  create: async (body: BatchCreate): Promise<Batch> => {
    const { data } = await apiClient.post("/v1/batches", body);
    return data;
  },
  adjust: async (id: string, body: BatchAdjust): Promise<Batch> => {
    const { data } = await apiClient.post(`/v1/batches/${id}/adjust`, body);
    return data;
  },
};
