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
import { uuid } from "@/server/session-manager";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  try {
    originCheck(request);
    const { action } = await context.params;
    if (action !== "inspect" && action !== "accept")
      throw new HttpError(404, "Invitation action unavailable.");
    const payload = await smallJson(request);
    if (
      Object.keys(payload).join(",") !== "code" ||
      typeof payload.code !== "string"
    )
      throw new HttpError(400, "Enter your invitation code.");
    const result = await sessions.staffInvitation(
      sessionId(request),
      request.headers.get("x-session-scope") || "",
      action,
      payload.code,
      request.signal,
    );
    if (!uuid.test(result.hospital_id || ""))
      throw new HttpError(502, "The invitation response could not be checked.");
    if (action === "accept") {
      if (
        !uuid.test(result.staff_id || "") ||
        typeof result.already_joined !== "boolean"
      )
        throw new HttpError(
          502,
          "Hospital membership could not be checked. Refresh your access.",
        );
      return privateJson({
        hospital_id: result.hospital_id,
        staff_id: result.staff_id,
        already_joined: result.already_joined,
      });
    }
    if (
      typeof result.hospital_name !== "string" ||
      typeof result.email !== "string" ||
      typeof result.hms_role !== "string" ||
      !Number.isFinite(Date.parse(result.expires_at)) ||
      typeof result.accepted !== "boolean"
    )
      throw new HttpError(502, "The invitation details could not be checked.");
    return privateJson({
      hospital_id: result.hospital_id,
      hospital_name: result.hospital_name,
      email: result.email,
      hms_role: result.hms_role,
      expires_at: result.expires_at,
      accepted: result.accepted,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
