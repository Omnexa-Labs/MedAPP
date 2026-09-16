import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SigninAttempt } from '../src/server/signin-store';
const mock = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  begin: vi.fn(),
  logout: vi.fn(),
  getSession: vi.fn(),
  attempts: new Map<string, SigninAttempt>(),
  locks: new Set<string>(),
}));
vi.mock('@/server/runtime', () => ({
  apiFetch: mock.apiFetch,
  sessions: { begin: mock.begin, logout: mock.logout },
}));
vi.mock('@/server/store', () => ({ sessionStore: { get: mock.getSession } }));
vi.mock('@/server/signin-store', () => ({
  attempts: {
    get: async (id: string) => mock.attempts.get(id) || null,
    put: async (id: string, value: SigninAttempt) => {
      mock.attempts.set(id, value);
    },
    remove: async (id: string) => {
      mock.attempts.delete(id);
    },
    lock: async (id: string) => {
      if (mock.locks.has(id)) return false;
      mock.locks.add(id);
      return true;
    },
    unlock: async (id: string) => {
      mock.locks.delete(id);
    },
  },
}));
import { signIn } from '../src/server/sign-in';
const cookie = `medapp_admin_signin=${'c'.repeat(64)}`;
const pending = {
  stage: 'google',
  deviceId: 'd'.repeat(64),
  scope: 's'.repeat(64),
  challenge: 'backend-proof'.repeat(3),
  expiresAt: Date.now() + 300000,
} satisfies SigninAttempt;
const tokens = {
  access_token: 'server-access-token',
  refresh_token: 'server-refresh-token',
  expires_in: 900,
};
function req(
  action: string,
  body: object = {},
  scope = pending.scope,
  origin = 'http://localhost',
) {
  return new NextRequest(`http://localhost/api/sso/${action}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: cookie,
      'Content-Type': 'application/json',
      'X-Signin-Scope': scope,
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.attempts.clear();
  mock.locks.clear();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('ADMIN_ORIGIN', 'http://localhost');
  mock.getSession.mockResolvedValue(null);
  mock.attempts.set('c'.repeat(64), { ...pending });
  mock.begin.mockResolvedValue({
    id: 'a'.repeat(64),
    session: { user: { id: 'reviewer', role: 'admin' }, scope: 'public-scope' },
  });
});
it('sends the saved backend proof and device binding, returning only an opaque cookie and identity', async () => {
  mock.apiFetch.mockResolvedValue(Response.json(tokens));
  const result = await signIn(
    req('complete', { credential: 'google-credential' }),
    'complete',
  );
  expect(result.status).toBe(200);
  expect(JSON.stringify(await result.json())).not.toMatch(
    /server-access|server-refresh|backend-proof/,
  );
  expect(mock.apiFetch.mock.calls[0][1].headers['X-Device-Id']).toBe(
    pending.deviceId,
  );
  expect(JSON.parse(mock.apiFetch.mock.calls[0][1].body)).toEqual({
    challenge_token: pending.challenge,
    identity_token: 'google-credential',
  });
  expect(mock.begin).toHaveBeenCalledWith(tokens, pending.deviceId);
  expect(result.headers.get('set-cookie')).toContain('HttpOnly');
});
it('keeps the second-factor challenge server-side and only installs a session after verification', async () => {
  mock.apiFetch
    .mockResolvedValueOnce(
      Response.json({
        mfa_required: true,
        challenge_token: 'second-factor-challenge'.repeat(2),
        expires_in: 300,
      }),
    )
    .mockResolvedValueOnce(Response.json(tokens));
  const first = await signIn(
    req('complete', { credential: 'google' }),
    'complete',
  );
  const challenge = await first.json();
  expect(challenge.mfa_required).toBe(true);
  expect(challenge.challenge_token).toBeUndefined();
  expect(mock.begin).not.toHaveBeenCalled();
  const second = await signIn(
    req('verify', { code: '123456' }, challenge.scope),
    'verify',
  );
  expect(second.status).toBe(200);
  expect(mock.begin).toHaveBeenCalledTimes(1);
});
it('keeps invalid MFA on the same durable challenge', async () => {
  mock.attempts.set('c'.repeat(64), { ...pending, stage: 'mfa' });
  mock.apiFetch.mockResolvedValue(
    Response.json({ detail: 'Wrong code' }, { status: 400 }),
  );
  expect(
    (await signIn(req('verify', { code: '000000' }), 'verify')).status,
  ).toBe(400);
  expect(mock.attempts.get('c'.repeat(64))?.challenge).toBe(pending.challenge);
  expect(mock.begin).not.toHaveBeenCalled();
});
it('rejects stale browser callbacks and foreign origins without exchanging tokens', async () => {
  expect(
    (
      await signIn(
        req('complete', { credential: 'google' }, 'old-scope'),
        'complete',
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await signIn(
        req(
          'complete',
          { credential: 'google' },
          pending.scope,
          'https://elsewhere.example',
        ),
        'complete',
      )
    ).status,
  ).toBe(403);
  expect(mock.apiFetch).not.toHaveBeenCalled();
});
it('does not reuse an uncertain provider proof after a connection loss', async () => {
  mock.apiFetch.mockRejectedValue(new Error('response lost after exchange'));
  expect(
    (await signIn(req('complete', { credential: 'google' }), 'complete'))
      .status,
  ).toBe(503);
  expect(mock.attempts.size).toBe(0);
  expect(mock.begin).not.toHaveBeenCalled();
});
it('does not restart an in-flight exchange from another tab', async () => {
  mock.locks.add('c'.repeat(64));
  expect((await signIn(req('begin'), 'begin')).status).toBe(409);
  expect(mock.apiFetch).not.toHaveBeenCalled();
});
