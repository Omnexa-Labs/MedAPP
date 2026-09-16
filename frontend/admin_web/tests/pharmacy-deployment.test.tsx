// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Application } from '../src/lib/types';
import { ApiError } from '../src/lib/api';
const fake = vi.hoisted(() => ({ pharmacyDeployment: vi.fn(), pharmacyDeployments: vi.fn(), assignPharmacyDeployment: vi.fn(), user: 'reviewer' }));
vi.mock('@/components/auth', () => ({ useAccount: () => ({ identity: { user: { id: fake.user }, scope: 'scope' }, api: fake }) }));
import { PharmacyDeployment } from '../src/features/pharmacy-deployment';
const pharmacyId = '44444444-4444-4444-8444-444444444444';
const application = { application_id: 'app', submitted_by_user_id: 'applicant', display_name: 'Care Pharmacy' } as Application;
const unassigned = { pharmacy_id: pharmacyId, deployment_key: null, version: 0, activated_at: null };
const assigned = { ...unassigned, deployment_key: 'accra', version: 1 };
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks(); fake.user='reviewer';
  HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open',''); };
  HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
  fake.pharmacyDeployment.mockResolvedValue(unassigned);
  fake.pharmacyDeployments.mockResolvedValue([{ deployment_key: 'accra', label: 'Accra PMS', assigned: false }]);
  fake.assignPharmacyDeployment.mockResolvedValue(assigned);
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client);
  const next = vi.fn();
  return { ...render(<QueryClientProvider client={client}><PharmacyDeployment application={application} pharmacyId={pharmacyId} blocked={false} onContinue={next}/></QueryClientProvider>), next };
}
async function choose() {
  fireEvent.change(await screen.findByLabelText('Deployment'), { target: { value: 'accra' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review assignment' }));
}
it('requires explicit confirmation, saves the selected deployment and offers account setup', async () => {
  const { next } = mount(); await choose();
  expect(fake.assignPharmacyDeployment).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog').textContent).toContain('Care Pharmacy');
  fireEvent.click(screen.getByRole('button', { name: 'Assign deployment' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Continue account setup' }));
  expect(next).toHaveBeenCalledTimes(1);
  expect(fake.assignPharmacyDeployment).toHaveBeenCalledWith('app','accra',0,expect.any(AbortSignal));
  expect(screen.queryByLabelText('Deployment')).toBeNull();
});
it.each([412, 0])('requires reload after stale or uncertain assignment (%s)', async (status) => {
  fake.assignPharmacyDeployment.mockRejectedValue(new ApiError(status, 'Reload the saved deployment.'));
  mount(); await choose(); fireEvent.click(screen.getByRole('button', { name: 'Assign deployment' }));
  await screen.findByRole('alert');
  expect((screen.getByRole('button', { name: 'Review assignment' }) as HTMLButtonElement).disabled).toBe(true);
  fake.pharmacyDeployment.mockResolvedValue(assigned);
  fireEvent.click(screen.getByRole('button', { name: 'Reload deployment' }));
  await screen.findByRole('button', { name: 'Continue account setup' });
  expect(fake.assignPharmacyDeployment).toHaveBeenCalledTimes(1);
});
it('shows an actionable empty state and never invents a deployment', async () => {
  fake.pharmacyDeployments.mockResolvedValue([]); mount();
  await screen.findByText(/No unassigned deployments/);
  expect(screen.queryByRole('button', { name: 'Review assignment' })).toBeNull();
});
it('does not let an applicant assign their own deployment', async () => {
  fake.user='applicant'; mount();
  expect((await screen.findByLabelText('Deployment') as HTMLSelectElement).disabled).toBe(true);
  expect(fake.assignPharmacyDeployment).not.toHaveBeenCalled();
});
it('shows an activated workspace without offering reassignment or unnecessary setup', async () => {
  fake.pharmacyDeployment.mockResolvedValue({ ...assigned, version: 2, activated_at: '2026-09-15T12:00:00Z' }); mount();
  await screen.findByText(/Workspace activated/);
  expect(screen.queryByLabelText('Deployment')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue account setup' })).toBeNull();
});
it('aborts a pending assignment when the account/application view is removed', async () => {
  let finish!: (value: unknown) => void;
  fake.assignPharmacyDeployment.mockReturnValue(new Promise((resolve) => { finish=resolve; }));
  const view=mount(); await choose(); fireEvent.click(screen.getByRole('button', { name: 'Assign deployment' }));
  await waitFor(() => expect(fake.assignPharmacyDeployment).toHaveBeenCalledTimes(1));
  const signal = fake.assignPharmacyDeployment.mock.calls[0][3]; view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(assigned)); expect(view.next).not.toHaveBeenCalled();
});
