import apiClient from "@/lib/api/client";

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
  source: "walk_in" | "medapp" | "internal";
  external_ref?: string | null;
  customer_id?: string | null;
  prescriber_name?: string | null;
  prescriber_license?: string | null;
  status: "pending" | "partially_dispensed" | "dispensed" | "cancelled";
  notes?: string | null;
  created_at: string;
  items: RxItem[];
}

export interface RxCreate {
  customer_id?: string;
  prescriber_name?: string;
  prescriber_license?: string;
  source?: string;
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

export interface DispenseRequest {
  items: DispenseLine[];
  payment_method?: string;
  payment_ref?: string;
  notes?: string;
}

export const prescriptionsRepo = {
  list: async (filter?: { status?: string; source?: string }): Promise<Prescription[]> => {
    const { data } = await apiClient.get("/v1/prescriptions", { params: filter });
    return data.items;
  },
  get: async (id: string): Promise<Prescription> => {
    const { data } = await apiClient.get(`/v1/prescriptions/${id}`);
    return data;
  },
  create: async (body: RxCreate): Promise<Prescription> => {
    const { data } = await apiClient.post("/v1/prescriptions", body);
    return data;
  },
  dispense: async (id: string, body: DispenseRequest) => {
    const { data } = await apiClient.post(`/v1/prescriptions/${id}/dispense`, body);
    return data;
  },
  cancel: async (id: string): Promise<Prescription> => {
    const { data } = await apiClient.post(`/v1/prescriptions/${id}/cancel`);
    return data;
  },
};
