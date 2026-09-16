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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ActivationStatus as State, Application } from '../src/lib/types';
const mock = vi.hoisted(() => ({
  activation: vi.fn(),
  scope: 'first-account',
  returnAvailable: false,
}));
vi.mock('@/components/auth', () => ({
  useAccount: () => ({
    scope: mock.scope,
    api: { activation: mock.activation },
  }),
  useAuth: () => ({ identity: { returnAvailable: mock.returnAvailable } }),
}));
vi.mock('@/components/navigation', () => ({
  AppLink: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
import { ActivationStatus } from '../src/features/activation-status';
const application = {
  application_id: '11111111-1111-4111-8111-111111111111',
  version: 4,
} as Application;
const state = (value: State['state']): State => ({
  state: value,
  attempts: 1,
  reason: null,
  profile_id:
    value === 'active' ? '22222222-2222-4222-8222-222222222222' : null,
  activated_at: value === 'active' ? '2026-09-14T12:00:00Z' : null,
});
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <ActivationStatus application={application} />
    </QueryClientProvider>,
  );
  return { ...view, client };
}
beforeEach(() => {
  mock.scope = 'first-account';
  mock.returnAvailable = false;
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
  vi.resetAllMocks();
});
it.each([
  ['not_started', 'Account setup has not started'],
  ['pending', 'Setting up your professional account'],
  ['retry', 'Account setup is taking longer'],
  ['attention_required', 'Account setup needs attention'],
  ['setup_required', 'Workspace setup is pending'],
  ['active', 'Professional account setup completed'],
] as const)(
  'explains %s without treating approval as activation',
  async (value, title) => {
    mock.activation.mockResolvedValue(state(value));
    mount();
    expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Return to MedApp' })).toBeNull();
  },
);
it('recovers from a failed status read and preserves the mobile return link', async () => {
  mock.returnAvailable = true;
  mock.activation
    .mockRejectedValueOnce(new Error('Network unavailable'))
    .mockResolvedValue(state('active'));
  mount();
  expect(
    await screen.findByRole('heading', {
      name: 'Account setup status unavailable',
    }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh setup status' }));
  expect(
    await screen.findByRole('heading', {
      name: 'Professional account setup completed',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Return to MedApp' }).getAttribute('href'),
  ).toBe('/return-to-app');
});
it('polls delayed activation and stops after completion', async () => {
  vi.useFakeTimers();
  mock.activation
    .mockResolvedValueOnce(state('retry'))
    .mockResolvedValue(state('active'));
  mount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(
    screen.getByRole('heading', { name: 'Account setup is taking longer' }),
  ).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10100);
  });
  expect(
    screen.getByRole('heading', {
      name: 'Professional account setup completed',
    }),
  ).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(mock.activation).toHaveBeenCalledTimes(2);
});
it('does not show a late status result from the previous account', async () => {
  let finish!: (value: State) => void;
  mock.activation
    .mockImplementationOnce(
      () =>
        new Promise<State>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(state('attention_required'));
  const view = mount();
  await waitFor(() => expect(mock.activation).toHaveBeenCalledTimes(1));
  const firstSignal = mock.activation.mock.calls[0][1] as AbortSignal;
  mock.scope = 'second-account';
  view.rerender(
    <QueryClientProvider client={view.client}>
      <ActivationStatus application={application} />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole('heading', {
      name: 'Account setup needs attention',
    }),
  ).toBeTruthy();
  expect(firstSignal.aborted).toBe(true);
  await act(async () => {
    finish(state('active'));
  });
  expect(
    screen.queryByRole('heading', {
      name: 'Professional account setup completed',
    }),
  ).toBeNull();
});
