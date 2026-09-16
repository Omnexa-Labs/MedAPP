// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Application } from '../src/lib/types';
const mock = vi.hoisted(() => ({ activation: vi.fn() }));
vi.mock('@/components/auth', () => ({
  useAccount: () => ({
    identity: { scope: 'scope' },
    api: { activation: mock.activation },
  }),
}));
import { Activation } from '../src/features/activation';
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.resetAllMocks();
});
it.each(['not_started', 'setup_required', 'active', 'pending'])(
  'does not offer an ineffective retry for %s',
  async (state) => {
    mock.activation.mockResolvedValue({
      state,
      attempts: 1,
      reason: null,
      profile_id:
        state === 'active' ? '22222222-2222-4222-8222-222222222222' : null,
      activated_at: state === 'active' ? '2026-09-14T12:00:00Z' : null,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    clients.push(client);
    render(
      <QueryClientProvider client={client}>
        <Activation
          application={
            {
              application_id: 'app',
              version: 4,
              status: 'approved',
            } as Application
          }
          blocked={false}
          onRetry={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const labels: Record<string, string> = {
      not_started: 'Account setup has not started.',
      setup_required: 'Workspace setup is pending.',
      active: 'Professional account setup completed.',
      pending: 'Setting up the professional account.',
    };
    await screen.findByText(labels[state]);
    expect(
      screen.queryByRole('button', { name: 'Retry account setup' }),
    ).toBeNull();
  },
);
it('offers an explicit retry for a delayed setup', async () => {
  mock.activation.mockResolvedValue({
    state: 'retry',
    attempts: 2,
    reason: null,
    profile_id: null,
    activated_at: null,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const retry = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <Activation
        application={
          {
            application_id: 'app',
            version: 4,
            status: 'approved',
          } as Application
        }
        blocked={false}
        onRetry={retry}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry account setup' }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});
it('shows delayed activation and prevents the owner from triggering privileged retry', async () => {
  mock.activation.mockResolvedValue({
    state: 'attention_required',
    attempts: 1,
    reason: 'activation_conflict',
    profile_id: null,
    activated_at: null,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <Activation
        application={
          {
            application_id: 'app',
            version: 4,
            status: 'approved',
          } as Application
        }
        blocked
        onRetry={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const retry = await screen.findByRole('button', {
    name: 'Retry account setup',
  });
  expect((retry as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Issue: activation conflict')).toBeTruthy();
});
