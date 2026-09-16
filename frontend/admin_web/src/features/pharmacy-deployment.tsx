'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount } from '@/components/auth';
import { Button, ConfirmDialog, Loading, Notice } from '@/components/ui';
import { ApiError } from '@/lib/api';
import type { Application } from '@/lib/types';
import { formatDate } from '@/lib/types';

export function PharmacyDeployment({ application, pharmacyId, blocked, onContinue }: {
  application: Application; pharmacyId: string; blocked: boolean; onContinue: () => void;
}) {
  const { identity, api } = useAccount();
  const cache = useQueryClient();
  const queryKey = ['pharmacy-deployment', identity.scope, application.application_id, pharmacyId];
  const query = useQuery({ queryKey, queryFn: ({ signal }) => api.pharmacyDeployment(application.application_id, signal), refetchOnWindowFocus: false });
  const choices = useQuery({ queryKey: ['pharmacy-deployments', identity.scope], queryFn: ({ signal }) => api.pharmacyDeployments(signal), refetchOnWindowFocus: false });
  const [selection, setSelection] = useState('');
  const [intent, setIntent] = useState<{ key: string; label: string; version: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mustReload, setMustReload] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const saved = query.data;
  const own = application.submitted_by_user_id === identity.user.id;
  const available = choices.data?.filter((item) => !item.assigned) ?? [];
  const selected = available.find((item) => item.deployment_key === selection);
  const disabled = blocked || own || busy || mustReload || query.isFetching || choices.isFetching || query.isError || choices.isError;
  async function reload() {
    if (active.current) return;
    const [assignment, options] = await Promise.all([query.refetch(), choices.refetch()]);
    if (assignment.isSuccess && options.isSuccess) {
      setMustReload(false); setError(''); setIntent(null); setSelection('');
    }
  }
  async function confirm() {
    if (!intent || active.current || disabled || !saved || saved.deployment_key || saved.version !== intent.version) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.assignPharmacyDeployment(application.application_id, intent.key, intent.version, controller.signal);
      if (controller.signal.aborted) return;
      if (result.pharmacy_id !== pharmacyId || result.deployment_key !== intent.key)
        throw new Error('The saved assignment could not be confirmed.');
      cache.setQueryData(queryKey, result);
      void cache.invalidateQueries({ queryKey: ['pharmacy-deployments', identity.scope] });
      setNotice('Deployment assigned. Continue account setup to activate this pharmacy workspace.');
      setIntent(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(error instanceof ApiError ? error.message : 'The assignment could not be confirmed. Reload the saved deployment before trying again.');
      setMustReload(true); setIntent(null);
    } finally {
      if (!controller.signal.aborted) { setBusy(false); active.current = null; }
    }
  }
  return <section className="pharmacy-deployment" aria-labelledby="pharmacy-deployment-title">
    <h3 id="pharmacy-deployment-title">Pharmacy workspace</h3>
    <p className="muted">Connect {application.display_name} to its pharmacy management system.</p>
    {own && <Notice>Another administrator must assign your pharmacy deployment and continue setup.</Notice>}
    {notice && <Notice>{notice}</Notice>}
    {error && <Notice error>{error}</Notice>}
    {query.isPending || choices.isPending ? <Loading>Loading pharmacy deployments…</Loading> : query.isError || choices.isError ?
      <Notice error>The saved deployment could not be loaded. Reload before continuing.</Notice> : saved?.pharmacy_id !== pharmacyId ?
      <Notice error>The pharmacy identity changed. Refresh the application before continuing.</Notice> : saved.deployment_key ? <>
        <p><strong>Assigned deployment:</strong> {choices.data?.find((item) => item.deployment_key === saved.deployment_key)?.label ?? saved.deployment_key}</p>
        <p className="muted">This assignment is permanent. Deployment moves require administrator reconciliation.</p>
        {saved.activated_at ? <p>Workspace activated {formatDate(saved.activated_at)}</p> : <Button disabled={blocked || own || busy || mustReload} onClick={onContinue}>Continue account setup</Button>}
      </> : available.length === 0 ? <Notice>No unassigned deployments are available. Configure a separate PMS deployment, then reload this list.</Notice> : <>
        <label htmlFor="pharmacy-deployment-choice">Deployment</label>
        <select id="pharmacy-deployment-choice" value={selection} disabled={disabled} onChange={(event) => setSelection(event.target.value)}>
          <option value="">Select a deployment</option>
          {available.map((item) => <option key={item.deployment_key} value={item.deployment_key}>{item.label}</option>)}
        </select>
        <p className="muted">Assign the deployment provisioned for this pharmacy. Each deployment belongs to one pharmacy.</p>
        <Button disabled={disabled || !selected} onClick={() => selected && setIntent({ key: selected.deployment_key, label: selected.label, version: saved.version })}>Review assignment</Button>
      </>}
    <Button variant="ghost" disabled={busy} busy={query.isFetching || choices.isFetching} onClick={() => void reload()}>Reload deployment</Button>
    <ConfirmDialog open={!!intent} title="Assign pharmacy deployment?" busy={busy} action="Assign deployment" onCancel={() => setIntent(null)} onConfirm={() => void confirm()}>
      <p>Assign <strong>{intent?.label}</strong> to <strong>{application.display_name}</strong>?</p>
      <p>This is permanent, including if account setup is interrupted. The pharmacy remains private until it is published.</p>
    </ConfirmDialog>
  </section>;
}
