'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useAccount } from '@/components/auth';
import { AppLink } from '@/components/navigation';
import { Button, Loading, Notice } from '@/components/ui';
import type { Application, DocumentRecord, TeamMember } from '@/lib/types';
import { formatDate, titleCase } from '@/lib/types';
import { labels } from './details-model';
import { SavedDocument } from './documents';
const actionNames: Record<string, string> = {
  created: 'Draft created',
  details_updated: 'Details updated',
  document_uploaded: 'Document uploaded',
  document_removed: 'Document removed',
  team_member_added: 'Team member added',
  team_member_removed: 'Team member removed',
  submitted: 'Application submitted',
  under_review: 'Review started',
  rejected: 'Changes requested',
  reopened: 'Application reopened',
  approved: 'Application approved',
  activation_completed: 'Professional account setup completed',
  activation_delayed: 'Professional account setup delayed',
  activation_retried: 'Professional account setup retried',
};
export function ApplicationHistory({
  application,
}: {
  application: Application;
}) {
  const { api, scope, user } = useAccount();
  const query = useQuery({
    queryKey: [
      'history',
      scope,
      application.application_id,
      application.version,
    ],
    queryFn: ({ signal }) => api.history(application.application_id, signal),
  });
  return (
    <main className="workspace">
      <div className="page-heading">
        <AppLink
          href={`/applications/${application.application_id}/${application.status === 'draft' ? 'details' : 'review'}`}
          className="text-link"
        >
          <ArrowLeft size={18} />
          Back to application
        </AppLink>
        <h1>Application history</h1>
        <p>{application.display_name || application.legal_name}</p>
      </div>
      {query.isPending ? (
        <Loading label="Loading application history…" />
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
      ) : query.data.length === 0 ? (
        <div className="panel empty-state">
          <h2>No history available</h2>
          <p>This application has no recorded events.</p>
        </div>
      ) : (
        <ol className="history-list">
          {[...query.data].reverse().map((event) => {
            const documents = Array.isArray(event.details.documents)
              ? (event.details.documents as DocumentRecord[])
              : [];
            const members = Array.isArray(event.details.team_members)
              ? (event.details.team_members as TeamMember[])
              : [];
            const fields = Array.isArray(event.details.fields)
              ? event.details.fields.filter(
                  (key): key is keyof typeof labels =>
                    typeof key === 'string' && Object.hasOwn(labels, key),
                )
              : [];
            return (
              <li key={event.event_id} className="panel history-event">
                <div className="section-heading">
                  <h2>
                    {actionNames[event.action] || titleCase(event.action)}
                  </h2>
                  <span className="muted">
                    Version {event.application_version}
                  </span>
                </div>
                <p className="muted">
                  {formatDate(event.created_at)} ·{' '}
                  {event.actor_id === user.id ? 'You' : 'MedApp reviewer'}
                </p>
                {fields.length > 0 && (
                  <p className="muted">
                    Changed: {fields.map((key) => labels[key]).join(', ')}
                  </p>
                )}
                {typeof event.details.rejection_reason === 'string' && (
                  <Notice>{event.details.rejection_reason}</Notice>
                )}
                {(documents.length > 0 ||
                  typeof event.details.legal_name === 'string') && (
                  <details>
                    <summary>View recorded details</summary>
                    <dl className="details-readback">
                      {Object.keys(labels)
                        .filter(
                          (key) =>
                            typeof event.details[key] === 'string' &&
                            event.details[key],
                        )
                        .map((key) => (
                          <div key={key}>
                            <dt>{labels[key as keyof typeof labels]}</dt>
                            <dd>{event.details[key] as string}</dd>
                          </div>
                        ))}
                    </dl>
                    {documents.map((document) => (
                      <SavedDocument
                        key={document.document_id}
                        applicationId={application.application_id}
                        document={document}
                      />
                    ))}
                    {members.length > 0 && (
                      <>
                        <h3>Recorded care team</h3>
                        <ul className="team-list">
                          {members.map((member) => (
                            <li key={member.member_id}>
                              <div>
                                <strong>{member.full_name}</strong>
                                <p>
                                  {member.role}
                                  {member.email ? ` · ${member.email}` : ''}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {typeof event.details.attestation_text === 'string' && (
                      <p>{event.details.attestation_text}</p>
                    )}
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
