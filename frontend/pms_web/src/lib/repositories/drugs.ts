import apiClient from "@/lib/api/client";

export interface Drug {
  id: string;
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
}

export interface DrugCreate {
  name: string;
  brand_name?: string;
  sku?: string;
  category: string;
  form: string;
  strength: string;
  unit: string;
  reorder_level: number;
  default_selling_price_cents: number;
  requires_prescription?: boolean;
  notes?: string;
}

export interface DrugUpdate extends Partial<DrugCreate> {
  is_active?: boolean;
}

export const drugsRepo = {
  list: async (): Promise<DrugWithStock[]> => {
    const { data } = await apiClient.get<{ items: DrugWithStock[] }>("/v1/drugs");
    return data.items;
  },
  get: async (id: string): Promise<DrugWithStock> => {
    const { data } = await apiClient.get(`/v1/drugs/${id}`);
    return data;
  },
  create: async (body: DrugCreate): Promise<Drug> => {
    const { data } = await apiClient.post("/v1/drugs", body);
    return data;
  },
  update: async (id: string, body: DrugUpdate): Promise<Drug> => {
    const { data } = await apiClient.patch(`/v1/drugs/${id}`, body);
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
    const { data } = await apiClient.get("/v1/drugs/expiring-soon", { params: { days } });
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
