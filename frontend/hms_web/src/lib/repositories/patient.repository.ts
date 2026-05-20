import apiClient from "@/lib/api/client";

export const patientRepository = {
  list: (params?: { search?: string; limit?: number; offset?: number }) =>
    apiClient.get("/v1/patients", { params }),
  get: (id: string) => apiClient.get(`/v1/patients/${id}`),
  create: (data: Record<string, unknown>) => apiClient.post("/v1/patients", data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/patients/${id}`, data),
  createVisit: (patientId: string, data: Record<string, unknown>) =>
    apiClient.post(`/v1/patients/${patientId}/visits`, data),
  listVisits: (patientId: string) =>
    apiClient.get(`/v1/patients/${patientId}/visits`),
  getVisit: (visitId: string) => apiClient.get(`/v1/visits/${visitId}`),
  updateVisit: (visitId: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/visits/${visitId}`, data),
};
