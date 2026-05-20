import apiClient from "@/lib/api/client";

export const staffRepository = {
  list: (params?: { search?: string; role?: string; department_id?: string; limit?: number; offset?: number }) =>
    apiClient.get("/v1/staff", { params }),
  get: (id: string) => apiClient.get(`/v1/staff/${id}`),
  create: (data: Record<string, unknown>) => apiClient.post("/v1/staff", data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/staff/${id}`, data),
  delete: (id: string) => apiClient.delete(`/v1/staff/${id}`),

  getSchedule: (staffId: string) =>
    apiClient.get(`/v1/staff/${staffId}/schedule`),
  updateSchedule: (staffId: string, data: Record<string, unknown>) =>
    apiClient.put(`/v1/staff/${staffId}/schedule`, data),

  listDepartments: (params?: { limit?: number; offset?: number }) =>
    apiClient.get("/v1/departments", { params }),
  getDepartment: (id: string) => apiClient.get(`/v1/departments/${id}`),
  createDepartment: (data: Record<string, unknown>) =>
    apiClient.post("/v1/departments", data),
  updateDepartment: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/departments/${id}`, data),
  deleteDepartment: (id: string) => apiClient.delete(`/v1/departments/${id}`),
};
