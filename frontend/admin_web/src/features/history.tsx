'use client';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from '@/components/auth';
import { Button, Loading, Notice } from '@/components/ui';
import { documentNames, formatDate, titleCase } from '@/lib/types';
const names: Record<string, string> = {
  approved: 'Application approved',
  rejected: 'Changes requested',
  under_review: 'Review started',
  activation_completed: 'Account setup completed',
  activation_delayed: 'Account setup delayed',
  activation_retried: 'Account setup retried',
};
export function History({ id, version }: { id: string; version: number }) {
  const { identity, api } = useAccount();
  const query = useQuery({
    queryKey: ['history', identity.scope, id, version],
    queryFn: ({ signal }) => api.history(id, signal),
  });
  return (
    <section id="application-history" className="panel history">
      <h2>Application history</h2>
      {query.isPending ? (
        <Loading>Loading application history…</Loading>
      ) : query.isError ? (
        <Notice error>
          {query.error.message}
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Reload history
          </Button>
        </Notice>
      ) : !query.data.length ? (
        <p>No history is available yet.</p>
      ) : (
        <ol>
          {[...query.data].reverse().map((event) => (
            <li key={event.event_id}>
              <strong>{names[event.action] || titleCase(event.action)}</strong>
              <p className="muted">
                {formatDate(event.created_at)} · Version{' '}
                {event.application_version}
              </p>
              {typeof event.details.rejection_reason === 'string' && (
                <p>{event.details.rejection_reason}</p>
              )}
              <details>
                <summary>Saved event details</summary>
                <dl className="details-grid">
                  {Object.entries(event.details)
                    .filter(
                      ([key, value]) =>
                        ![
                          'rejection_reason',
                          'documents',
                          'team_members',
                        ].includes(key) &&
                        value !== null &&
                        ['string', 'number', 'boolean'].includes(typeof value),
                    )
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{titleCase(key)}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                </dl>
                {Array.isArray(event.details.documents) && (
                  <ul>
                    {event.details.documents.map(
                      (
                        doc: {
                          document_id: string;
                          kind: string;
                          label?: string;
                        },
                        index: number,
                      ) => (
                        <li key={`${doc.document_id}:${index}`}>
                          {documentNames[doc.kind] || doc.label || 'Credential'}
                        </li>
                      ),
                    )}
                  </ul>
                )}
                {Array.isArray(event.details.team_members) && (
                  <ul>
                    {event.details.team_members.map(
                      (
                        member: {
                          member_id: string;
                          full_name: string;
                          role: string;
                        },
                        index: number,
                      ) => (
                        <li key={`${member.member_id}:${index}`}>
                          {member.full_name} · {titleCase(member.role)}
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
