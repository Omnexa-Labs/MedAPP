import apiClient from "@/lib/api/client";

export interface SalesSummary {
  start_date: string;
  end_date: string;
  sale_count: number;
  gross_total_cents: number;
  discount_cents: number;
  by_payment_method: { method: string; count: number; total_cents: number }[];
}

export interface DailySalesPoint {
  day: string;
  sale_count: number;
  total_cents: number;
}

export interface TopDrug {
  drug_id: string;
  drug_name: string;
  units_sold: number;
  revenue_cents: number;
}

export interface DashboardOverview {
  sales_summary: SalesSummary;
  stock_valuation: {
    cost_value_cents: number;
    sell_value_cents: number;
    total_units: number;
  };
  low_stock_count: number;
  expiring_soon_count: number;
  pending_prescriptions: number;
}

const range = (start?: string, end?: string) =>
  start || end ? { params: { start, end } } : undefined;

export const reportsRepo = {
  overview: async (): Promise<DashboardOverview> => {
    const { data } = await apiClient.get("/v1/reports/overview");
    return data;
  },
  salesSummary: async (start?: string, end?: string): Promise<SalesSummary> => {
    const { data } = await apiClient.get("/v1/reports/sales-summary", range(start, end));
    return data;
  },
  salesDaily: async (start?: string, end?: string): Promise<DailySalesPoint[]> => {
    const { data } = await apiClient.get("/v1/reports/sales-daily", range(start, end));
    return data.items;
  },
  topDrugs: async (start?: string, end?: string, limit = 10): Promise<TopDrug[]> => {
    const { data } = await apiClient.get("/v1/reports/top-drugs", {
      params: { start, end, limit },
    });
    return data.items;
  },
  stockValuation: async () => {
    const { data } = await apiClient.get("/v1/reports/stock-valuation");
    return data as { cost_value_cents: number; sell_value_cents: number; total_units: number };
  },
};
