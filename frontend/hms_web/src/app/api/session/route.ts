import { NextRequest } from "next/server";
import { sessions } from "@/server/runtime";
import { HttpError } from "@/server/errors";
import {
  errorResponse,
  originCheck,
  privateJson,
  sessionId,
} from "@/server/http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    return privateJson(await sessions.identity(sessionId(request)));
  } catch (error) {
    if (error instanceof HttpError && error.status === 401)
      return privateJson({ user: null });
    return errorResponse(error);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    originCheck(request);
    const id = sessionId(request);
    await sessions.logout(id, request.headers.get("x-session-scope") || "");
    // The record is invalidated immediately. Leaving the unusable opaque handle
    // to expire prevents this delayed response from clearing a later sign-in.
    return privateJson({ signed_out: true });
  } catch (error) {
    return errorResponse(error);
  }
}
