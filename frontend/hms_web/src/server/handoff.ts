import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { apiFetch, sessions } from "./runtime";
import { sessionStore } from "./store";
import { HttpError, responseError } from "./errors";
import { checkScope, parseTokens, uuid } from "./session-manager";
import {
  cookieName,
  errorResponse,
  originCheck,
  privateJson,
  sessionId,
  setSession,
  smallJson,
} from "./http";

export function validReturn(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 700) return false;
  try {
    const url = new URL(value),
      base = value.split("?")[0];
    const allowed = (
      process.env.HMS_WEB_RETURN_URIS || "medapp://hospital-workspaces"
    )
      .split(",")
      .map((v) => v.trim());
    return (
      allowed.includes(base) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (base === "medapp://hospital-workspaces" ||
        (url.pathname === "/hospital-workspaces" &&
          (url.protocol === "https:" ||
            (url.protocol === "http:" &&
              ["127.0.0.1", "localhost", "10.0.2.2", "[::1]"].includes(
                url.hostname,
              ))))) &&
      [...url.searchParams.keys()].join(",") === "handoff_state" &&
      /^[A-Za-z0-9_-]{32,64}$/.test(url.searchParams.get("handoff_state") || "")
    );
  } catch {
    return false;
  }
}
async function upstream(
  stage: "inspect" | "redeem",
  code: string,
  deviceId?: string,
) {
  const secret = process.env.HMS_WEB_HANDOFF_SECRET;
  if (!secret || secret.length < 32)
    throw new HttpError(
      503,
      "Opening the hospital portal from MedApp is not configured yet.",
    );
  const response = await apiFetch(`/v1/auth/hospital-handoffs/${stage}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hms-Handoff-Secret": secret,
      ...(deviceId ? { "X-Device-Id": deviceId } : {}),
    },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}
export async function handoff(request: NextRequest, redeem = false) {
  let createdSession: string | undefined;
  try {
    originCheck(request);
    const { code } = await smallJson(request);
    if (typeof code !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(code))
      throw new HttpError(400, "Open a new hospital link from MedApp.");
    const details = await upstream("inspect", code);
    if (
      typeof details.user_id !== "string" ||
      !uuid.test(details.user_id) ||
      typeof details.name !== "string" ||
      typeof details.email !== "string"
    )
      throw new HttpError(502, "The MedApp account could not be checked.");
    const previous = request.cookies.get(cookieName())?.value;
    let old: { id: string; scope: string } | undefined;
    if (
      previous &&
      /^[a-f0-9]{64}$/.test(previous) &&
      (await sessionStore.get(previous))
    ) {
      const identity = await sessions.identity(previous);
      if (identity.user.id !== details.user_id)
        throw new HttpError(
          409,
          "A different account is signed in here. Sign out and open a new link from MedApp.",
          "handoff_account_mismatch",
        );
      if (redeem && request.headers.get("x-session-scope") !== identity.scope)
        throw new HttpError(
          409,
          "Your hospital session changed. Reload before continuing.",
          "session_changed",
        );
      old = { id: previous, scope: identity.scope };
    }
    if (!redeem)
      return privateJson({ name: details.name, email: details.email });
    const deviceId = randomBytes(32).toString("hex");
    const result = await upstream("redeem", code, deviceId);
    if (
      result.user_id !== details.user_id ||
      result.destination !== "/workspaces" ||
      !validReturn(result.return_url)
    ) {
      if (typeof result.tokens?.refresh_token === "string")
        await apiFetch("/v1/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Device-Id": deviceId,
          },
          body: JSON.stringify({ refresh_token: result.tokens.refresh_token }),
        }).catch(() => {});
      throw new HttpError(
        502,
        "The hospital session could not be opened. Start again in MedApp.",
      );
    }
    const { id, identity } = await sessions.begin(
      parseTokens(result.tokens),
      deviceId,
      result.return_url,
    );
    createdSession = id;
    if (identity.user.id !== details.user_id || request.signal.aborted)
      throw new HttpError(
        409,
        "Sign-in changed. Open a new hospital link from MedApp.",
      );
    if (old) await sessions.logout(old.id, old.scope);
    return setSession(privateJson(identity), id);
  } catch (error) {
    if (createdSession) await sessions.logout(createdSession).catch(() => {});
    return errorResponse(error);
  }
}
export async function returnToApp(request: NextRequest) {
  try {
    originCheck(request);
    const id = sessionId(request),
      session = await sessions.get(id);
    checkScope(session, request.headers.get("x-session-scope"));
    if (!validReturn(session.returnUrl))
      throw new HttpError(400, "This session was not opened from MedApp.");
    await sessions.logout(id, session.scope);
    return privateJson({ url: session.returnUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
