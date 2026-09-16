'use client';
import { useQuery } from '@tanstack/react-query';
import { useAccount, useAuth } from '@/components/auth';
import { AppLink } from '@/components/navigation';
import { Button, Notice } from '@/components/ui';
import type { ActivationStatus as State, Application } from '@/lib/types';
import { formatDate } from '@/lib/types';

const copy: Record<State['state'], { title: string; body: string }> = {
  not_started: {
    title: 'Account setup has not started',
    body: 'Your application is approved. MedApp still needs to complete your professional account setup.',
  },
  pending: {
    title: 'Setting up your professional account',
    body: 'Your application is approved. Your professional profile and account access are being prepared.',
  },
  retry: {
    title: 'Account setup is taking longer',
    body: 'Your approval is saved. MedApp will retry account setup automatically.',
  },
  attention_required: {
    title: 'Account setup needs attention',
    body: 'Your approval is saved. A MedApp administrator needs to resolve an account setup issue.',
  },
  setup_required: {
    title: 'Workspace setup is pending',
    body: 'Your application is approved. Your organization’s workspace still needs to be configured.',
  },
  active: {
    title: 'Professional account setup completed',
    body: 'Return to MedApp and refresh your application status to load your professional access. Current account and profile permissions still apply.',
  },
};

export function ActivationStatus({
  application,
}: {
  application: Application;
}) {
  const account = useAccount();
  const auth = useAuth();
  const query = useQuery({
    queryKey: [
      'activation',
      account.scope,
      application.application_id,
      application.version,
    ],
    queryFn: ({ signal }) =>
      account.api.activation(application.application_id, signal),
    refetchInterval: (state) =>
      ['pending', 'retry'].includes(state.state.data?.state ?? '')
        ? 10000
        : false,
    refetchIntervalInBackground: false,
  });
  if (query.isPending)
    return (
      <Notice>
        <p role="status">Checking professional account setup…</p>
      </Notice>
    );
  const refresh = (
    <Button
      variant="secondary"
      busy={query.isFetching}
      onClick={() => {
        void query.refetch();
      }}
    >
      Refresh setup status
    </Button>
  );
  if (query.isError)
    return (
      <Notice danger action={refresh}>
        <h2>Account setup status unavailable</h2>
        <p>
          Your application approval is saved. Refresh to check whether account
          setup has completed.
        </p>
      </Notice>
    );
  const message = copy[query.data.state];
  return (
    <Notice action={refresh}>
      <h2>{message.title}</h2>
      <p>{message.body}</p>
      {query.data.activated_at && (
        <p>Setup completed: {formatDate(query.data.activated_at)}</p>
      )}
      {auth.identity?.returnAvailable && (
        <p>
          <AppLink href="/return-to-app" className="text-link">
            Return to MedApp
          </AppLink>
        </p>
      )}
    </Notice>
  );
}
