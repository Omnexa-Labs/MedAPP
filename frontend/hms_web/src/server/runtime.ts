import "server-only";
import { HttpError } from "./errors";
import { SessionManager } from "./session-manager";
import { sessionStore } from "./store";
export async function apiFetch(path: string, init: RequestInit = {}) {
  let base: URL;
  try {
    base = new URL(process.env.HMS_WEB_API_URL || "");
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
    throw new HttpError(503, "The hospital service is not configured.");
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
}
export const sessions = new SessionManager(sessionStore, apiFetch);
