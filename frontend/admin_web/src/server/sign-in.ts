import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { apiFetch, sessions } from './runtime';
import { sessionStore } from './store';
import { attempts } from './signin-store';
import { HttpError, responseError } from './errors';
import {
  cookieName,
  errorResponse,
  originCheck,
  privateJson,
  setSession,
  smallJson,
} from './http';
import { parseTokens } from './session-manager';
const token = () => randomBytes(32).toString('hex');
const validId = (id: string | undefined): id is string =>
  !!id && /^[a-f0-9]{64}$/.test(id);
export const signinCookie = () =>
  process.env.NODE_ENV === 'production'
    ? '__Host-medapp_admin_signin'
    : 'medapp_admin_signin';
function setAttempt(response: NextResponse, id: string, maxAge = 300) {
  response.cookies.set(signinCookie(), id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
  return response;
}
function challenge(value: Record<string, unknown>) {
  if (
    typeof value.challenge_token !== 'string' ||
    value.challenge_token.length < 32 ||
    value.challenge_token.length > 128 ||
    typeof value.expires_in !== 'number' ||
    !Number.isSafeInteger(value.expires_in) ||
    value.expires_in < 1 ||
    value.expires_in > 300
  )
    throw new HttpError(502, 'Restart administrator sign-in.');
  return {
    challenge: value.challenge_token,
    expiresAt: Date.now() + value.expires_in * 1000,
  };
}
export async function signIn(request: NextRequest, action: string) {
  try {
    originCheck(request);
    if (!['begin', 'complete', 'verify'].includes(action))
      throw new HttpError(404, 'Sign-in action unavailable.');
    const existing = request.cookies.get(cookieName())?.value;
    if (validId(existing) && (await sessionStore.get(existing)))
      throw new HttpError(
        409,
        'You are already signed in. Reload to continue.',
        'session_changed',
      );
    if (action === 'begin') {
      const previous = request.cookies.get(signinCookie())?.value;
      const id = validId(previous) ? previous : token();
      const lock = token();
      if (!(await attempts.lock(id, lock)))
        throw new HttpError(409, 'Sign-in is already being checked.');
      try {
        const deviceId = token();
        const response = await apiFetch('/v1/auth/admin-sso/begin', {
          method: 'POST',
          headers: { 'X-Device-Id': deviceId },
        });
        if (!response.ok) throw await responseError(response);
        const value = await response.json();
        const saved = challenge(value);
        if (
          typeof value.nonce !== 'string' ||
          !/^[a-f0-9]{64}$/.test(value.nonce) ||
          typeof value.client_id !== 'string' ||
          !Array.isArray(value.hosted_domains) ||
          !value.hosted_domains.every((d: unknown) => typeof d === 'string')
        )
          throw new HttpError(502, 'Restart administrator sign-in.');
        const scope = token();
        await attempts.put(id, { ...saved, stage: 'google', deviceId, scope });
        return setAttempt(
          privateJson({
            nonce: value.nonce,
            client_id: value.client_id,
            hosted_domains: value.hosted_domains,
            scope,
          }),
          id,
        );
      } finally {
        await attempts.unlock(id, lock);
      }
    }
    const id = request.cookies.get(signinCookie())?.value;
    if (!validId(id)) throw new HttpError(401, 'Sign-in expired. Start again.');
    const owner = token();
    if (!(await attempts.lock(id, owner)))
      throw new HttpError(409, 'Sign-in is already being checked.');
    try {
      const attempt = await attempts.get(id);
      if (
        !attempt ||
        attempt.stage !== (action === 'complete' ? 'google' : 'mfa')
      )
        throw new HttpError(401, 'Sign-in expired. Start again.');
      if (request.headers.get('x-signin-scope') !== attempt.scope)
        throw new HttpError(
          409,
          'Sign-in changed in another tab. Start again.',
        );
      const body = await smallJson(request);
      const credential = action === 'complete' ? body.credential : body.code;
      if (
        typeof credential !== 'string' ||
        credential.length < 1 ||
        credential.length > (action === 'complete' ? 16384 : 32)
      )
        throw new HttpError(400, 'Enter valid sign-in details.');
      let response: Response;
      try {
        response = await apiFetch(`/v1/auth/admin-sso/${action}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Id': attempt.deviceId,
            'X-Device-Name': 'MedApp Admin web',
          },
          body: JSON.stringify({
            challenge_token: attempt.challenge,
            [action === 'complete' ? 'identity_token' : 'code']: credential,
          }),
        });
      } catch (error) {
        await attempts.remove(id);
        throw error;
      }
      if (!response.ok) {
        // Wrong MFA codes can use the same server challenge and durable budget.
        if (!(action === 'verify' && [400, 422, 429].includes(response.status)))
          await attempts.remove(id);
        throw await responseError(response);
      }
      const result = await response.json();
      if (result.mfa_required === true && action === 'complete') {
        const saved = challenge(result);
        const scope = token();
        if (!(await attempts.get(id)))
          throw new HttpError(409, 'Sign-in changed. Start again.');
        await attempts.put(id, { ...attempt, ...saved, stage: 'mfa', scope });
        return privateJson({ mfa_required: true, scope });
      }
      const tokens = parseTokens(result);
      await attempts.remove(id);
      const login = await sessions.begin(tokens, attempt.deviceId);
      if (request.signal.aborted) {
        await sessions.logout(login.id);
        throw new HttpError(499, 'Sign-in cancelled.');
      }
      return setAttempt(
        setSession(
          privateJson({ user: login.session.user, scope: login.session.scope }),
          login.id,
        ),
        '',
        0,
      );
    } finally {
      await attempts.unlock(id, owner);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
