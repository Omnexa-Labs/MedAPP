import { randomBytes } from 'node:crypto';
import { HttpError, responseError } from './errors';
import type {
  SessionRecord,
  SessionStore,
  Tokens,
  WebUser,
} from './session-types';

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseTokens(value: unknown): Tokens {
  const v = value as Partial<Tokens> | null;
  if (
    !v ||
    typeof v.access_token !== 'string' ||
    typeof v.refresh_token !== 'string' ||
    v.access_token.length < 10 ||
    v.refresh_token.length < 10 ||
    v.access_token.length > 8192 ||
    v.refresh_token.length > 8192 ||
    typeof v.expires_in !== 'number' ||
    !Number.isFinite(v.expires_in) ||
    v.expires_in < 1 ||
    v.expires_in > 86400
  )
    throw new HttpError(
      502,
      'Sign-in returned an invalid session. Please try again.',
    );
  return {
    access_token: v.access_token,
    refresh_token: v.refresh_token,
    expires_in: v.expires_in,
  };
}
export function parseUser(value: unknown): WebUser {
  const v = value as Record<string, unknown> | null;
  if (
    !v ||
    typeof v.id !== 'string' ||
    !uuid.test(v.id) ||
    typeof v.email !== 'string' ||
    typeof v.first_name !== 'string' ||
    typeof v.last_name !== 'string' ||
    typeof v.role !== 'string'
  )
    throw new HttpError(502, 'Your account details could not be loaded.');
  if (v.is_active !== true)
    throw new HttpError(403, 'This account is inactive.');
  return {
    id: v.id,
    email: v.email,
    first_name: v.first_name,
    last_name: v.last_name,
    role: v.role,
    phone: typeof v.phone === 'string' ? v.phone : null,
  };
}
export class SessionManager {
  constructor(
    private store: SessionStore,
    private api: ApiFetch,
    private now = Date.now,
    private pause = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}

  async begin(
    tokens: Tokens,
    deviceId: string,
  ): Promise<{ id: string; session: SessionRecord }> {
    try {
      if (!/^[a-f0-9]{64}$/.test(deviceId))
        throw new HttpError(400, 'Restart administrator sign-in.');
      const response = await this.api('/v1/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!response.ok) throw await responseError(response);
      const user = parseUser(await response.json());
      await this.authorize(user, tokens.access_token);
      const id = randomBytes(32).toString('hex');
      const session = {
        tokens,
        user,
        scope: randomBytes(16).toString('hex'),
        accessExpiresAt: this.now() + tokens.expires_in * 1000,
        expiresAt: this.now() + 8 * 3600000,
        deviceId,
      };
      await this.store.create(id, session);
      return { id, session };
    } catch (error) {
      await this.revoke(tokens.refresh_token, deviceId).catch(() => {});
      throw error;
    }
  }

  async get(id: string): Promise<SessionRecord> {
    const session = await this.store.get(id);
    if (!session || session.expiresAt <= this.now())
      throw new HttpError(401, 'Your session has expired. Sign in again.');
    return session.accessExpiresAt <= this.now() + 30000
      ? this.refresh(id, session.tokens.access_token)
      : session;
  }

  private async refresh(
    id: string,
    previousToken: string,
  ): Promise<SessionRecord> {
    const owner = randomBytes(16).toString('hex');
    let acquired = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      const current = await this.store.get(id);
      if (!current || current.expiresAt <= this.now())
        throw new HttpError(401, 'Your session has expired. Sign in again.');
      if (current.tokens.access_token !== previousToken) return current;
      if (await this.store.lock(id, owner)) {
        acquired = true;
        break;
      }
      await this.pause(100);
    }
    if (!acquired)
      throw new HttpError(
        503,
        'Your session is being refreshed. Please try again.',
      );
    try {
      const current = await this.store.get(id);
      if (!current)
        throw new HttpError(401, 'You have signed out. Sign in again.');
      if (current.tokens.access_token !== previousToken) return current;
      let response: Response;
      try {
        response = await this.api('/v1/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Id': current.deviceId,
          },
          body: JSON.stringify({ refresh_token: current.tokens.refresh_token }),
        });
      } catch {
        // A timeout may follow successful rotation. Do not reuse an uncertain token.
        await this.store.remove(id);
        await this.revoke(current.tokens.refresh_token, current.deviceId).catch(
          () => {},
        );
        throw new HttpError(
          401,
          'Your session could not be renewed. Sign in again.',
        );
      }
      if (!response.ok) {
        if (response.status >= 400) {
          await this.store.remove(id);
          await this.revoke(
            current.tokens.refresh_token,
            current.deviceId,
          ).catch(() => {});
        }
        throw new HttpError(401, 'Your session has expired. Sign in again.');
      }
      let tokens: Tokens;
      try {
        tokens = parseTokens(await response.json());
      } catch {
        await this.store.remove(id);
        await this.revoke(current.tokens.refresh_token, current.deviceId).catch(
          () => {},
        );
        throw new HttpError(401, 'Please sign in again.');
      }
      const updated = {
        ...current,
        tokens,
        accessExpiresAt: this.now() + tokens.expires_in * 1000,
      };
      try {
        if (!(await this.store.saveIfPresent(id, updated))) {
          await this.revoke(tokens.refresh_token, current.deviceId).catch(
            () => {},
          );
          throw new HttpError(401, 'You have signed out. Sign in again.');
        }
      } catch (error) {
        await this.store.remove(id).catch(() => {});
        await this.revoke(tokens.refresh_token, current.deviceId).catch(
          () => {},
        );
        throw error;
      }
      return updated;
    } finally {
      await this.store.unlock(id, owner);
    }
  }

  async request(
    id: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    let session = await this.get(id);
    const send = () =>
      this.api(path, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init.headers)),
          Authorization: `Bearer ${session.tokens.access_token}`,
          'X-Device-Id': session.deviceId,
        },
      });
    let response = await send();
    if (response.status === 401) {
      session = await this.refresh(id, session.tokens.access_token);
      response = await send();
      if (response.status === 401) {
        await this.store.remove(id);
        throw new HttpError(401, 'Sign in again to continue.');
      }
    }
    return response;
  }

  async identity(id: string) {
    try {
      const response = await this.request(id, '/v1/me');
      if (!response.ok) throw await responseError(response);
      const user = parseUser(await response.json());
      const session = await this.get(id);
      if (user.id !== session.user.id || user.email !== session.user.email) {
        await this.logout(id);
        throw new HttpError(401, 'Sign in again to continue.');
      }
      await this.authorize(user, session.tokens.access_token);
      return { user, scope: session.scope };
    } catch (error) {
      if (error instanceof HttpError && [401, 403].includes(error.status)) {
        await this.logout(id).catch(() => {});
        throw new HttpError(
          401,
          'Administrator access changed. Sign in again.',
        );
      }
      throw error;
    }
  }

  private async authorize(user: WebUser, accessToken: string) {
    if (!['admin', 'platform_admin'].includes(user.role))
      throw new HttpError(403, 'Administrator access is required.');
    const [configuration, connections] = await Promise.all([
      this.api('/v1/auth/admin-sso/config'),
      this.api('/v1/me/providers', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);
    if (!configuration.ok) throw await responseError(configuration);
    if (!connections.ok) throw await responseError(connections);
    const config = await configuration.json();
    const linked = await connections.json();
    if (
      config.enabled !== true ||
      !Array.isArray(config.hosted_domains) ||
      !config.hosted_domains.includes(user.email.toLowerCase().split('@')[1]) ||
      !Array.isArray(linked.items) ||
      !linked.items.some(
        (item: { provider?: string }) => item.provider === 'google',
      )
    )
      throw new HttpError(
        403,
        'Google Workspace administrator access is required.',
      );
  }

  private async revoke(refreshToken: string, deviceId: string) {
    const response = await this.api('/v1/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) throw await responseError(response);
  }
  async logout(id: string) {
    const session = await this.store.get(id);
    // Delete first. A concurrent refresh cannot recreate a signed-out session.
    await this.store.remove(id);
    if (session)
      await this.revoke(session.tokens.refresh_token, session.deviceId);
  }
}
