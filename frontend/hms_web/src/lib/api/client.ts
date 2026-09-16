import axios, { CanceledError } from "axios";
import { useAuthStore } from "@/lib/stores/auth.store";
const apiClient = axios.create({
  timeout: 25000,
  headers: { "Content-Type": "application/json" },
});
apiClient.interceptors.request.use((config) => {
  const { scope, identity } = useAuthStore.getState();
  if (!scope || !identity?.workspace)
    throw new CanceledError("Choose a hospital workspace.");
  if (!config.url?.startsWith("/v1/"))
    throw new Error("Unknown hospital API route.");
  config.url = "/api/hms/" + config.url.slice("/v1/".length);
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
      throw new CanceledError("Hospital changed.");
    return response;
  },
  (error) => {
    const sentScope = error.config?.headers?.get?.("X-Session-Scope");
    if (sentScope && sentScope === useAuthStore.getState().scope) {
      if (
        error.response?.status === 401 ||
        ["session_changed", "workspace_required"].includes(
          error.response?.data?.code,
        )
      )
        void useAuthStore.getState().invalidate();
      else if (error.response?.status === 403)
        void useAuthStore.getState().hydrate();
    }
    return Promise.reject(error);
  },
);
export default apiClient;
