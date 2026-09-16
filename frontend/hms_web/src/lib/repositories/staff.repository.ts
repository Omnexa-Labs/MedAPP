import apiClient from "@/lib/api/client";

export const staffRepository = {
  list: (
    params?: {
      search?: string;
      department_id?: string;
      specialty?: string;
      limit?: number;
      offset?: number;
    },
    signal?: AbortSignal,
  ) => apiClient.get("/v1/staff", { params, signal }),
  get: (id: string, signal?: AbortSignal) =>
    apiClient.get(`/v1/staff/${id}`, { signal }),
  create: (data: Record<string, unknown>) => apiClient.post("/v1/staff", data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/staff/${id}`, data),
  delete: (id: string) => apiClient.delete(`/v1/staff/${id}`),

  getSchedule: (staffId: string) =>
    apiClient.get(`/v1/staff/${staffId}/schedule`),
  updateSchedule: (staffId: string, data: Record<string, unknown>) =>
    apiClient.put(`/v1/staff/${staffId}/schedule`, data),

  listDepartments: (
    params?: { limit?: number; offset?: number },
    signal?: AbortSignal,
  ) => apiClient.get("/v1/departments", { params, signal }),
  getDepartment: (id: string) => apiClient.get(`/v1/departments/${id}`),
  createDepartment: (data: Record<string, unknown>) =>
    apiClient.post("/v1/departments", data),
  updateDepartment: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/departments/${id}`, data),
  deleteDepartment: (id: string) => apiClient.delete(`/v1/departments/${id}`),
};
