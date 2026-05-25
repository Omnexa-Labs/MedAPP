import { ApiError } from "@/types/api";
import { config } from "@/lib/config";

// HTTP client for MedApp mobile.
//
// - Single configured fetch wrapper. Features call `client.get` / `client.post`
//   etc., never raw `fetch`.
// - Token injection happens via a getter the auth store registers at startup
//   (`registerAuthTokenProvider`). This avoids a circular import between the
//   client and the store.
// - All non-2xx responses throw `ApiError` so React Query's `retry` callback
//   can branch on status (no retries on 4xx).
// - Network failures throw `ApiError` with status === 0.

type AuthTokenProvider = () => string | null;
let authTokenProvider: AuthTokenProvider | null = null;

export function registerAuthTokenProvider(provider: AuthTokenProvider): void {
  authTokenProvider = provider;
}

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  // If true (default), Authorization header is attached when a token exists.
  // Set to false for auth endpoints (login, signup) where attaching a stale
  // token would be wrong.
  withAuth?: boolean;
}

function buildHeaders(opts: RequestOptions, hasBody: boolean): Headers {
  const headers = new Headers(opts.headers ?? {});
  headers.set("Accept", "application/json");
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const withAuth = opts.withAuth ?? true;
  if (withAuth) {
    const token = authTokenProvider?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function parseError(response: Response): Promise<ApiError> {
  let message = `Request failed with status ${response.status}`;
  let code: string | undefined;
  let details: unknown;
  try {
    const body = await response.json();
    if (typeof body === "object" && body !== null) {
      const b = body as { message?: string; code?: string; details?: unknown; error?: string };
      message = b.message ?? b.error ?? message;
      code = b.code;
      details = b.details;
    }
  } catch {
    // Body wasn't JSON. Use the default message.
  }
  return new ApiError(message, response.status, code, details);
}

async function request<T>(method: string, path: string, body: unknown, opts: RequestOptions): Promise<T> {
  const url = path.startsWith("http") ? path : `${config.apiBaseUrl}${path}`;
  const hasBody = body !== undefined && body !== null && method !== "GET";
  const headers = buildHeaders(opts, hasBody);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      signal: opts.signal,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw new ApiError(
      cause instanceof Error ? cause.message : "Network request failed",
      0,
      "NETWORK_ERROR",
      cause,
    );
  }

  if (!response.ok) throw await parseError(response);

  // 204 / empty body shortcut.
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const client = {
  get<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return request<T>("GET", path, undefined, opts);
  },
  post<T>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return request<T>("POST", path, body, opts);
  },
  put<T>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return request<T>("PUT", path, body, opts);
  },
  patch<T>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return request<T>("PATCH", path, body, opts);
  },
  delete<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return request<T>("DELETE", path, undefined, opts);
  },
};
