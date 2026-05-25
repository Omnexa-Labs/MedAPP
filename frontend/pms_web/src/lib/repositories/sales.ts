import apiClient from "@/lib/api/client";

export interface SaleItem {
  id: string;
  sale_id: string;
  drug_id: string;
  drug_batch_id: string;
  drug_name_snapshot: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}

export interface Sale {
  id: string;
  sale_number: string;
  prescription_id?: string | null;
  customer_id?: string | null;
  cashier_staff_id?: string | null;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  payment_method: string;
  payment_ref?: string | null;
  status: "completed" | "voided";
  completed_at?: string | null;
  created_at: string;
  items: SaleItem[];
}

export interface WalkInSaleCreate {
  customer_id?: string;
  items: { drug_id: string; quantity: number; unit_price_cents?: number }[];
  payment_method?: string;
  payment_ref?: string;
  discount_cents?: number;
  tax_cents?: number;
  notes?: string;
}

export const salesRepo = {
  list: async (filter?: { status?: string; payment_method?: string }): Promise<Sale[]> => {
    const { data } = await apiClient.get("/v1/sales", { params: filter });
    return data.items;
  },
  get: async (id: string): Promise<Sale> => {
    const { data } = await apiClient.get(`/v1/sales/${id}`);
    return data;
  },
  createWalkIn: async (body: WalkInSaleCreate): Promise<Sale> => {
    const { data } = await apiClient.post("/v1/sales", body);
    return data;
  },
  voidSale: async (id: string): Promise<Sale> => {
    const { data } = await apiClient.post(`/v1/sales/${id}/void`);
    return data;
  },
};
