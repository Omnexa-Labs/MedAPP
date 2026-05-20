import apiClient from "@/lib/api/client";

export const tenantRepository = {
  list: (params?: { limit?: number; offset?: number }) =>
    apiClient.get("/v1/tenants", { params }),
  get: (id: string) => apiClient.get(`/v1/tenants/${id}`),
  create: (data: Record<string, unknown>) =>
    apiClient.post("/v1/tenants", data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/tenants/${id}`, data),
  delete: (id: string) => apiClient.delete(`/v1/tenants/${id}`),

  getConfig: (tenantId: string) =>
    apiClient.get(`/v1/tenants/${tenantId}/config`),
  updateConfig: (tenantId: string, data: Record<string, unknown>) =>
    apiClient.put(`/v1/tenants/${tenantId}/config`, data),

  listRoles: (tenantId: string) =>
    apiClient.get(`/v1/tenants/${tenantId}/roles`),
  createRole: (tenantId: string, data: Record<string, unknown>) =>
    apiClient.post(`/v1/tenants/${tenantId}/roles`, data),
  updateRole: (tenantId: string, roleId: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/tenants/${tenantId}/roles/${roleId}`, data),
  deleteRole: (tenantId: string, roleId: string) =>
    apiClient.delete(`/v1/tenants/${tenantId}/roles/${roleId}`),
};
