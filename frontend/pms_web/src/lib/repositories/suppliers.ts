import apiClient from "@/lib/api/client";

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active: boolean;
}

export interface SupplierCreate {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export const suppliersRepo = {
  list: async (includeInactive = false): Promise<Supplier[]> => {
    const { data } = await apiClient.get("/v1/suppliers", {
      params: { include_inactive: includeInactive },
    });
    return data.items;
  },
  create: async (body: SupplierCreate): Promise<Supplier> => {
    const { data } = await apiClient.post("/v1/suppliers", body);
    return data;
  },
  update: async (id: string, body: Partial<SupplierCreate & { is_active: boolean }>) => {
    const { data } = await apiClient.patch(`/v1/suppliers/${id}`, body);
    return data as Supplier;
  },
};
