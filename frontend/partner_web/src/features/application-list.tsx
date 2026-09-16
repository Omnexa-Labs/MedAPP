'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FilePlus2 } from 'lucide-react';
import { useAccount } from '@/components/auth';
import { AppLink } from '@/components/navigation';
import { Button, Loading, Notice } from '@/components/ui';
import { formatDate, typeNames } from '@/lib/types';
export const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Changes requested',
  suspended: 'Suspended',
};
export function Status({ status }: { status: string }) {
  return (
    <span
      className={`status status--${Object.hasOwn(statusLabels, status) ? status : 'unknown'}`}
    >
      {statusLabels[status] || 'Status unavailable'}
    </span>
  );
}
export function ApplicationList() {
  const { api, scope, user } = useAccount();
  const query = useQuery({
    queryKey: ['applications', scope],
    queryFn: ({ signal }) => api.list(signal),
  });
  return (
    <main className="workspace">
      <div className="page-heading page-heading--actions">
        <div>
          <h1>Your applications</h1>
          <p>Continue a draft or check the latest review status.</p>
        </div>
        <AppLink href="/new" className="button button--primary">
          <FilePlus2 size={19} />
          New application
        </AppLink>
      </div>
      {query.isPending ? (
        <Loading label="Loading your applications…" />
      ) : query.isError ? (
        <Notice
          danger
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void query.refetch();
              }}
            >
              Retry
            </Button>
          }
        >
          {query.error.message}
        </Notice>
      ) : query.data.filter((item) => item.submitted_by_user_id === user.id)
          .length === 0 ? (
        <section className="panel empty-state">
          <FilePlus2 size={40} />
          <h2>Start your first application</h2>
          <p>
            Choose a provider profile, add your details, and submit your
            credentials for review.
          </p>
          <AppLink href="/new" className="button button--primary">
            Choose a provider profile
            <ArrowRight size={18} />
          </AppLink>
        </section>
      ) : (
        <div className="application-list">
          {query.data
            .filter((item) => item.submitted_by_user_id === user.id)
            .map((item) => (
              <article
                className="application-row panel"
                key={item.application_id}
              >
                <div>
                  <p className="muted">{typeNames[item.partner_type]}</p>
                  <h2>
                    <AppLink
                      href={`/applications/${item.application_id}/${item.status === 'draft' ? 'details' : 'review'}`}
                    >
                      {item.display_name || item.legal_name}
                    </AppLink>
                  </h2>
                  <p className="muted">Updated {formatDate(item.updated_at)}</p>
                </div>
                <Status status={item.status} />
                <AppLink
                  href={`/applications/${item.application_id}/${item.status === 'draft' ? 'details' : 'review'}`}
                  className="button button--secondary"
                >
                  {item.status === 'draft'
                    ? 'Continue draft'
                    : 'View application'}
                  <ArrowRight size={18} />
                </AppLink>
              </article>
            ))}
        </div>
      )}
    </main>
  );
}
