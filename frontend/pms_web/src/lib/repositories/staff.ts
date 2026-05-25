import apiClient from "@/lib/api/client";

export interface Staff {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: "pharmacy_admin" | "pharmacist" | "cashier";
  is_active: boolean;
  created_at: string;
}

export interface StaffCreate {
  full_name: string;
  email: string;
  phone?: string;
  role: "pharmacy_admin" | "pharmacist" | "cashier";
  password: string;
}

export const staffRepo = {
  list: async (): Promise<Staff[]> => {
    const { data } = await apiClient.get("/v1/staff");
    return data.items;
  },
  create: async (body: StaffCreate): Promise<Staff> => {
    const { data } = await apiClient.post("/v1/staff", body);
    return data;
  },
  update: async (id: string, body: Partial<StaffCreate & { is_active: boolean }>) => {
    const { data } = await apiClient.patch(`/v1/staff/${id}`, body);
    return data as Staff;
  },
};
