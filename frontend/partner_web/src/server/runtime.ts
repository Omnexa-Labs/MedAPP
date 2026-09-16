import 'server-only';
import { HttpError } from './errors';
import { SessionManager } from './session-manager';
import { sessionStore } from './store';

export async function apiFetch(path: string, init: RequestInit = {}) {
  const configured = process.env.PARTNER_API_URL;
  if (!configured)
    throw new HttpError(
      503,
      'The application service is temporarily unavailable.',
    );
  const base = new URL(configured);
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.pathname !== '/'
  )
    throw new HttpError(
      503,
      'The application service is temporarily unavailable.',
    );
  const timeout = path.startsWith('/v1/onboarding/') ? 75000 : 10000;
  try {
    return await fetch(new URL(path, base), {
      ...init,
      cache: 'no-store',
      redirect: 'error',
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
    });
  } catch {
    throw new HttpError(
      503,
      'The service could not be reached. Reload before trying again.',
    );
  }
}
export const sessions = new SessionManager(sessionStore, apiFetch);
