import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  get: vi.fn(),
  identity: vi.fn(),
  begin: vi.fn(),
  logout: vi.fn(),
  stored: vi.fn(),
}));
vi.mock('@/server/runtime', () => ({ apiFetch: mocks.api, sessions: mocks }));
vi.mock('@/server/store', () => ({ sessionStore: { get: mocks.stored } }));
import { handoff, returnToApp, validReturn } from '../src/server/handoff';
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const code = 'c'.repeat(64);
const returnUrl = `medapp://onboarding-status?handoff_state=${'s'.repeat(32)}`;
const tokens = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 900,
};
function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/session/handoff', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ code }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('PARTNER_ORIGIN', 'http://localhost');
  vi.stubEnv(
    'PARTNER_HANDOFF_SECRET',
    'local-partner-handoff-secret-2026-test',
  );
  vi.stubEnv('PARTNER_RETURN_URIS', 'medapp://onboarding-status');
  mocks.stored.mockResolvedValue(null);
  mocks.api.mockImplementation(async (path: string) =>
    Response.json(
      path.endsWith('inspect')
        ? { user_id: owner, name: 'Ama Mensah', email: 'ama@example.com' }
        : {
            user_id: owner,
            tokens,
            destination: '/new',
            return_url: returnUrl,
          },
    ),
  );
  mocks.begin.mockResolvedValue({
    id: 'a'.repeat(64),
    session: { user: { id: owner }, scope: 'new-scope' },
  });
  mocks.identity.mockResolvedValue({ user: { id: owner }, scope: 'old-scope' });
  mocks.get.mockResolvedValue({ returnUrl, scope: 'old-scope' });
});
it('previews the verified account without creating a session', async () => {
  const response = await handoff(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    name: 'Ama Mensah',
    email: 'ama@example.com',
  });
  expect(mocks.begin).not.toHaveBeenCalled();
  expect(mocks.api).toHaveBeenCalledTimes(1);
});
it('exchanges through the server and returns only an opaque cookie and identity', async () => {
  const response = await handoff(request(), true);
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain('test-access-token');
  expect(text).not.toContain('test-refresh-token');
  expect(text).not.toContain('handoff_state');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(mocks.begin).toHaveBeenCalledWith(tokens, returnUrl);
});
it('rejects a foreign origin before checking the proof', async () => {
  expect(
    (await handoff(request({ Origin: 'https://evil.example' }), true)).status,
  ).toBe(403);
  expect(mocks.api).not.toHaveBeenCalled();
});
it('does not overwrite a different signed-in account or consume its incoming proof', async () => {
  mocks.stored.mockResolvedValue({});
  mocks.identity.mockResolvedValue({ user: { id: other }, scope: 'old-scope' });
  const response = await handoff(
    request({ Cookie: `medapp_partner=${'b'.repeat(64)}` }),
    true,
  );
  expect(response.status).toBe(409);
  expect(mocks.api).toHaveBeenCalledTimes(1);
  expect(mocks.begin).not.toHaveBeenCalled();
  expect(mocks.logout).not.toHaveBeenCalled();
});
it('requires the current browser scope when replacing a same-account session', async () => {
  mocks.stored.mockResolvedValue({});
  const response = await handoff(
    request({
      Cookie: `medapp_partner=${'b'.repeat(64)}`,
      'X-Session-Scope': 'stale',
    }),
    true,
  );
  expect(response.status).toBe(409);
  expect(mocks.api).toHaveBeenCalledTimes(1);
});
it('expires an invalid proof without clearing an unrelated browser cookie', async () => {
  mocks.api.mockResolvedValue(
    Response.json({ detail: 'Link expired' }, { status: 410 }),
  );
  const response = await handoff(request(), true);
  expect(response.status).toBe(410);
  expect(response.headers.get('set-cookie')).toBeNull();
});
it('revokes malformed upstream credentials instead of installing an arbitrary return URL', async () => {
  mocks.api.mockImplementation(async (path: string) =>
    Response.json(
      path.endsWith('inspect')
        ? { user_id: owner, name: 'Ama', email: 'ama@example.com' }
        : {
            user_id: owner,
            tokens,
            destination: '/new',
            return_url: 'https://evil.example/onboarding-status',
          },
    ),
  );
  expect((await handoff(request(), true)).status).toBe(502);
  expect(mocks.begin).not.toHaveBeenCalled();
  expect(mocks.api).toHaveBeenLastCalledWith(
    '/v1/auth/logout',
    expect.objectContaining({ method: 'POST' }),
  );
});
it('closes the website session before returning a validated app URL', async () => {
  const response = await returnToApp(
    request({
      Cookie: `medapp_partner=${'b'.repeat(64)}`,
      'X-Session-Scope': 'old-scope',
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.logout).toHaveBeenCalledWith('b'.repeat(64));
  expect(await response.json()).toEqual({ url: returnUrl });
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});
it('does not return to a privileged route or silently close another scope', async () => {
  expect(
    validReturn(`medapp://practitioner-home?handoff_state=${'s'.repeat(32)}`),
  ).toBe(false);
  expect(validReturn(returnUrl + '&role=doctor')).toBe(false);
  expect(
    (
      await returnToApp(
        request({
          Cookie: `medapp_partner=${'b'.repeat(64)}`,
          'X-Session-Scope': 'stale',
        }),
      )
    ).status,
  ).toBe(409);
  expect(mocks.logout).not.toHaveBeenCalled();
});
