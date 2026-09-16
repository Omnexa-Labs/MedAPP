import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const fake = vi.hoisted(() => ({ get: vi.fn(), identity: vi.fn(), request: vi.fn() }));
vi.mock('@/server/runtime', () => ({ sessions: fake }));
import { GET, PUT } from '../src/app/api/pharmacy-workspaces/[...path]/route';
import { parseChoices, parseDeployment } from '../src/lib/pharmacy-deployment';
const id = '33333333-3333-4333-8333-333333333333';
const pharmacy = '44444444-4444-4444-8444-444444444444';
const actor = '11111111-1111-4111-8111-111111111111';
const applicant = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ path: ['applications', id] }) };
const saved = { pharmacy_id: pharmacy, deployment_key: 'accra', version: 1, activated_at: null };
function request(method='PUT', extra: Record<string, string> = {}, body: unknown = { deployment_key: 'accra' }) {
  return new NextRequest('http://localhost/api/pharmacy-workspaces/applications/'+id, { method,
    headers: { Cookie: `medapp_admin=${'a'.repeat(64)}`, Origin: 'http://localhost', 'X-Session-Scope': 'current', 'If-Match': '0', 'Content-Type': 'application/json', ...extra },
    ...(method === 'PUT' ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('ADMIN_ORIGIN', 'http://localhost');
  fake.get.mockResolvedValue({ scope: 'current' }); fake.identity.mockResolvedValue({ user: { id: actor } });
  fake.request.mockImplementation(async (_id, path) => Response.json(path.endsWith('/activation') ? { profile_id: pharmacy } :
    path.startsWith('/v1/onboarding') ? { application_id: id, partner_type: 'pharmacy', status: 'approved', submitted_by_user_id: applicant } : saved));
});
it('derives the pharmacy from live approval and forwards a versioned assignment without extra fields', async () => {
  const response = await PUT(request(), context);
  expect(response.status).toBe(200); expect(await response.json()).toEqual(saved);
  const call = fake.request.mock.calls[2];
  expect(call[1]).toBe(`/v1/pharmacy-workspaces/${pharmacy}/deployment`);
  expect(new Headers(call[2].headers).get('If-Match')).toBe('0');
  expect(JSON.parse(call[2].body)).toEqual({ deployment_key: 'accra' });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it.each<Record<string, string>>([{ Origin: 'https://foreign.example' }, { 'X-Session-Scope': 'old' }])('rejects foreign origins or stale tabs before upstream reads', async (headers) => {
  expect((await PUT(request('PUT', headers), context)).status).toBe(headers.Origin ? 403 : 409);
  expect(fake.request).not.toHaveBeenCalled();
});
it('rejects self-assignment before loading the pharmacy', async () => {
  fake.identity.mockResolvedValue({ user: { id: applicant } });
  expect((await PUT(request(), context)).status).toBe(403);
  expect(fake.request).toHaveBeenCalledTimes(1);
});
it.each(['submitted', 'rejected'])('rejects applications that are %s', async (status) => {
  fake.request.mockResolvedValue(Response.json({ application_id: id, status, partner_type: 'pharmacy' }));
  expect((await PUT(request(), context)).status).toBe(409);
  expect(fake.request).toHaveBeenCalledTimes(1);
});
it('rejects applications without an activated directory identity', async () => {
  fake.request.mockResolvedValueOnce(Response.json({ application_id: id, status: 'approved', partner_type: 'pharmacy' })).mockResolvedValueOnce(Response.json({ profile_id: null }));
  expect((await PUT(request(), context)).status).toBe(409);
  expect(fake.request).toHaveBeenCalledTimes(2);
});
it.each([{ deployment_key: 'accra', pharmacy_id: pharmacy }, { deployment_key: 'accra', api_url: 'http://attacker' }, { deployment_key: '../other' }])('rejects supplied routing/identity details', async (body) => {
  expect((await PUT(request('PUT', {}, body), context)).status).toBe(400);
  expect(fake.request).toHaveBeenCalledTimes(2);
});
it('preserves assignment conflicts without retrying the write', async () => {
  fake.request.mockImplementation(async (_id, path) => Response.json(path.endsWith('/activation') ? { profile_id: pharmacy } :
    path.startsWith('/v1/onboarding') ? { application_id: id, partner_type: 'pharmacy', status: 'approved' } : { detail: 'Assignment changed.' }, { status: path.startsWith('/v1/pharmacy-workspaces') ? 412 : 200 }));
  expect((await PUT(request(), context)).status).toBe(412);
  expect(fake.request).toHaveBeenCalledTimes(3);
});
it('projects configured choices without exposing server origins or credentials', async () => {
  fake.request.mockResolvedValue(Response.json([{ deployment_key: 'accra', label: 'Accra PMS', assigned: false, api_url: 'http://private', secret: 'hidden' }]));
  const response = await GET(request('GET'), { params: Promise.resolve({ path: ['deployments'] }) });
  expect(await response.json()).toEqual([{ deployment_key: 'accra', label: 'Accra PMS', assigned: false }]);
});
it.each([{ path: ['other'] }, { path: ['applications', id, 'delete'] }, { path: ['applications', '..'] }, { path: ['internal', 'pharmacy-activations'] }])('denies unknown routes', async ({ path }) => {
  expect((await PUT(request(), { params: Promise.resolve({ path }) })).status).toBe(404);
  expect(fake.request).not.toHaveBeenCalled();
});
it('rejects mismatched identities and inconsistent deployment responses', () => {
  expect(() => parseDeployment(saved, id)).toThrow();
  expect(() => parseDeployment({ ...saved, deployment_key: null })).toThrow();
  expect(() => parseChoices([{ deployment_key: 'accra', label: 'Accra', assigned: false }, { deployment_key: 'accra', label: 'Duplicate', assigned: false }])).toThrow();
});
