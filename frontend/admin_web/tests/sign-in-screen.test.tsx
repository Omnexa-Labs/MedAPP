// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { SignIn } from '../src/features/sign-in';
const start = {
  nonce: 'nonce',
  client_id: 'admin-client',
  hosted_domains: ['clinic.example'],
  scope: 'google-scope',
};
let callback: (value: { credential: string }) => void;
beforeEach(() => {
  vi.stubGlobal('google', {
    accounts: {
      id: {
        initialize: vi.fn((options) => {
          callback = options.callback;
        }),
        renderButton: vi.fn(),
        cancel: vi.fn(),
      },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('keeps Google disabled until configured and can recheck availability', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ enabled: false }))
    .mockResolvedValueOnce(Response.json({ enabled: true }));
  vi.stubGlobal('fetch', fetch);
  render(<SignIn onSuccess={vi.fn()} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Check sign-in availability' }),
  );
  expect(
    await screen.findByRole('button', {
      name: 'Continue with Google Workspace',
    }),
  ).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('requires Google then enrolled MFA before publishing an authenticated identity', async () => {
  const success = vi.fn();
  const identity = {
    user: { id: 'admin', role: 'admin' },
    scope: 'session-scope',
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json(start))
    .mockResolvedValueOnce(
      Response.json({ mfa_required: true, scope: 'mfa-scope' }),
    )
    .mockResolvedValueOnce(Response.json(identity));
  vi.stubGlobal('fetch', fetch);
  render(<SignIn onSuccess={success} />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Continue with Google Workspace',
    }),
  );
  await waitFor(() =>
    expect(window.google?.accounts.id.initialize).toHaveBeenCalled(),
  );
  await act(async () => callback({ credential: 'google-proof' }));
  const code = await screen.findByRole('textbox', {
    name: 'Authenticator or recovery code',
  });
  expect(success).not.toHaveBeenCalled();
  fireEvent.change(code, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));
  await waitFor(() => expect(success).toHaveBeenCalledWith(identity));
  expect(fetch.mock.calls[2][1].headers['X-Signin-Scope']).toBe('google-scope');
  expect(fetch.mock.calls[3][1].headers['X-Signin-Scope']).toBe('mfa-scope');
});
it('ignores a Google callback from a replaced sign-in attempt', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json(start))
    .mockResolvedValueOnce(
      Response.json({ ...start, scope: 'new-scope', nonce: 'new-nonce' }),
    );
  vi.stubGlobal('fetch', fetch);
  const success = vi.fn();
  render(<SignIn onSuccess={success} />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Continue with Google Workspace',
    }),
  );
  await waitFor(() =>
    expect(window.google?.accounts.id.initialize).toHaveBeenCalledTimes(1),
  );
  const old = callback;
  fireEvent.click(screen.getByRole('button', { name: 'Start sign-in again' }));
  await waitFor(() =>
    expect(window.google?.accounts.id.initialize).toHaveBeenCalledTimes(2),
  );
  await act(async () => old({ credential: 'stale-credential' }));
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(success).not.toHaveBeenCalled();
});
