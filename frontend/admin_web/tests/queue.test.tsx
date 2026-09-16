// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mock = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/components/auth', () => ({
  useAccount: () => ({
    identity: { scope: 'scope' },
    api: { list: mock.list },
  }),
}));
import { Queue } from '../src/features/queue';
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('filters loaded applicants and requests the selected saved status', async () => {
  mock.list.mockResolvedValue([
    {
      application_id: 'doctor',
      legal_name: 'Peter Okello',
      display_name: 'Dr. Peter Okello',
      partner_type: 'practitioner',
      practitioner_role: 'doctor',
      status: 'submitted',
    },
    {
      application_id: 'pharmacy',
      legal_name: 'City Care',
      display_name: 'City Care Pharmacy',
      partner_type: 'pharmacy',
      status: 'submitted',
    },
  ]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Queue />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole('link', { name: 'Dr. Peter Okello' }),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Partner type' }), {
    target: { value: 'pharmacy' },
  });
  expect(screen.queryByRole('link', { name: 'Dr. Peter Okello' })).toBeNull();
  expect(
    screen
      .getByRole('link', { name: 'City Care Pharmacy' })
      .getAttribute('href'),
  ).toBe('/applications/pharmacy');
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Search applications' }),
    { target: { value: 'missing' } },
  );
  expect(screen.getByText('No applications match these filters.')).toBeTruthy();
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Application status' }),
    { target: { value: 'approved' } },
  );
  expect(mock.list).toHaveBeenLastCalledWith(
    'approved',
    expect.any(AbortSignal),
  );
  client.clear();
});
