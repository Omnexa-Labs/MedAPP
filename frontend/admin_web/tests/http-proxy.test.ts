import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyPolicy } from '../src/server/proxy-policy';
const fake = vi.hoisted(() => ({
  get: vi.fn(),
  identity: vi.fn(),
  request: vi.fn(),
}));
vi.mock('@/server/runtime', () => ({ sessions: fake }));
import { GET, POST } from '../src/app/api/onboarding/[...path]/route';
import { HttpError } from '../src/server/errors';
const reviewer = '11111111-1111-4111-8111-111111111111';
const applicant = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
function req(
  method = 'POST',
  scope = 'current',
  version = '"4"',
  origin = 'http://localhost',
) {
  return new NextRequest(
    `http://localhost/api/onboarding/applications/${id}/review`,
    {
      method,
      headers: {
        Cookie: `medapp_admin=${'a'.repeat(64)}`,
        'X-Session-Scope': scope,
        'If-Match': version,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      ...(method === 'POST'
        ? {
            body: JSON.stringify({
              action: 'approve',
              verified_document_ids: [],
            }),
          }
        : {}),
    },
  );
}
const context = {
  params: Promise.resolve({ path: ['applications', id, 'review'] }),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('ADMIN_ORIGIN', 'http://localhost');
  fake.get.mockResolvedValue({ scope: 'current' });
  fake.identity.mockResolvedValue({ user: { id: reviewer } });
  fake.request.mockImplementation(async (_id, path, init) =>
    Response.json(
      init?.method === 'POST'
        ? { version: 5 }
        : { submitted_by_user_id: applicant },
    ),
  );
});
it('checks current administrator identity, prevents self-review and forwards If-Match', async () => {
  const response = await POST(req(), context);
  expect(response.status).toBe(200);
  expect(fake.identity).toHaveBeenCalledTimes(1);
  expect(fake.request).toHaveBeenCalledTimes(2);
  expect(
    new Headers(fake.request.mock.calls[1][2].headers).get('If-Match'),
  ).toBe('"4"');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('does not forward an action from another site', async () => {
  expect(
    (
      await POST(
        req('POST', 'current', '"4"', 'https://elsewhere.example'),
        context,
      )
    ).status,
  ).toBe(403);
  expect(fake.request).not.toHaveBeenCalled();
});
it('rejects an old tab before reading the new account’s data', async () => {
  const result = await POST(req('POST', 'old'), context);
  expect(result.status).toBe(409);
  expect(fake.identity).not.toHaveBeenCalled();
  expect(fake.request).not.toHaveBeenCalled();
  expect(result.headers.get('set-cookie')).toBeNull();
});
it('requires the saved application version before writing', async () => {
  expect((await POST(req('POST', 'current', ''), context)).status).toBe(428);
  expect(fake.request).not.toHaveBeenCalled();
});
it('denies self-review before forwarding a mutation', async () => {
  fake.request.mockResolvedValue(
    Response.json({ submitted_by_user_id: reviewer }),
  );
  expect((await POST(req(), context)).status).toBe(403);
  expect(fake.request).toHaveBeenCalledTimes(1);
});
it('denies a demoted session before onboarding reads', async () => {
  fake.identity.mockRejectedValue(
    new HttpError(401, 'Administrator access changed.'),
  );
  const result = await GET(req('GET'), {
    params: Promise.resolve({ path: ['applications'] }),
  });
  expect(result.status).toBe(401);
  expect(fake.request).not.toHaveBeenCalled();
  expect(result.headers.get('set-cookie')).toBeNull();
});
it.each([
  'auth/login',
  `applications/${id}/submit`,
  `applications/${id}/documents/upload`,
  `applications/${id}/reopen`,
  'applications/../users',
])('does not expose applicant or arbitrary writes: %s', (path) =>
  expect(proxyPolicy(path.split('/'), 'POST')).toBeNull(),
);
it('allows only the privileged activation retry route', () => {
  expect(
    proxyPolicy(['applications', id, 'activation', 'retry'], 'POST'),
  ).toMatchObject({ applicationId: id });
  expect(
    proxyPolicy(['applications', id, 'activation', 'retry'], 'GET'),
  ).toBeNull();
});
