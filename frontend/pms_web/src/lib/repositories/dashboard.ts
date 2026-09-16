import apiClient from "@/lib/api/client";

export interface PharmacyDashboard {
  as_of: string;
  inventory_date: string;
  timezone: string;
  currency: string;
  period: "today" | "week";
  start_date: string;
  end_date: string;
  active_drugs: number;
  pending_prescriptions: number;
  low_stock_count: number;
  expiring_batch_count: number;
  expired_batch_count: number;
  pending_queue: { id: string; number: string; status: string }[];
  low_stock: {
    drug_id: string;
    drug_name: string;
    quantity_on_hand: number;
    reorder_level: number;
  }[];
  expiring_batches: {
    batch_id: string;
    drug_id: string;
    drug_name: string;
    batch_number: string;
    expiry_date: string;
    quantity_on_hand: number;
  }[];
  volume: { label: string; count: number }[];
  sales: {
    currency: string;
    sale_count: number;
    gross_total_cents: number;
    credit_total_cents?: number;
    refund_total_cents?: number;
    net_sales_cents?: number;
  };
}
export const dashboardRepo = {
  get: async (period: "today" | "week", signal?: AbortSignal) => {
    const { data } = await apiClient.get<PharmacyDashboard>(
      "/v1/reports/dashboard",
      { params: { period }, signal },
    );
    return data;
  },
};
