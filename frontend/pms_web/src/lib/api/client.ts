import axios, { CanceledError } from "axios";
import { useAuthStore } from "@/lib/stores/auth.store";
const apiClient = axios.create({
  timeout: 25000,
  headers: { "Content-Type": "application/json" },
});
apiClient.interceptors.request.use((config) => {
  const { scope, identity } = useAuthStore.getState();
  if (!scope || !identity) throw new CanceledError("Sign in to your pharmacy.");
  if (!config.url?.startsWith("/v1/"))
    throw new Error("Unknown pharmacy API route.");
  config.url = "/api/pms/" + config.url.slice("/v1/".length);
  config.baseURL = "";
  config.headers.delete("Authorization");
  config.headers.set("X-Session-Scope", scope);
  return config;
});
apiClient.interceptors.response.use(
  (response) => {
    if (
      response.config.headers.get("X-Session-Scope") !==
      useAuthStore.getState().scope
    )
      throw new CanceledError("Pharmacy session changed.");
    return response;
  },
  (error) => {
    const sent = error.config?.headers?.get?.("X-Session-Scope");
    if (sent && sent !== useAuthStore.getState().scope)
      return Promise.reject(new CanceledError("Pharmacy session changed."));
    if (sent) {
      if (
        error.response?.status === 401 ||
        error.response?.data?.code === "session_changed"
      )
        void useAuthStore.getState().invalidate();
      else if (error.response?.status === 403)
        void useAuthStore.getState().hydrate();
    }
    return Promise.reject(error);
  },
);
export default apiClient;
