// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  signedIn: vi.fn(),
  afterSave: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ request: mock.request }));
vi.mock('@/components/auth', () => ({
  useAuth: () => ({ pending: false, identity: null, signedIn: mock.signedIn }),
}));
vi.mock('@/components/navigation', () => ({
  useNavigation: () => ({ afterSave: mock.afterSave }),
}));
import { Handoff } from '../src/features/handoff';
const code = 'a'.repeat(64);
const result = {
  user: { id: 'qa-user' },
  scope: 'qa-scope',
  destination: '/new',
  returnAvailable: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', `/handoff#code=${code}`);
  mock.request.mockResolvedValueOnce({
    name: 'QA Applicant',
    email: 'qa@example.com',
  });
});
afterEach(cleanup);
it('clears the proof from history and waits for explicit confirmation before exchanging it', async () => {
  mock.request.mockResolvedValueOnce(result);
  render(<Handoff />);
  await screen.findByText('qa@example.com');
  expect(window.location.hash).toBe('');
  expect(mock.request).toHaveBeenCalledTimes(1);
  expect(mock.signedIn).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue with this account' }),
  );
  await waitFor(() => expect(mock.afterSave).toHaveBeenCalledWith('/new'));
  expect(mock.signedIn).toHaveBeenCalledWith(result);
});
it('ignores a late sign-in response after leaving and cancels its request', async () => {
  let finish!: (value: typeof result) => void;
  mock.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<Handoff />);
  await screen.findByText('qa@example.com');
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue with this account' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue with this account' }),
  );
  expect(mock.request).toHaveBeenCalledTimes(2);
  const signal = mock.request.mock.calls[1][1].signal as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  finish(result);
  await Promise.resolve();
  expect(mock.signedIn).not.toHaveBeenCalled();
  expect(mock.afterSave).not.toHaveBeenCalled();
});
