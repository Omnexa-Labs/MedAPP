import apiClient from "@/lib/api/client";
import { batchesRepo } from "./batches";

export type OrderStatus =
  "draft" | "sent" | "partially_received" | "received" | "cancelled";
export const orderStatusLabel: Record<OrderStatus, string> = {
  draft: "Draft",
  sent: "Ordered",
  partially_received: "Partly received",
  received: "Received",
  cancelled: "Cancelled",
};
export interface POItem {
  id: string;
  purchase_order_id: string;
  drug_id: string;
  drug_name: string;
  quantity: number;
  quantity_received: number | null;
  quantity_outstanding: number | null;
  quantity_cancelled: number | null;
  unit_cost_cents: number;
}
export interface PurchaseOrder {
  id: string;
  version: number;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  status: OrderStatus;
  receiving_reconciled: boolean;
  cancellation_reason: string | null;
  expected_at: string | null;
  total_cents: number;
  currency: string;
  notes: string | null;
  created_at: string;
  items: POItem[];
}
export interface POCreate {
  supplier_id: string;
  expected_at: string | null;
  notes: string | null;
  items: { drug_id: string; quantity: number; unit_cost_cents: number }[];
}
export interface ReceiveLine {
  purchase_order_item_id: string;
  batch_number: string;
  quantity_received: number;
  unit_cost_cents: number | null;
  selling_price_cents: number | null;
  expiry_date: string;
}
export interface Delivery {
  version: number;
  received_at: string;
  delivery_reference: string | null;
  lines: ReceiveLine[];
}
export interface Reconciliation {
  version: number;
  note: string;
  allocations: { batch_id: string; purchase_order_item_id: string }[];
}
export interface OrderHistoryEntry {
  id: string;
  action: string;
  actor_name: string | null;
  created_at: string;
  details: {
    before?: PurchaseOrder;
    after?: PurchaseOrder;
    note?: string;
    delivery_reference?: string;
    received_at?: string;
    batch_ids?: string[];
  };
}
const config = (key: string, signal?: AbortSignal) => ({
  signal,
  headers: { "Idempotency-Key": key },
});
export const purchaseOrdersRepo = {
  page: async (
    params: {
      status?: string;
      search?: string;
      offset?: number;
      limit?: number;
    },
    signal?: AbortSignal,
  ) => {
    const { data } = await apiClient.get<{
      items: PurchaseOrder[];
      total: number;
      limit: number;
      offset: number;
      currency: string;
    }>("/v1/purchase-orders", { params, signal });
    return data;
  },
  get: async (id: string, signal?: AbortSignal): Promise<PurchaseOrder> => {
    const { data } = await apiClient.get(`/v1/purchase-orders/${id}`, {
      signal,
    });
    return data;
  },
  create: async (
    body: POCreate,
    key: string,
    signal?: AbortSignal,
  ): Promise<PurchaseOrder> => {
    const { data } = await apiClient.post(
      "/v1/purchase-orders",
      body,
      config(key, signal),
    );
    return data;
  },
  update: async (
    id: string,
    body: POCreate & { version: number },
    key: string,
    signal?: AbortSignal,
  ): Promise<PurchaseOrder> => {
    const { data } = await apiClient.patch(
      `/v1/purchase-orders/${id}`,
      body,
      config(key, signal),
    );
    return data;
  },
  send: async (
    id: string,
    version: number,
    key: string,
    signal?: AbortSignal,
  ): Promise<PurchaseOrder> => {
    const { data } = await apiClient.post(
      `/v1/purchase-orders/${id}/send`,
      { version },
      config(key, signal),
    );
    return data;
  },
  cancel: async (
    id: string,
    version: number,
    reason: string,
    key: string,
    signal?: AbortSignal,
  ): Promise<PurchaseOrder> => {
    const { data } = await apiClient.post(
      `/v1/purchase-orders/${id}/cancel`,
      { version, reason },
      config(key, signal),
    );
    return data;
  },
  receive: async (
    id: string,
    body: Delivery,
    key: string,
    signal?: AbortSignal,
  ): Promise<PurchaseOrder> => {
    const { data } = await apiClient.post(
      `/v1/purchase-orders/${id}/receive`,
      body,
      config(key, signal),
    );
    return data;
  },
  reconcile: async (
    id: string,
    body: Reconciliation,
    key: string,
    signal?: AbortSignal,
  ): Promise<PurchaseOrder> => {
    const { data } = await apiClient.post(
      `/v1/purchase-orders/${id}/reconcile`,
      body,
      config(key, signal),
    );
    return data;
  },
  history: async (id: string, offset: number, signal?: AbortSignal) => {
    const { data } = await apiClient.get<{
      items: OrderHistoryEntry[];
      has_more: boolean;
    }>(`/v1/purchase-orders/${id}/history`, { params: { offset }, signal });
    return data;
  },
  legacyBatches: async (id: string, signal?: AbortSignal) => {
    const rows = [];
    for (let offset = 0; ; offset += 200) {
      const page = await batchesRepo.page(
        { purchase_order_id: id, offset, limit: 200 },
        signal,
      );
      if (page.total > 500)
        throw {
          response: {
            status: 422,
            data: {
              detail:
                "This order has more than 500 historical batches. A records review is required before receiving more stock.",
            },
          },
        };
      rows.push(...page.items);
      if (rows.length >= page.total || page.items.length === 0) return rows;
    }
  },
};
