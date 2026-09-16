import { NextRequest } from 'next/server';
import { apiFetch, sessions } from './runtime';
import { sessionStore } from './store';
import { HttpError, responseError } from './errors';
import { parseTokens } from './session-manager';
import {
  clearSession,
  cookieName,
  errorResponse,
  originCheck,
  privateJson,
  scopeCheck,
  sessionId,
  setSession,
  smallJson,
} from './http';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export function validReturn(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 700) return false;
  try {
    const url = new URL(value);
    const base = value.split('?')[0];
    const configured = (
      process.env.PARTNER_RETURN_URIS || 'medapp://onboarding-status'
    )
      .split(',')
      .map((v) => v.trim());
    return (
      configured.includes(base) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (base === 'medapp://onboarding-status' ||
        (url.pathname === '/onboarding-status' &&
          (url.protocol === 'https:' ||
            (url.protocol === 'http:' &&
              ['127.0.0.1', 'localhost', '10.0.2.2', '[::1]'].includes(
                url.hostname,
              ))))) &&
      [...url.searchParams.keys()].join(',') === 'handoff_state' &&
      /^[A-Za-z0-9_-]{32,64}$/.test(url.searchParams.get('handoff_state') || '')
    );
  } catch {
    return false;
  }
}
async function upstream(stage: 'inspect' | 'redeem', code: string) {
  const secret = process.env.PARTNER_HANDOFF_SECRET;
  if (!secret || secret.length < 32)
    throw new HttpError(
      503,
      'Opening onboarding from MedApp is not configured yet.',
    );
  const response = await apiFetch(`/v1/auth/partner-handoffs/${stage}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Partner-Handoff-Secret': secret,
    },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}
export async function handoff(request: NextRequest, redeem = false) {
  try {
    originCheck(request);
    const { code } = await smallJson(request);
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(code))
      throw new HttpError(400, 'Open a new onboarding link from MedApp.');
    const details = await upstream('inspect', code);
    if (
      typeof details.user_id !== 'string' ||
      !new RegExp(`^${uuid}$`, 'i').test(details.user_id) ||
      typeof details.name !== 'string' ||
      typeof details.email !== 'string'
    )
      throw new HttpError(502, 'The MedApp account could not be checked.');
    const previous = request.cookies.get(cookieName())?.value;
    let oldId: string | undefined;
    if (
      previous &&
      /^[a-f0-9]{64}$/.test(previous) &&
      (await sessionStore.get(previous))
    ) {
      const identity = await sessions.identity(previous);
      if (identity.user.id !== details.user_id)
        throw new HttpError(
          409,
          'A different account is signed in here. Sign out, then open a new link from MedApp.',
          'handoff_account_mismatch',
        );
      if (redeem) scopeCheck(request, identity.scope);
      oldId = previous;
    }
    if (!redeem)
      return privateJson({ name: details.name, email: details.email });
    const result = await upstream('redeem', code);
    const destination = result.destination;
    if (
      result.user_id !== details.user_id ||
      !validReturn(result.return_url) ||
      typeof destination !== 'string' ||
      !(
        destination === '/new' ||
        new RegExp(`^/applications/${uuid}/details$`, 'i').test(destination)
      )
    ) {
      // Revoke a token pair from a malformed upstream result without installing it.
      if (typeof result.tokens?.refresh_token === 'string')
        await apiFetch('/v1/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: result.tokens.refresh_token }),
        }).catch(() => {});
      throw new HttpError(
        502,
        'The onboarding session could not be opened. Start again in MedApp.',
      );
    }
    const { id, session } = await sessions.begin(
      parseTokens(result.tokens),
      result.return_url,
    );
    try {
      if (session.user.id !== details.user_id || request.signal.aborted)
        throw new HttpError(
          409,
          'The onboarding session changed. Start again in MedApp.',
        );
      if (oldId) await sessions.logout(oldId);
      return setSession(
        privateJson({
          user: session.user,
          scope: session.scope,
          returnAvailable: true,
          destination,
        }),
        id,
      );
    } catch (error) {
      await sessions.logout(id).catch(() => {});
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
export async function returnToApp(request: NextRequest) {
  try {
    originCheck(request);
    const id = sessionId(request);
    const session = await sessions.get(id);
    scopeCheck(request, session.scope);
    if (!validReturn(session.returnUrl))
      throw new HttpError(400, 'This session was not opened from MedApp.');
    await sessions.logout(id);
    return clearSession(privateJson({ url: session.returnUrl }));
  } catch (error) {
    return errorResponse(error);
  }
}
