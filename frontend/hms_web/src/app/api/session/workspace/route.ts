import { NextRequest } from "next/server";
import { sessions } from "@/server/runtime";
import { HttpError } from "@/server/errors";
import {
  errorResponse,
  originCheck,
  privateJson,
  sessionId,
  smallJson,
} from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    originCheck(request);
    const body = await smallJson(request);
    if (Object.keys(body).length !== 1 || typeof body.hospital_id !== "string")
      throw new HttpError(400, "Choose a hospital workspace.");
    return privateJson(
      await sessions.select(
        sessionId(request),
        request.headers.get("x-session-scope") || "",
        body.hospital_id,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
