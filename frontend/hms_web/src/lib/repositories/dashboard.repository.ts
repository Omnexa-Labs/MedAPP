import apiClient from "@/lib/api/client";

export const dashboardRepository = {
  getSummary: () => apiClient.get("/v1/dashboard/summary"),
};
