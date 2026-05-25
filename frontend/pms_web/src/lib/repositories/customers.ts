import apiClient from "@/lib/api/client";

export interface Customer {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  medapp_user_id?: string | null;
  notes?: string | null;
}

export interface CustomerCreate {
  full_name: string;
  phone?: string;
  email?: string;
  date_of_birth?: string;
  medapp_user_id?: string;
  notes?: string;
}

export const customersRepo = {
  list: async (q?: string): Promise<Customer[]> => {
    const { data } = await apiClient.get("/v1/customers", { params: q ? { q } : undefined });
    return data.items;
  },
  create: async (body: CustomerCreate): Promise<Customer> => {
    const { data } = await apiClient.post("/v1/customers", body);
    return data;
  },
  update: async (id: string, body: Partial<CustomerCreate>) => {
    const { data } = await apiClient.patch(`/v1/customers/${id}`, body);
    return data as Customer;
  },
};
