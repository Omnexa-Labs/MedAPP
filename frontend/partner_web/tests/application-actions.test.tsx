// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/lib/api';
import type { Application } from '../src/lib/types';
const account = vi.hoisted(() => ({
  scope: 'test-scope',
  signal: new AbortController().signal,
  api: { read: vi.fn() },
}));
vi.mock('@/components/auth', () => ({ useAccount: () => account }));
import { useApplicationAction } from '../src/features/application-hooks';
const saved = {
  application_id: '11111111-1111-4111-8111-111111111111',
  version: 3,
} as Application;
function setup(id?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const hook = renderHook(() => useApplicationAction(id), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, client };
}
beforeEach(() => {
  account.signal = new AbortController().signal;
  vi.clearAllMocks();
});
afterEach(cleanup);
it('blocks retry after an uncertain create and leaves recovery to the saved list', async () => {
  const { result } = setup();
  const task = vi.fn().mockRejectedValue(new ApiError(504, 'Timeout'));
  await act(async () => {
    await result.current.run(task);
  });
  expect(result.current.mustReload).toBe(true);
  await act(async () => {
    await result.current.reload();
    await result.current.run(task);
  });
  expect(task).toHaveBeenCalledTimes(1);
  expect(result.current.mustReload).toBe(true);
});
it('requires successful readback after a stale version before another write', async () => {
  const { result, client } = setup(saved.application_id);
  await act(async () => {
    await result.current.run(async () => {
      throw new ApiError(412, 'Application changed');
    });
  });
  expect(result.current.mustReload).toBe(true);
  account.api.read.mockResolvedValue(saved);
  await act(async () => {
    await result.current.reload();
  });
  expect(result.current.mustReload).toBe(false);
  expect(
    client.getQueryData(['application', account.scope, saved.application_id]),
  ).toEqual(saved);
});
it('cancels in-flight mutations when the account scope is removed', async () => {
  const controller = new AbortController();
  account.signal = controller.signal;
  const { result, client } = setup(saved.application_id);
  let requestSignal!: AbortSignal;
  let finish!: (value: Application) => void;
  let pending!: Promise<Application | undefined>;
  act(() => {
    pending = result.current.run((signal) => {
      requestSignal = signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
  });
  act(() => controller.abort());
  expect(requestSignal.aborted).toBe(true);
  await act(async () => {
    finish(saved);
    await pending;
  });
  expect(
    client.getQueryData(['application', account.scope, saved.application_id]),
  ).toBeUndefined();
});
it('guards double clicks while a mutation is pending', async () => {
  const { result } = setup(saved.application_id);
  let finish!: (value: Application) => void;
  const task = vi.fn(
    () =>
      new Promise<Application>((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<Application | undefined>;
  act(() => {
    pending = result.current.run(task);
    void result.current.run(task);
  });
  expect(task).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(saved);
    await pending;
  });
  await waitFor(() => expect(result.current.busy).toBe(false));
});
