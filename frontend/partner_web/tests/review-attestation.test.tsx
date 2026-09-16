// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { Application } from '../src/lib/types';
const mock = vi.hoisted(() => ({ submit: vi.fn(), afterSave: vi.fn() }));
vi.mock('@/components/auth', () => ({
  useAccount: () => ({ api: { submit: mock.submit } }),
}));
vi.mock('@/components/navigation', () => ({
  useNavigation: () => ({ afterSave: mock.afterSave }),
  useUnsavedChanges: () => {},
  AppLink: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
vi.mock('@/features/application-hooks', () => ({
  useRequirements: () => ({
    isPending: false,
    isError: false,
    data: {
      required_fields: ['legal_name'],
      required_document_kinds: ['medical_license'],
      requires_team_member: false,
      attestation_version: 'professional-application-v1',
      attestation_text: 'I confirm this application is accurate.',
    },
  }),
  useApplicationAction: () => ({
    busy: false,
    mustReload: false,
    error: '',
    run: (task: (signal: AbortSignal) => Promise<Application>) =>
      task(new AbortController().signal),
  }),
}));
vi.mock('@/features/documents', () => ({
  SavedDocument: () => <span>Saved evidence</span>,
}));
vi.mock('@/components/ui', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  ConfirmDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onConfirm: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Submit this application?">
        <button onClick={onConfirm}>Submit for verification</button>
      </div>
    ) : null,
}));
import { Review } from '../src/features/review';
const application: Application = {
  application_id: '11111111-1111-4111-8111-111111111111',
  version: 1,
  status: 'draft',
  partner_type: 'practitioner',
  onboarding_mode: null,
  submitted_by_user_id: '33333333-3333-4333-8333-333333333333',
  created_at: '2026-09-14T10:00:00Z',
  updated_at: '2026-09-14T10:00:00Z',
  submitted_at: null,
  reviewed_at: null,
  rejection_reason: null,
  legal_name: 'QA Applicant',
  display_name: 'QA Applicant',
  team_members: [],
  documents: [
    {
      document_id: '22222222-2222-4222-8222-222222222222',
      kind: 'medical_license',
      label: 'QA medical license',
      url: '/v1/onboarding/applications/11111111-1111-4111-8111-111111111111/documents/22222222-2222-4222-8222-222222222222/download',
      verified: false,
      content_type: 'application/pdf',
      uploaded_at: '2026-09-14T10:00:00Z',
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function openConfirmation() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Submit for verification' }),
  );
}
it('does not attest to a newer version arriving while the confirmation is open', async () => {
  const view = render(<Review application={application} />);
  openConfirmation();
  view.rerender(
    <Review
      application={{
        ...application,
        version: 2,
        legal_name: 'Changed elsewhere',
      }}
    />,
  );
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Submit for verification',
    }),
  );
  expect(mock.submit).not.toHaveBeenCalled();
  expect(mock.afterSave).not.toHaveBeenCalled();
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(
    false,
  );
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('submits the explicitly accepted version and renders navigation from the saved result', async () => {
  mock.submit.mockResolvedValue({
    ...application,
    version: 2,
    status: 'submitted',
  });
  render(<Review application={application} />);
  openConfirmation();
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Submit for verification',
    }),
  );
  await waitFor(() =>
    expect(mock.afterSave).toHaveBeenCalledWith(
      `/applications/${application.application_id}/review`,
    ),
  );
  expect(mock.submit).toHaveBeenCalledWith(
    application.application_id,
    1,
    'professional-application-v1',
    expect.any(AbortSignal),
  );
});
