import axios from "axios";

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_HMS_API_URL || "http://localhost:8020",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("hms_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("hms_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default apiClient;
