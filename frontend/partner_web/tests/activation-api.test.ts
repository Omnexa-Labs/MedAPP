import { afterEach, expect, it, vi } from 'vitest';
import { applicationApi } from '../src/lib/api';
const active = {
  state: 'active',
  attempts: 1,
  reason: null,
  profile_id: '22222222-2222-4222-8222-222222222222',
  activated_at: '2026-09-14T12:00:00Z',
};
afterEach(() => vi.unstubAllGlobals());
it.each([
  null,
  { ...active, state: 'approved' },
  { ...active, attempts: -1 },
  { ...active, profile_id: null },
  { ...active, activated_at: null },
  { ...active, activated_at: 'invalid' },
  { ...active, reason: {} },
])(
  'does not present an invalid activation response as confirmed',
  async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(
      applicationApi('scope').activation('application'),
    ).rejects.toMatchObject({ status: 502 });
  },
);
it('loads activation with the current account scope and cancellation signal', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(active));
  vi.stubGlobal('fetch', fetch);
  const controller = new AbortController();
  expect(
    await applicationApi('current-scope').activation(
      'application',
      controller.signal,
    ),
  ).toEqual(active);
  expect(fetch).toHaveBeenCalledWith(
    '/api/onboarding/applications/application/activation',
    expect.objectContaining({
      headers: { 'X-Session-Scope': 'current-scope' },
      signal: controller.signal,
      cache: 'no-store',
    }),
  );
});
