import "server-only";
import { HttpError } from "./errors";
import { SessionManager } from "./session-manager";
import { sessionStore } from "./store";
function upstream(setting: string) {
  return async (path: string, init: RequestInit = {}) => {
    let base: URL;
    try {
      base = new URL(process.env[setting] || "");
      if (
        !["http:", "https:"].includes(base.protocol) ||
        base.username ||
        base.password ||
        base.pathname !== "/" ||
        base.search ||
        base.hash ||
        !path.startsWith("/v1/") ||
        path.includes("..")
      )
        throw new Error();
    } catch {
      throw new HttpError(503, "Pharmacy sign-in has not been configured.");
    }
    try {
      return await fetch(new URL(path, base), {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
      });
    } catch {
      throw new HttpError(
        503,
        "The service could not be reached. Reload before trying again.",
      );
    }
  };
}
export const apiFetch = upstream("PMS_WEB_MEDAPP_API_URL");
export const pmsFetch = upstream("PMS_WEB_API_URL");
export const sessions = new SessionManager(
  sessionStore,
  apiFetch,
  pmsFetch,
  process.env.PMS_WEB_DEPLOYMENT_KEY || "",
);
