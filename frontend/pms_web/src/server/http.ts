import { NextRequest, NextResponse } from "next/server";
import { HttpError } from "./errors";
export const cookieName = () =>
  process.env.NODE_ENV === "production" ? "__Host-medapp_pms" : "medapp_pms";
export function sessionId(request: NextRequest): string {
  const id = request.cookies.get(cookieName())?.value;
  if (!id || !/^[a-f0-9]{64}$/.test(id))
    throw new HttpError(401, "Sign in to continue.");
  return id;
}
export function originCheck(request: Request) {
  const expected = process.env.PMS_WEB_ORIGIN;
  if (!expected)
    throw new HttpError(
      503,
      "The pharmacy service is temporarily unavailable.",
    );
  if (
    request.headers.get("origin") !== new URL(expected).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(
      403,
      "This request must come from the pharmacy portal.",
    );
}
export function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function setSession(response: NextResponse, id: string) {
  response.cookies.set(cookieName(), id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 3600,
  });
  return response;
}
export function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : 503;
  const response = privateJson(
    {
      detail:
        error instanceof HttpError
          ? error.message
          : "The service is temporarily unavailable. Please try again.",
      code: error instanceof HttpError ? error.code : undefined,
    },
    status,
  );
  // A response for an earlier session must not clear a newer sign-in cookie.
  // Authentication depends on the Redis record, not on cookie presence alone.
  return response;
}
export async function boundedBody(
  request: Request,
  maximum: number,
): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > maximum))
    throw new HttpError(413, "The request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new HttpError(413, "The request is too large.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
export async function smallJson(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const result = JSON.parse(
      new TextDecoder().decode(await boundedBody(request, 16384)),
    );
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Enter valid form details.");
  }
}
