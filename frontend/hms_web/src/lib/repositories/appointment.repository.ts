import apiClient from "@/lib/api/client";

export const appointmentRepository = {
  list: (params?: { patient_id?: string; doctor_id?: string; status?: string; date?: string; limit?: number; offset?: number }) =>
    apiClient.get("/v1/appointments", { params }),
  get: (id: string) => apiClient.get(`/v1/appointments/${id}`),
  create: (data: Record<string, unknown>) =>
    apiClient.post("/v1/appointments", data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/appointments/${id}`, data),
  delete: (id: string) => apiClient.delete(`/v1/appointments/${id}`),

  listQueue: (params?: { department_id?: string; status?: string; limit?: number; offset?: number }) =>
    apiClient.get("/v1/queue", { params }),
  getQueueStats: () => apiClient.get("/v1/queue/stats"),
  addToQueue: (data: Record<string, unknown>) =>
    apiClient.post("/v1/queue", data),
  callNext: (department_id?: string) =>
    apiClient.post("/v1/queue/call-next", { department_id }),
  completeQueue: (ticketId: string) =>
    apiClient.post(`/v1/queue/${ticketId}/complete`),
  skipQueue: (ticketId: string) =>
    apiClient.post(`/v1/queue/${ticketId}/skip`),
};
