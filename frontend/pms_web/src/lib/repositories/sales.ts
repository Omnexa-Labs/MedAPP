import apiClient from "@/lib/api/client";
import type {
  CancelTransaction,
  Page,
  PaymentDetails,
  TransactionQuote,
} from "./transactions";

export interface SaleItem {
  id: string;
  sale_id: string;
  prescription_item_id?: string | null;
  corrected_quantity?: number;
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
  version: number;
  notes?: string | null;
  void_reason?: string | null;
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
  credited_cents?: number;
  refunded_cents?: number;
  refundable_cents?: number;
}

export interface WalkInSaleCreate extends PaymentDetails {
  customer_id?: string;
  items: { drug_id: string; quantity: number; unit_price_cents?: number }[];
  discount_cents?: number;
  tax_cents?: number;
}

export const salesRepo = {
  page: async (
    params: {
      status?: string;
      payment_method?: string;
      prescription_id?: string;
      search?: string;
      offset?: number;
      limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<Page<Sale>> => {
    const { data } = await apiClient.get("/v1/sales", { params, signal });
    return data;
  },
  get: async (id: string, signal?: AbortSignal): Promise<Sale> => {
    const { data } = await apiClient.get(`/v1/sales/${id}`, { signal });
    return data;
  },
  quote: async (
    body: WalkInSaleCreate,
    signal?: AbortSignal,
  ): Promise<TransactionQuote> => {
    const { data } = await apiClient.post("/v1/sales/quote", body, { signal });
    return data;
  },
  createWalkIn: async (
    body: WalkInSaleCreate,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<Sale> => {
    const { data } = await apiClient.post("/v1/sales", body, {
      signal,
      headers: { "Idempotency-Key": requestId },
    });
    return data;
  },
  voidSale: async (
    id: string,
    body: CancelTransaction,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<Sale> => {
    const { data } = await apiClient.post(`/v1/sales/${id}/void`, body, {
      signal,
      headers: { "Idempotency-Key": requestId },
    });
    return data;
  },
};
