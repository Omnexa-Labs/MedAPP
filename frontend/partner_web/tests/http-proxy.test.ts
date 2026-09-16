import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  boundedBody,
  originCheck,
  privateJson,
  scopeCheck,
  setSession,
} from '../src/server/http';
import { proxyPolicy } from '../src/server/proxy-policy';
const fake = vi.hoisted(() => ({ get: vi.fn(), request: vi.fn() }));
vi.mock('@/server/runtime', () => ({ sessions: fake }));
import { GET, PATCH } from '../src/app/api/onboarding/[...path]/route';
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
function req(path: string, method = 'GET', scope = 'test-scope') {
  return new NextRequest(`http://localhost/api/onboarding/${path}`, {
    method,
    headers: {
      Cookie: `medapp_partner=${'a'.repeat(64)}`,
      'X-Session-Scope': scope,
      Origin: 'http://localhost',
      'Content-Type': 'application/json',
    },
    ...(method === 'PATCH'
      ? { body: JSON.stringify({ legal_name: 'Changed' }) }
      : {}),
  });
}
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('PARTNER_ORIGIN', 'http://localhost');
  vi.clearAllMocks();
  fake.get.mockResolvedValue({ user: { id: owner }, scope: 'test-scope' });
});
describe('request boundaries', () => {
  it('uses HTTP-only, strict cookies without tokens', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const cookie = setSession(
      privateJson({ ok: true }),
      'a'.repeat(64),
    ).headers.get('set-cookie');
    expect(cookie).toContain('__Host-medapp_partner=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=strict');
  });
  it('rejects a foreign origin and a stale account scope', () => {
    expect(() =>
      originCheck(
        new Request('http://localhost', {
          headers: { Origin: 'https://attacker.example' },
        }),
      ),
    ).toThrow();
    expect(() =>
      scopeCheck(req('applications', 'GET', 'previous-account'), 'test-scope'),
    ).toThrow();
  });
  it('bounds chunked data without a Content-Length header', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(3));
        controller.enqueue(new Uint8Array(3));
        controller.close();
      },
    });
    const request = new Request('http://localhost', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(boundedBody(request, 5)).rejects.toMatchObject({
      status: 413,
    });
  });
  it.each([
    `applications/${id}/review`,
    `applications/${id}/activation/retry`,
    'auth/logout',
    'https://outside.example',
    'applications/../users',
    `applications/${id}/documents/anything/content`,
  ])('does not proxy arbitrary or reviewer routes: %s', (path) => {
    expect(proxyPolicy(path.split('/'), 'POST')).toBeNull();
  });
  it('allows credential upload only by POST for an application UUID', () => {
    expect(
      proxyPolicy(['applications', id, 'documents', 'upload'], 'POST'),
    ).toMatchObject({ applicationId: id, upload: true });
    expect(
      proxyPolicy(['applications', id, 'documents', 'upload'], 'DELETE'),
    ).toBeNull();
  });
  it('filters even an admin listing before it reaches the browser', async () => {
    fake.request.mockResolvedValue(
      Response.json({
        items: [
          { application_id: id, submitted_by_user_id: owner },
          { application_id: other, submitted_by_user_id: other },
        ],
      }),
    );
    const response = await GET(req('applications'), {
      params: Promise.resolve({ path: ['applications'] }),
    });
    expect(await response.json()).toEqual({
      items: [{ application_id: id, submitted_by_user_id: owner }],
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('reads activation only after checking application ownership', async () => {
    fake.request
      .mockResolvedValueOnce(Response.json({ submitted_by_user_id: owner }))
      .mockResolvedValueOnce(Response.json({ state: 'pending' }));
    const response = await GET(req(`applications/${id}/activation`), {
      params: Promise.resolve({ path: ['applications', id, 'activation'] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: 'pending' });
    expect(fake.request.mock.calls[1][1]).toBe(
      `/v1/onboarding/applications/${id}/activation`,
    );
  });
  it('does not disclose another applicant’s activation status', async () => {
    fake.request.mockResolvedValue(
      Response.json({ submitted_by_user_id: other }),
    );
    const response = await GET(req(`applications/${id}/activation`), {
      params: Promise.resolve({ path: ['applications', id, 'activation'] }),
    });
    expect(response.status).toBe(403);
    expect(fake.request).toHaveBeenCalledTimes(1);
  });
  it('blocks a mutation of another applicant’s record before forwarding a write', async () => {
    fake.request.mockResolvedValue(
      Response.json({ submitted_by_user_id: other }),
    );
    const response = await PATCH(req(`applications/${id}`, 'PATCH'), {
      params: Promise.resolve({ path: ['applications', id] }),
    });
    expect(response.status).toBe(403);
    expect(fake.request).toHaveBeenCalledTimes(1);
    expect(fake.request.mock.calls[0][2].method).toBeUndefined();
  });
  it('rejects an old tab before reading an application belonging to the new account', async () => {
    const response = await GET(req(`applications/${id}`, 'GET', 'old-scope'), {
      params: Promise.resolve({ path: ['applications', id] }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('session_changed');
    expect(fake.request).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('forwards the saved version for optimistic concurrency', async () => {
    fake.request.mockImplementation(async (_id, _path, init) =>
      Response.json(
        init.method === 'PATCH'
          ? { version: 3 }
          : { submitted_by_user_id: owner },
      ),
    );
    const request = req(`applications/${id}`, 'PATCH');
    request.headers.set('If-Match', '"2"');
    const response = await PATCH(request, {
      params: Promise.resolve({ path: ['applications', id] }),
    });
    expect(response.status).toBe(200);
    expect(fake.request.mock.calls[1][2].headers.get('If-Match')).toBe('"2"');
  });
});
