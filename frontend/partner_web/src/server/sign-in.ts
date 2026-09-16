import { NextRequest } from 'next/server';
import { apiFetch, sessions } from './runtime';
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
import { sessionStore } from './store';
export async function signIn(request: NextRequest, verifying = false) {
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
        'You are already signed in. Reload to continue.',
        'session_changed',
      );
    const body = await smallJson(request);
    let payload: Record<string, string>;
    if (verifying) {
      if (
        typeof body.challenge_token !== 'string' ||
        body.challenge_token.length < 20 ||
        body.challenge_token.length > 128 ||
        typeof body.code !== 'string' ||
        body.code.trim().length < 6 ||
        body.code.trim().length > 32
      )
        throw new HttpError(400, 'Enter your authenticator or recovery code.');
      payload = {
        challenge_token: body.challenge_token,
        code: body.code.trim(),
      };
    } else {
      if (
        typeof body.email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
        body.email.length > 255 ||
        typeof body.password !== 'string' ||
        body.password.length < 1 ||
        body.password.length > 128
      )
        throw new HttpError(400, 'Enter your email address and password.');
      payload = { email: body.email.trim(), password: body.password };
    }
    const response = await apiFetch(
      verifying ? '/v1/auth/two-factor/verify' : '/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Name': 'MedApp Partner web',
        },
        body: JSON.stringify(payload),
        signal: request.signal,
      },
    );
    if (!response.ok) throw await responseError(response);
    const result = await response.json();
    if (result.mfa_required === true && !verifying) {
      if (
        typeof result.challenge_token !== 'string' ||
        typeof result.expires_in !== 'number'
      )
        throw new HttpError(502, 'Please try signing in again.');
      return privateJson({
        mfa_required: true,
        challenge_token: result.challenge_token,
        expires_in: result.expires_in,
      });
    }
    const { id, session } = await sessions.begin(parseTokens(result));
    if (request.signal.aborted) {
      await sessions.logout(id);
      throw new HttpError(499, 'Sign-in was cancelled.');
    }
    return setSession(
      privateJson({ user: session.user, scope: session.scope }),
      id,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
