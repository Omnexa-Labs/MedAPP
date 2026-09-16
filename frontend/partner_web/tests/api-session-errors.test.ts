// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { request } from '../src/lib/api';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(['/api/session/login', '/api/session/verify'])(
  'keeps invalid credentials on the existing sign-in form: %s',
  async (path) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: 'Invalid credentials' }, { status: 401 }),
        ),
    );
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    await expect(request(path, { method: 'POST' })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid credentials',
    });
    expect(dispatch).not.toHaveBeenCalled();
  },
);
it('invalidates authenticated application data when its session expires', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: 'Session expired' }, { status: 401 }),
      ),
  );
  const dispatch = vi.spyOn(window, 'dispatchEvent');
  await expect(request('/api/onboarding/applications')).rejects.toMatchObject({
    status: 401,
  });
  expect(dispatch.mock.calls[0][0].type).toBe('partner:session-changed');
});
it('refreshes the account scope when another tab signed in first', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { detail: 'Account changed', code: 'session_changed' },
          { status: 409 },
        ),
      ),
  );
  const dispatch = vi.spyOn(window, 'dispatchEvent');
  await expect(request('/api/session/login')).rejects.toMatchObject({
    status: 409,
  });
  expect(dispatch.mock.calls[0][0].type).toBe('partner:session-changed');
});
