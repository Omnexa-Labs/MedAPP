import apiClient from "@/lib/api/client";

export const pharmacyRepository = {
  listDrugs: (params?: { search?: string; category?: string; limit?: number; offset?: number }) =>
    apiClient.get("/v1/pharmacy/drugs", { params }),
  getDrug: (id: string) => apiClient.get(`/v1/pharmacy/drugs/${id}`),
  createDrug: (data: Record<string, unknown>) =>
    apiClient.post("/v1/pharmacy/drugs", data),
  updateDrug: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/pharmacy/drugs/${id}`, data),
  deleteDrug: (id: string) => apiClient.delete(`/v1/pharmacy/drugs/${id}`),

  listBatches: (drugId: string) =>
    apiClient.get(`/v1/pharmacy/drugs/${drugId}/batches`),
  createBatch: (drugId: string, data: Record<string, unknown>) =>
    apiClient.post(`/v1/pharmacy/drugs/${drugId}/batches`, data),

  listStockAlerts: (params?: { limit?: number; offset?: number }) =>
    apiClient.get("/v1/pharmacy/stock-alerts", { params }),

  listPrescriptions: (params?: { patient_id?: string; status?: string; limit?: number; offset?: number }) =>
    apiClient.get("/v1/prescriptions", { params }),
  getPrescription: (id: string) => apiClient.get(`/v1/prescriptions/${id}`),
  createPrescription: (data: Record<string, unknown>) =>
    apiClient.post("/v1/prescriptions", data),
  updatePrescription: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/prescriptions/${id}`, data),
  dispensePrescription: (id: string, data: Record<string, unknown>) =>
    apiClient.post(`/v1/prescriptions/${id}/dispense`, data),
};
