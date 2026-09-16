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
    if (request.method !== "GET") originCheck(request);
    const path = proxyPolicy((await context.params).path, request.method);
    if (!path)
      throw new HttpError(404, "This hospital action is not available.");
    const id = sessionId(request),
      scope = request.headers.get("x-session-scope") || "";
    let body: Uint8Array | undefined;
    const headers = new Headers();
    if (request.method !== "GET") {
      if (
        request.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase() !== "application/json"
      )
        throw new HttpError(415, "Enter valid form details.");
      headers.set("Content-Type", "application/json");
      body = await boundedBody(request, 65536);
    }
    const query = new URLSearchParams();
    for (const key of [
      "search",
      "status",
      "date",
      "doctor_id",
      "patient_id",
      "department_id",
      "category",
      "from",
      "to",
      "limit",
      "offset",
    ]) {
      const value = request.nextUrl.searchParams.get(key);
      if (value !== null) query.set(key, value);
    }
    const response = await sessions.requestWorkspace(
      id,
      scope,
      `${path}${query.size ? "?" + query : ""}`,
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
        "Content-Type":
          response.headers.get("content-type") || "application/json",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
