import apiClient from "@/lib/api/client";
import type {
  CancelTransaction,
  Page,
  PaymentDetails,
  TransactionQuote,
} from "./transactions";

export interface RxItem {
  id: string;
  prescription_id: string;
  drug_id: string;
  drug_name_snapshot: string;
  quantity_prescribed: number;
  quantity_dispensed: number;
  dosage_instructions?: string | null;
}

export interface Prescription {
  id: string;
  rx_number: string;
  version: number;
  cancellation_reason?: string | null;
  source: "walk_in" | "medapp" | "internal";
  external_ref?: string | null;
  customer_id?: string | null;
  prescriber_name?: string | null;
  prescriber_license?: string | null;
  valid_until?: string | null;
  status: "pending" | "partially_dispensed" | "dispensed" | "cancelled";
  notes?: string | null;
  created_at: string;
  items: RxItem[];
}

export interface RxCreate {
  customer_id?: string;
  prescriber_name?: string;
  prescriber_license?: string;
  source?: "walk_in" | "internal";
  notes?: string;
  items: {
    drug_id: string;
    quantity_prescribed: number;
    dosage_instructions?: string;
  }[];
}

export interface DispenseLine {
  prescription_item_id: string;
  quantity: number;
}

export interface DispenseRequest extends PaymentDetails {
  version: number;
  items: DispenseLine[];
}

export interface DispenseResult {
  prescription_id: string;
  rx_status: Prescription["status"];
  rx_version: number;
  sale_id: string;
  sale_number: string;
  sale_total_cents: number;
  currency: string;
  lines: {
    prescription_item_id: string;
    dispensed_quantity: number;
    from_batches: {
      batch_id: string;
      quantity: number;
      unit_price_cents: number;
    }[];
  }[];
}

export const prescriptionsRepo = {
  page: async (
    params: {
      status?: string;
      source?: string;
      search?: string;
      offset?: number;
      limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<Page<Prescription>> => {
    const { data } = await apiClient.get("/v1/prescriptions", {
      params,
      signal,
    });
    return data;
  },
  get: async (id: string, signal?: AbortSignal): Promise<Prescription> => {
    const { data } = await apiClient.get(`/v1/prescriptions/${id}`, { signal });
    return data;
  },
  create: async (
    body: RxCreate,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<Prescription> => {
    const { data } = await apiClient.post("/v1/prescriptions", body, {
      signal,
      headers: { "Idempotency-Key": requestId },
    });
    return data;
  },
  quote: async (
    id: string,
    body: DispenseRequest,
    signal?: AbortSignal,
  ): Promise<TransactionQuote> => {
    const { data } = await apiClient.post(
      `/v1/prescriptions/${id}/quote`,
      body,
      { signal },
    );
    return data;
  },
  dispense: async (
    id: string,
    body: DispenseRequest,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<DispenseResult> => {
    const { data } = await apiClient.post(
      `/v1/prescriptions/${id}/dispense`,
      body,
      { signal, headers: { "Idempotency-Key": requestId } },
    );
    return data;
  },
  cancel: async (
    id: string,
    body: CancelTransaction,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<Prescription> => {
    const { data } = await apiClient.post(
      `/v1/prescriptions/${id}/cancel`,
      body,
      { signal, headers: { "Idempotency-Key": requestId } },
    );
    return data;
  },
};
