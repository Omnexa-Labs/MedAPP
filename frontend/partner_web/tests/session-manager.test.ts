import { describe, expect, it, vi } from 'vitest';
import {
  SessionManager,
  parseTokens,
  parseUser,
} from '../src/server/session-manager';
import type {
  SessionRecord,
  SessionStore,
  Tokens,
} from '../src/server/session-types';
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Test',
  last_name: 'Applicant',
  email: 'applicant@example.com',
  role: 'patient',
  phone: null,
  is_active: true,
};
const tokens: Tokens = {
  access_token: 'test-access-before',
  refresh_token: 'test-refresh-before',
  expires_in: 900,
};
const nextTokens: Tokens = {
  access_token: 'test-access-after',
  refresh_token: 'test-refresh-after',
  expires_in: 900,
};
class MemoryStore implements SessionStore {
  values = new Map<string, SessionRecord>();
  locks = new Map<string, string>();
  async get(id: string) {
    return this.values.get(id) || null;
  }
  async create(id: string, value: SessionRecord) {
    this.values.set(id, value);
  }
  async saveIfPresent(id: string, value: SessionRecord) {
    if (!this.values.has(id)) return false;
    this.values.set(id, value);
    return true;
  }
  async remove(id: string) {
    this.values.delete(id);
  }
  async lock(id: string, owner: string) {
    if (this.locks.has(id)) return false;
    this.locks.set(id, owner);
    return true;
  }
  async unlock(id: string, owner: string) {
    if (this.locks.get(id) === owner) this.locks.delete(id);
  }
}
function fixture(refresh?: () => Promise<Response>) {
  let now = 100000;
  const store = new MemoryStore();
  const api = vi.fn(async (path: string, _init?: RequestInit) => {
    if (path === '/v1/me') return Response.json(user);
    if (path === '/v1/auth/logout') return new Response(null, { status: 204 });
    if (path === '/v1/auth/refresh')
      return refresh ? refresh() : Response.json(nextTokens);
    return Response.json({ ok: true });
  });
  return {
    store,
    api,
    manager: new SessionManager(
      store,
      api,
      () => now,
      () => new Promise((resolve) => setTimeout(resolve, 0)),
    ),
    expire: () => {
      now += 900000;
    },
  };
}
describe('server-held sessions', () => {
  it('returns public identity without authentication tokens', async () => {
    const f = fixture();
    const login = await f.manager.begin(tokens);
    expect(login.id).toMatch(/^[a-f0-9]{64}$/);
    const identity = await f.manager.identity(login.id);
    expect(identity.user.id).toBe(user.id);
    expect(identity.scope).toMatch(/^[a-f0-9]{32}$/);
    expect(JSON.stringify(identity)).not.toContain(tokens.access_token);
    expect(JSON.stringify(identity)).not.toContain(tokens.refresh_token);
  });
  it('rotates only once when requests renew concurrently', async () => {
    const f = fixture();
    const { id } = await f.manager.begin(tokens);
    f.expire();
    const sessions = await Promise.all(
      Array.from({ length: 6 }, () => f.manager.get(id)),
    );
    expect(
      sessions.every(
        (session) => session.tokens.access_token === nextTokens.access_token,
      ),
    ).toBe(true);
    expect(
      f.api.mock.calls.filter(([path]) => path === '/v1/auth/refresh'),
    ).toHaveLength(1);
  });
  it('cannot resurrect a session signed out while refresh is in flight', async () => {
    let finish!: (response: Response) => void;
    const f = fixture(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { id } = await f.manager.begin(tokens);
    f.expire();
    const pending = f.manager.get(id);
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await f.manager.logout(id);
    finish(Response.json(nextTokens));
    await rejected;
    expect(await f.store.get(id)).toBeNull();
    expect(
      f.api.mock.calls.some(
        ([path, init]) =>
          path.endsWith('/logout') &&
          String(init?.body).includes(nextTokens.refresh_token),
      ),
    ).toBe(true);
  });
  it('revokes uncertain refresh tokens instead of retrying rotation', async () => {
    const f = fixture(async () => {
      throw new Error('connection closed after commit');
    });
    const { id } = await f.manager.begin(tokens);
    f.expire();
    await expect(f.manager.get(id)).rejects.toMatchObject({ status: 401 });
    await expect(f.manager.get(id)).rejects.toMatchObject({ status: 401 });
    expect(
      f.api.mock.calls.filter(([path]) => path.endsWith('/refresh')),
    ).toHaveLength(1);
    expect(await f.store.get(id)).toBeNull();
  });
  it('rejects inactive accounts and revokes their newly issued refresh token', async () => {
    const f = fixture();
    f.api.mockImplementationOnce(async () =>
      Response.json({ ...user, is_active: false }),
    );
    await expect(f.manager.begin(tokens)).rejects.toMatchObject({
      status: 403,
    });
    expect(f.store.values.size).toBe(0);
    expect(f.api.mock.calls.at(-1)?.[0]).toBe('/v1/auth/logout');
  });
  it('does not accept a user identity changed under an existing session', async () => {
    const f = fixture();
    const { id } = await f.manager.begin(tokens);
    f.api.mockImplementationOnce(async () =>
      Response.json({ ...user, id: '22222222-2222-4222-8222-222222222222' }),
    );
    await expect(f.manager.identity(id)).rejects.toMatchObject({ status: 401 });
    expect(await f.store.get(id)).toBeNull();
  });
  it.each([
    {},
    { ...tokens, expires_in: -1 },
    { ...tokens, access_token: 'tiny' },
    { ...tokens, expires_in: Infinity },
  ])('rejects malformed provider token data: %j', (data) => {
    expect(() => parseTokens(data)).toThrow();
  });
  it('rejects malformed account identifiers', () => {
    expect(() => parseUser({ ...user, id: '../admin' })).toThrow();
  });
});
