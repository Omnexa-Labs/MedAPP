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
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Application, Requirements } from '../src/lib/types';
const mock = vi.hoisted(() => ({
  review: vi.fn(),
  retry: vi.fn(),
  document: vi.fn(),
  reload: vi.fn(),
  reviewer: '11111111-1111-4111-8111-111111111111',
}));
vi.mock('@/components/auth', () => ({
  useAccount: () => ({
    identity: { user: { id: mock.reviewer }, scope: 'scope' },
    api: { review: mock.review, retry: mock.retry, document: mock.document },
  }),
}));
vi.mock('@/features/history', () => ({ History: () => <p>Saved history</p> }));
vi.mock('@/features/activation', () => ({
  Activation: ({
    application,
    onRetry,
  }: {
    application: Application;
    onRetry: () => void;
  }) =>
    application.status === 'approved' ? (
      <button onClick={onRetry}>Retry account setup</button>
    ) : (
      <p>Account setup starts after approval.</p>
    ),
}));
vi.mock('@/components/ui', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  ConfirmDialog: ({
    open,
    children,
    action,
    onConfirm,
  }: {
    open: boolean;
    children: React.ReactNode;
    action: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div role="dialog">
        {children}
        <button onClick={onConfirm}>{action}</button>
      </div>
    ) : null,
}));
import { LoadedReview } from '../src/features/review';
const docId = '44444444-4444-4444-8444-444444444444';
const application: Application = {
  application_id: '33333333-3333-4333-8333-333333333333',
  submitted_by_user_id: '22222222-2222-4222-8222-222222222222',
  version: 5,
  legal_name: 'Peter Okello',
  display_name: 'Dr. Peter Okello',
  status: 'submitted',
  partner_type: 'practitioner',
  practitioner_role: 'doctor',
  onboarding_mode: null,
  created_at: '2026-09-14T12:00:00Z',
  updated_at: '2026-09-14T12:00:00Z',
  submitted_at: '2026-09-14T12:00:00Z',
  reviewed_at: null,
  rejection_reason: null,
  attested_at: '2026-09-14T12:00:00Z',
  attestation_version: 'v1',
  documents: [
    {
      document_id: docId,
      label: 'Medical license',
      url: '/managed-document',
      kind: 'medical_license',
      content_type: 'application/pdf',
      uploaded_at: '2026-09-14T12:00:00Z',
      verified: false,
    },
  ],
  team_members: [],
};
const requirements = {
  required_fields: ['legal_name'],
  required_document_kinds: ['medical_license'],
  requires_team_member: false,
  attestation_version: 'v1',
} as Requirements;
const clients: QueryClient[] = [];
function mount(value = application) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <LoadedReview
          application={value}
          requirements={requirements}
          onReload={mock.reload}
        />
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => {
  mock.reviewer = '11111111-1111-4111-8111-111111111111';
  mock.reload.mockResolvedValue(undefined);
  vi.stubGlobal(
    'open',
    vi.fn().mockReturnValue({
      opener: {},
      closed: false,
      close: vi.fn(),
      location: { replace: vi.fn() },
    }),
  );
  URL.createObjectURL = vi.fn().mockReturnValue('blob:credential');
  URL.revokeObjectURL = vi.fn();
  mock.document.mockResolvedValue(
    new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
async function verifyDocument() {
  fireEvent.click(screen.getByRole('button', { name: 'Open Medical license' }));
  await waitFor(() =>
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('checkbox'));
}
it('requires opening and explicitly verifying the credential before approval, then sends the saved version', async () => {
  mock.review.mockResolvedValue({
    ...application,
    status: 'approved',
    version: 6,
  });
  mount();
  expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(
    true,
  );
  expect(
    (
      screen.getByRole('button', {
        name: 'Approve application',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await verifyDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Approve application' }));
  expect(mock.review).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Approve application',
    }),
  );
  await waitFor(() =>
    expect(mock.review).toHaveBeenCalledWith(
      application.application_id,
      5,
      'approve',
      [docId],
      '',
      expect.any(AbortSignal),
    ),
  );
  await waitFor(() => expect(mock.reload).toHaveBeenCalled());
});
it('confirms activation retry with the saved approval version', async () => {
  mock.retry.mockResolvedValue({ state: 'pending' });
  mount({ ...application, status: 'approved' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry account setup' }));
  expect(mock.retry).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Retry account setup',
    }),
  );
  await waitFor(() =>
    expect(mock.retry).toHaveBeenCalledWith(
      application.application_id,
      5,
      expect.any(AbortSignal),
    ),
  );
  expect(mock.review).not.toHaveBeenCalled();
});
it('does not allow a failed preview to count as verified', async () => {
  mock.document.mockRejectedValue(new Error('Credential store unavailable'));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Open Medical license' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Credential store unavailable',
  );
  expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(
    true,
  );
});
it('does not apply a confirmation to an application version received later', async () => {
  const view = mount();
  await verifyDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Approve application' }));
  view.rerender(
    <QueryClientProvider client={view.client}>
      <LoadedReview
        application={{ ...application, version: 6 }}
        requirements={requirements}
        onReload={mock.reload}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Approve application',
    }),
  );
  expect(mock.review).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Reload saved application' }),
  ).toBeTruthy();
});
it('requires reload after an uncertain mutation instead of permitting a blind retry', async () => {
  mock.review.mockRejectedValue(new Error('Connection lost after approval'));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Start review',
    }),
  );
  expect(
    await screen.findByRole('button', { name: 'Reload saved application' }),
  ).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Start review' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(mock.review).toHaveBeenCalledTimes(1);
});
it('keeps an administrator’s own application read-only', () => {
  mock.reviewer = application.submitted_by_user_id;
  mount();
  expect(
    screen.queryByRole('button', { name: 'Approve application' }),
  ).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
});
it('cancels an in-flight action when the reviewing account leaves', async () => {
  let finish!: (value: Application) => void;
  mock.review.mockImplementation(
    () =>
      new Promise<Application>((resolve) => {
        finish = resolve;
      }),
  );
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Start review',
    }),
  );
  await waitFor(() => expect(mock.review).toHaveBeenCalled());
  const signal = mock.review.mock.calls[0][5] as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    finish({ ...application, status: 'under_review', version: 6 });
  });
  expect(mock.reload).not.toHaveBeenCalled();
  expect(
    view.client.getQueryData([
      'application',
      'scope',
      application.application_id,
    ]),
  ).toBeUndefined();
});
