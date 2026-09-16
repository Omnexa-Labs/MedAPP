// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
const mock = vi.hoisted(() => ({ request: vi.fn(), signedIn: vi.fn() }));
vi.mock('@/lib/api', () => ({ request: mock.request }));
vi.mock('@/components/auth', () => ({
  useAuth: () => ({ signedIn: mock.signedIn }),
}));
vi.mock('@/components/navigation', () => ({
  AppLink: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
import { SignIn } from '../src/features/sign-in';
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('requires the authenticator step before publishing the signed-in identity', async () => {
  mock.request.mockResolvedValueOnce({
    mfa_required: true,
    challenge_token: 'test-challenge-token-long-enough',
    expires_in: 300,
  });
  render(<SignIn />);
  fireEvent.change(screen.getByLabelText(/Email address/), {
    target: { value: 'qa@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: 'test-password-only' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('heading', { name: 'Verify your sign-in' });
  expect(mock.signedIn).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(/Password/)).toBeNull();
  const identity = { user: { id: 'test-owner' }, scope: 'new-scope' };
  mock.request.mockResolvedValueOnce(identity);
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Authenticator or recovery code' }),
    { target: { value: '123456' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
  await waitFor(() => expect(mock.signedIn).toHaveBeenCalledWith(identity));
  expect(mock.request.mock.calls[1][0]).toBe('/api/session/verify');
  expect(JSON.parse(mock.request.mock.calls[1][1].body)).toEqual({
    challenge_token: 'test-challenge-token-long-enough',
    code: '123456',
  });
});
it('keeps a failed sign-in actionable without publishing an identity', async () => {
  mock.request.mockRejectedValueOnce(new Error('Incorrect email or password.'));
  render(<SignIn />);
  fireEvent.change(screen.getByLabelText(/Email address/), {
    target: { value: 'qa@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: 'incorrect' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('alert');
  expect(mock.signedIn).not.toHaveBeenCalled();
  expect(
    (screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
