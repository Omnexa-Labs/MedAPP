import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiFetch, sessions } from "./runtime";
import { HttpError, responseError } from "./errors";
import {
  cookieName,
  errorResponse,
  originCheck,
  privateJson,
  setSession,
  smallJson,
} from "./http";
import { parseTokens } from "./session-manager";
import { sessionStore } from "./store";
import { attempts } from "./signin-store";
export const attemptCookie = () =>
  process.env.NODE_ENV === "production"
    ? "__Host-medapp_hms_signin"
    : "medapp_hms_signin";
function setAttempt(response: NextResponse, id: string, maxAge: number) {
  response.cookies.set(attemptCookie(), id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  });
  return response;
}
export async function signIn(request: NextRequest, verifying = false) {
  let locked: { id: string; owner: string } | undefined;
  let createdSession: string | undefined;
  try {
    originCheck(request);
    const previous = request.cookies.get(cookieName())?.value;
    if (
      previous &&
      /^[a-f0-9]{64}$/.test(previous) &&
      (await sessionStore.get(previous))
    )
      throw new HttpError(
        409,
        "You are already signed in. Reload to continue.",
        "session_changed",
      );
    const body = await smallJson(request);
    const oldAttempt = request.cookies.get(attemptCookie())?.value;
    let deviceId: string;
    let payload: Record<string, string>;
    if (verifying) {
      if (!oldAttempt || !/^[a-f0-9]{64}$/.test(oldAttempt))
        throw new HttpError(401, "Restart sign-in.");
      const owner = randomBytes(16).toString("hex");
      if (!(await attempts.lock(oldAttempt, owner)))
        throw new HttpError(409, "Verification is already in progress.");
      locked = { id: oldAttempt, owner };
      const attempt = await attempts.get(oldAttempt);
      if (!attempt)
        throw new HttpError(401, "Verification expired. Restart sign-in.");
      if (body.scope !== attempt.scope)
        throw new HttpError(
          409,
          "Sign-in changed. Restart sign-in.",
          "session_changed",
        );
      if (
        typeof body.code !== "string" ||
        body.code.trim().length < 6 ||
        body.code.trim().length > 32
      )
        throw new HttpError(400, "Enter your authenticator or recovery code.");
      deviceId = attempt.deviceId;
      payload = { challenge_token: attempt.challenge, code: body.code.trim() };
    } else {
      if (
        typeof body.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
        body.email.length > 255 ||
        typeof body.password !== "string" ||
        !body.password ||
        body.password.length > 128
      )
        throw new HttpError(400, "Enter your email address and password.");
      if (oldAttempt && /^[a-f0-9]{64}$/.test(oldAttempt))
        await attempts.remove(oldAttempt);
      deviceId = randomBytes(32).toString("hex");
      payload = { email: body.email.trim(), password: body.password };
    }
    let response: Response;
    try {
      response = await apiFetch(
        verifying ? "/v1/auth/two-factor/verify" : "/v1/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Device-Id": deviceId,
            "X-Device-Name": "MedApp Hospital web",
          },
          body: JSON.stringify(payload),
        },
      );
    } catch (error) {
      if (locked) await attempts.remove(locked.id);
      throw error;
    }
    if (!response.ok) throw await responseError(response);
    const result = await response.json();
    if (result.mfa_required === true && !verifying) {
      if (
        typeof result.challenge_token !== "string" ||
        result.challenge_token.length < 20 ||
        result.challenge_token.length > 128 ||
        !Number.isFinite(result.expires_in) ||
        result.expires_in < 1 ||
        result.expires_in > 600
      )
        throw new HttpError(502, "Restart sign-in.");
      const id = randomBytes(32).toString("hex"),
        scope = randomBytes(16).toString("hex");
      await attempts.put(id, {
        deviceId,
        challenge: result.challenge_token,
        scope,
        expiresAt: Date.now() + result.expires_in * 1000,
      });
      return setAttempt(
        privateJson({
          mfa_required: true,
          scope,
          expires_in: result.expires_in,
        }),
        id,
        result.expires_in,
      );
    }
    const { id, identity } = await sessions.begin(
      parseTokens(result),
      deviceId,
    );
    createdSession = id;
    if (locked) await attempts.remove(locked.id);
    if (request.signal.aborted) {
      throw new HttpError(499, "Sign-in was cancelled.");
    }
    return setAttempt(setSession(privateJson(identity), id), "", 0);
  } catch (error) {
    if (createdSession) await sessions.logout(createdSession).catch(() => {});
    return errorResponse(error);
  } finally {
    if (locked) await attempts.unlock(locked.id, locked.owner).catch(() => {});
  }
}
