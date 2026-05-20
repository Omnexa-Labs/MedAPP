import apiClient from "@/lib/api/client";

export const billingRepository = {
  listInvoices: (params?: { patient_id?: string; status?: string; limit?: number; offset?: number }) =>
    apiClient.get("/v1/invoices", { params }),
  getInvoice: (id: string) => apiClient.get(`/v1/invoices/${id}`),
  createInvoice: (data: Record<string, unknown>) =>
    apiClient.post("/v1/invoices", data),
  updateInvoice: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/invoices/${id}`, data),
  deleteInvoice: (id: string) => apiClient.delete(`/v1/invoices/${id}`),

  listItems: (invoiceId: string) =>
    apiClient.get(`/v1/invoices/${invoiceId}/items`),
  addItem: (invoiceId: string, data: Record<string, unknown>) =>
    apiClient.post(`/v1/invoices/${invoiceId}/items`, data),
  updateItem: (invoiceId: string, itemId: string, data: Record<string, unknown>) =>
    apiClient.patch(`/v1/invoices/${invoiceId}/items/${itemId}`, data),
  removeItem: (invoiceId: string, itemId: string) =>
    apiClient.delete(`/v1/invoices/${invoiceId}/items/${itemId}`),

  listPayments: (invoiceId: string) =>
    apiClient.get(`/v1/invoices/${invoiceId}/payments`),
  addPayment: (invoiceId: string, data: Record<string, unknown>) =>
    apiClient.post(`/v1/invoices/${invoiceId}/payments`, data),

  getSummary: (params?: { from?: string; to?: string }) =>
    apiClient.get("/v1/billing/summary", { params }),
};
