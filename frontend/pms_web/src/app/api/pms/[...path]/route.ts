import { NextRequest } from "next/server";
import { sessions } from "@/server/runtime";
import { HttpError, responseError } from "@/server/errors";
import {
  boundedBody,
  errorResponse,
  originCheck,
  sessionId,
} from "@/server/http";
import { proxyPolicy } from "@/server/proxy-policy";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
async function proxy(request: NextRequest, context: Context) {
  try {
    const path = proxyPolicy((await context.params).path, request.method);
    if (!path) throw new HttpError(404, "This pharmacy action is unavailable.");
    const headers = new Headers();
    if (
      (request.method === "POST" &&
        (path === "/v1/drugs" ||
          path === "/v1/batches" ||
          /^\/v1\/batches\/[0-9a-fA-F-]{36}\/adjust$/.test(path))) ||
      (["POST", "PATCH"].includes(request.method) &&
        path.startsWith("/v1/purchase-orders")) ||
      (request.method === "POST" &&
        /^\/v1\/(sales|prescriptions)(\/|$)/.test(path) &&
        !path.endsWith("/quote"))
    ) {
      const key = request.headers.get("idempotency-key") || "";
      if (
        !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
          key,
        )
      )
        throw new HttpError(
          400,
          "An inventory request reference is required. Reload this form.",
        );
      headers.set("Idempotency-Key", key);
    }
    let body: Uint8Array | undefined;
    if (request.method !== "GET") {
      originCheck(request);
      if (["POST", "PATCH"].includes(request.method)) {
        const type =
          request.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase() || "";
        if (path === "/v1/pharmacy-profile/photo") {
          if (!["image/jpeg", "image/png", "image/webp"].includes(type))
            throw new HttpError(415, "Choose a JPEG, PNG or WebP photo.");
          const version = request.headers.get("if-match") || "";
          if (!/^[1-9][0-9]{0,9}$/.test(version))
            throw new HttpError(
              400,
              "Reload the saved profile before uploading.",
            );
          headers.set("If-Match", version);
          body = await boundedBody(request, 8 * 1024 * 1024);
        } else {
          if (type !== "application/json")
            throw new HttpError(415, "Send pharmacy details as JSON.");
          body = await boundedBody(request, 128 * 1024);
        }
        headers.set("Content-Type", type);
      }
    }
    const response = await sessions.request(
      sessionId(request),
      request.headers.get("x-session-scope") || "",
      path + request.nextUrl.search,
      {
        method: request.method,
        headers,
        body: body as BodyInit | undefined,
        signal: request.signal,
      },
    );
    if (!response.ok) throw await responseError(response);
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type":
          response.headers.get("content-type") || "application/json",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
