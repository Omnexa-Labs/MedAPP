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
      process.env.PMS_WEB_RETURN_URIS || "medapp://pharmacy-workspaces"
    )
      .split(",")
      .map((v) => v.trim());
    return (
      allowed.includes(base) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (base === "medapp://pharmacy-workspaces" ||
        (url.pathname === "/pharmacy-workspaces" &&
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
  const secret = process.env.PMS_WEB_HANDOFF_SECRET;
  const deployment = process.env.PMS_WEB_DEPLOYMENT_KEY;
  if (
    !secret ||
    secret.length < 32 ||
    !deployment ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(deployment)
  )
    throw new HttpError(
      503,
      "Opening the pharmacy portal from MedApp is not configured yet.",
    );
  const response = await apiFetch(`/v1/auth/pharmacy-handoffs/${stage}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pms-Handoff-Secret": secret,
      "X-Pms-Deployment-Key": deployment,
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
      throw new HttpError(400, "Open a new pharmacy link from MedApp.");
    const details = await upstream("inspect", code);
    if (
      typeof details.user_id !== "string" ||
      !uuid.test(details.user_id) ||
      typeof details.name !== "string" ||
      typeof details.email !== "string" ||
      !uuid.test(details.pharmacy_id) ||
      details.deployment_key !== process.env.PMS_WEB_DEPLOYMENT_KEY
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
      const previousRecord = await sessions.get(previous);
      if (
        previousRecord.platform?.accountId !== details.user_id ||
        previousRecord.pharmacy.id !== details.pharmacy_id
      )
        throw new HttpError(
          409,
          "A different account is signed in here. Sign out and open a new link from MedApp.",
          "handoff_account_mismatch",
        );
      if (redeem && request.headers.get("x-session-scope") !== identity.scope)
        throw new HttpError(
          409,
          "Your pharmacy session changed. Reload before continuing.",
          "session_changed",
        );
      old = { id: previous, scope: identity.scope };
    }
    if (!redeem)
      return privateJson({ name: details.name, email: details.email });
    const deviceId = randomBytes(32).toString("hex");
    const result = await upstream("redeem", code, deviceId);
    let tokens: ReturnType<typeof parseTokens> | undefined;
    try {
      tokens = parseTokens(result?.tokens);
    } catch {
      // Any issued refresh token must be revoked when the response is unusable.
    }
    if (
      !tokens ||
      result.user_id !== details.user_id ||
      result.pharmacy_id !== details.pharmacy_id ||
      result.deployment_key !== details.deployment_key ||
      result.destination !== "/dashboard" ||
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
        "The pharmacy session could not be opened. Start again in MedApp.",
      );
    }
    const { id, identity } = await sessions.begin(tokens, deviceId, {
      accountId: details.user_id,
      pharmacyId: details.pharmacy_id,
      returnUrl: result.return_url,
    });
    createdSession = id;
    if (identity.pharmacy.id !== details.pharmacy_id || request.signal.aborted)
      throw new HttpError(
        409,
        "Sign-in changed. Open a new pharmacy link from MedApp.",
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
    checkScope(session, request.headers.get("x-session-scope") || "");
    if (!validReturn(session.returnUrl))
      throw new HttpError(400, "This session was not opened from MedApp.");
    await sessions.logout(id, session.scope);
    return privateJson({ url: session.returnUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
