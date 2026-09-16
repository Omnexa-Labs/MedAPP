import apiClient from "@/lib/api/client";

export interface Drug {
  id: string;
  version: number;
  name: string;
  brand_name?: string | null;
  sku?: string | null;
  category: string;
  form: string;
  strength: string;
  unit: string;
  reorder_level: number;
  default_selling_price_cents: number;
  currency: string;
  requires_prescription: boolean;
  is_active: boolean;
  notes?: string | null;
}

export interface DrugWithStock extends Drug {
  quantity_on_hand: number;
  is_low_stock: boolean;
}

export interface DrugCreate {
  name: string;
  brand_name?: string | null;
  sku?: string | null;
  category: string;
  form: string;
  strength: string;
  unit: string;
  reorder_level: number;
  default_selling_price_cents: number;
  requires_prescription?: boolean;
  notes?: string | null;
}

export interface DrugUpdate extends Partial<DrugCreate> {
  version: number;
  is_active?: boolean;
}

export const drugsRepo = {
  page: async (
    params: {
      search?: string;
      active?: boolean;
      low_stock_only?: boolean;
      limit?: number;
      offset?: number;
    },
    signal?: AbortSignal,
  ) => {
    const { data } = await apiClient.get<{
      items: DrugWithStock[];
      total: number;
      limit: number;
      offset: number;
      currency: string;
    }>("/v1/drugs", { params, signal });
    return data;
  },
  list: async (): Promise<DrugWithStock[]> => {
    const items: DrugWithStock[] = [];
    for (let offset = 0; ; offset += 200) {
      const page = await drugsRepo.page({ offset, limit: 200 });
      items.push(...page.items);
      if (!page.items.length || items.length >= page.total) return items;
    }
  },
  get: async (id: string, signal?: AbortSignal): Promise<DrugWithStock> => {
    const { data } = await apiClient.get(`/v1/drugs/${id}`, { signal });
    return data;
  },
  create: async (
    body: DrugCreate,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<Drug> => {
    const { data } = await apiClient.post("/v1/drugs", body, {
      signal,
      headers: { "Idempotency-Key": requestId },
    });
    return data;
  },
  update: async (
    id: string,
    body: DrugUpdate,
    signal?: AbortSignal,
  ): Promise<Drug> => {
    const { data } = await apiClient.patch(`/v1/drugs/${id}`, body, { signal });
    return data;
  },
  lowStock: async () => {
    const { data } = await apiClient.get("/v1/drugs/stock-alerts");
    return data.items as Array<{
      drug_id: string;
      drug_name: string;
      quantity_on_hand: number;
      reorder_level: number;
    }>;
  },
  expiringSoon: async (days = 90) => {
    const { data } = await apiClient.get("/v1/drugs/expiring-soon", {
      params: { days },
    });
    return data.items as Array<{
      batch_id: string;
      drug_id: string;
      drug_name: string;
      batch_number: string;
      quantity_on_hand: number;
      expiry_date: string;
    }>;
  },
};
