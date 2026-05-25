import apiClient from "@/lib/api/client";

export interface POItem {
  id: string;
  purchase_order_id: string;
  drug_id: string;
  quantity: number;
  unit_cost_cents: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  status: "draft" | "sent" | "received" | "cancelled";
  expected_at?: string | null;
  total_cents: number;
  currency: string;
  notes?: string | null;
  created_at: string;
  items: POItem[];
}

export interface POCreate {
  supplier_id: string;
  expected_at?: string;
  notes?: string;
  items: { drug_id: string; quantity: number; unit_cost_cents: number }[];
}

export interface ReceiveLine {
  purchase_order_item_id: string;
  batch_number: string;
  quantity_received: number;
  unit_cost_cents: number;
  selling_price_cents: number;
  received_at: string;
  expiry_date: string;
}

export const purchaseOrdersRepo = {
  list: async (status?: string): Promise<PurchaseOrder[]> => {
    const { data } = await apiClient.get("/v1/purchase-orders", {
      params: status ? { status } : undefined,
    });
    return data.items;
  },
  get: async (id: string): Promise<PurchaseOrder> => {
    const { data } = await apiClient.get(`/v1/purchase-orders/${id}`);
    return data;
  },
  create: async (body: POCreate): Promise<PurchaseOrder> => {
    const { data } = await apiClient.post("/v1/purchase-orders", body);
    return data;
  },
  send: async (id: string): Promise<PurchaseOrder> => {
    const { data } = await apiClient.post(`/v1/purchase-orders/${id}/send`);
    return data;
  },
  cancel: async (id: string): Promise<PurchaseOrder> => {
    const { data } = await apiClient.post(`/v1/purchase-orders/${id}/cancel`);
    return data;
  },
  receive: async (id: string, lines: ReceiveLine[]): Promise<PurchaseOrder> => {
    const { data } = await apiClient.post(`/v1/purchase-orders/${id}/receive`, {
      lines,
    });
    return data;
  },
};
