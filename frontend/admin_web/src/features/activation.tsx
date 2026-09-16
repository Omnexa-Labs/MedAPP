'use client';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from '@/components/auth';
import { Button, Loading, Notice } from '@/components/ui';
import { formatDate, type Application } from '@/lib/types';
import { PharmacyDeployment } from './pharmacy-deployment';
const copy = {
  not_started: [
    'Account setup has not started.',
    'An administrator must reconcile this approval before activation can proceed.',
  ],
  pending: [
    'Setting up the professional account.',
    'Profile and account access are being prepared.',
  ],
  retry: [
    'Account setup is taking longer.',
    'The service will retry automatically.',
  ],
  attention_required: [
    'Account setup needs attention.',
    'Resolve the account or service configuration issue before retrying.',
  ],
  setup_required: [
    'Workspace setup is pending.',
    'This organization requires its hospital or pharmacy workspace setup.',
  ],
  active: [
    'Professional account setup completed.',
    'Current account and profile permissions still apply.',
  ],
};
export function Activation({
  application,
  blocked,
  onRetry,
}: {
  application: Application;
  blocked: boolean;
  onRetry: () => void;
}) {
  const { identity, api } = useAccount();
  const query = useQuery({
    queryKey: [
      'activation',
      identity.scope,
      application.application_id,
      application.version,
    ],
    queryFn: ({ signal }) => api.activation(application.application_id, signal),
    enabled: application.status === 'approved',
    refetchInterval: (q) =>
      ['pending', 'retry'].includes(q.state.data?.state ?? '') ? 10000 : false,
    refetchIntervalInBackground: false,
  });
  if (application.status !== 'approved')
    return (
      <section className="panel">
        <h2>Account setup</h2>
        <p className="muted">Account setup starts after approval.</p>
        <a className="text-link" href="#application-history">
          View application history
        </a>
      </section>
    );
  const data = query.data;
  return (
    <section className="panel">
      <h2>Account setup</h2>
      {query.isPending ? (
        <Loading>Checking account setup…</Loading>
      ) : query.isError ? (
        <Notice error>Account setup status could not be loaded.</Notice>
      ) : data ? (
        <>
          <p>{copy[data.state][0]}</p>
          <p className="muted">{copy[data.state][1]}</p>
          {data.activated_at && (
            <p>Completed {formatDate(data.activated_at)}</p>
          )}
          {data.reason && (
            <p className="muted">Issue: {data.reason.replaceAll('_', ' ')}</p>
          )}
          {application.partner_type === 'pharmacy' && data.profile_id && (
            <PharmacyDeployment key={`${identity.scope}:${application.application_id}:${data.profile_id}`}
              application={application} pharmacyId={data.profile_id} blocked={blocked}
              onContinue={onRetry} />
          )}
          {['retry', 'attention_required'].includes(data.state) && (
            <Button variant="secondary" disabled={blocked} onClick={onRetry}>
              Retry account setup
            </Button>
          )}
        </>
      ) : null}
      <Button
        variant="ghost"
        busy={query.isFetching}
        onClick={() => void query.refetch()}
      >
        Refresh setup status
      </Button>
      <a className="text-link" href="#application-history">
        View application history
      </a>
    </section>
  );
}
