'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useAccount } from '@/components/auth';
import {
  Button,
  ConfirmDialog,
  Loading,
  Notice,
  Status,
} from '@/components/ui';
import {
  type Application,
  type Requirements,
  formatDate,
  titleCase,
} from '@/lib/types';
import { partnerLabel } from './queue';
import { Credential } from './credentials';
import { History } from './history';
import { Activation } from './activation';
type Decision = 'under_review' | 'approve' | 'reject' | 'retry';
type Intent = {
  action: Decision;
  version: number;
  documents: string[];
  feedback: string;
};
const actionLabels = {
  under_review: 'Start review',
  approve: 'Approve application',
  reject: 'Request changes',
  retry: 'Retry account setup',
};
export function Review({ id }: { id: string }) {
  const { identity, api } = useAccount();
  const [reload, setReload] = useState(0);
  const query = useQuery({
    queryKey: ['application', identity.scope, id],
    queryFn: ({ signal }) => api.read(id, signal),
  });
  const requirements = useQuery({
    queryKey: ['requirements', identity.scope, id, query.data?.version],
    queryFn: ({ signal }) => api.requirements(id, signal),
    enabled: !!query.data,
  });
  async function refresh() {
    const result = await query.refetch();
    if (result.isSuccess) setReload((value) => value + 1);
  }
  if (query.isPending || (query.data && requirements.isPending))
    return <Loading>Loading application review…</Loading>;
  if (
    query.isError ||
    requirements.isError ||
    !query.data ||
    !requirements.data
  )
    return (
      <main className="workspace">
        <Link className="text-link" href="/">
          Back to applications
        </Link>
        <Notice error>Application review could not be loaded.</Notice>
        <Button
          onClick={() => {
            void refresh();
            void requirements.refetch();
          }}
        >
          Reload application
        </Button>
      </main>
    );
  return (
    <LoadedReview
      key={`${id}:${query.data.version}:${reload}`}
      application={query.data}
      requirements={requirements.data}
      onReload={refresh}
    />
  );
}
export function LoadedReview({
  application,
  requirements,
  onReload,
}: {
  application: Application;
  requirements: Requirements;
  onReload: () => Promise<void>;
}) {
  const { identity, api } = useAccount();
  const cache = useQueryClient();
  const [verified, setVerified] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mustReload, setMustReload] = useState(false);
  const current = useRef(application);
  current.current = application;
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [],
  );
  const own = application.submitted_by_user_id === identity.user.id;
  const reviewable =
    ['submitted', 'under_review'].includes(application.status) && !own;
  const disabled = busy || mustReload;
  const ready =
    requirements.required_document_kinds.every((kind) =>
      application.documents.some(
        (doc) =>
          doc.kind === kind &&
          !!doc.content_type &&
          verified.includes(doc.document_id),
      ),
    ) &&
    requirements.required_fields.every(
      (field) => !!application[field as keyof Application],
    ) &&
    (!requirements.requires_team_member ||
      application.team_members.length > 0) &&
    !!application.attested_at &&
    application.attestation_version === requirements.attestation_version;
  function choose(action: Decision) {
    setIntent({
      action,
      version: application.version,
      documents: [...verified],
      feedback,
    });
  }
  async function confirm() {
    if (!intent || active.current || mustReload) return;
    const chosen = intent;
    if (
      chosen.version !== current.current.version ||
      own ||
      (chosen.action !== 'retry' && !reviewable)
    ) {
      setIntent(null);
      setVerified([]);
      setError('The application changed. Reload before deciding.');
      setMustReload(true);
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    try {
      if (chosen.action === 'retry') {
        await api.retry(
          application.application_id,
          chosen.version,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          await cache.invalidateQueries({
            queryKey: [
              'activation',
              identity.scope,
              application.application_id,
            ],
          });
          await cache.invalidateQueries({
            queryKey: ['history', identity.scope, application.application_id],
          });
        }
      } else {
        const saved = await api.review(
          application.application_id,
          chosen.version,
          chosen.action,
          chosen.action === 'approve' ? chosen.documents : [],
          chosen.feedback,
          controller.signal,
        );
        if (!controller.signal.aborted)
          cache.setQueryData(
            ['application', identity.scope, application.application_id],
            saved,
          );
      }
      if (!controller.signal.aborted) {
        setIntent(null);
        setVerified([]);
        setFeedback('');
        await cache.invalidateQueries({
          queryKey: ['applications', identity.scope],
        });
        if (!controller.signal.aborted) await onReload();
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setIntent(null);
        setError(
          failure instanceof Error
            ? failure.message
            : 'The action could not be confirmed.',
        );
        setMustReload(true);
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  }
  const details: [string, unknown][] = [
    [
      'Professional name',
      [application.professional_first_name, application.professional_last_name]
        .filter(Boolean)
        .join(' '),
    ],
    ['Legal name', application.legal_name],
    ['Display name', application.display_name],
    ['Specialty', application.specialty],
    ['License number', application.license_number],
    ['Registration number', application.registration_number],
    ['Tax ID', application.tax_id],
    [
      'Location',
      [application.city, application.country].filter(Boolean).join(', '),
    ],
    ['Address', application.address_line1],
    ['Email', application.email],
    ['Phone', application.phone],
    ['Website', application.website_url],
    ['Notes', application.notes],
  ];
  return (
    <main className="workspace">
      <Link className="back-link" href="/">
        <ArrowLeft size={18} aria-hidden="true" />
        Back to applications
      </Link>
      <div className="page-heading page-heading--actions">
        <div>
          <h1>{application.display_name || application.legal_name}</h1>
          <p>{partnerLabel(application)}</p>
        </div>
        <Status value={application.status} />
      </div>
      {error && (
        <Notice error>
          {error}
          <p>Reload the saved application before another action.</p>
          <Button
            variant="secondary"
            busy={busy}
            onClick={() => void onReload()}
          >
            Reload saved application
          </Button>
        </Notice>
      )}
      {own && (
        <Notice>
          You can view your application, but an independent administrator must
          review it.
        </Notice>
      )}
      <div className="review-columns">
        <div className="review-main">
          <section className="panel">
            <h2>Application details</h2>
            <dl className="details-grid">
              {details
                .filter(([, value]) => !!value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
            </dl>
            {application.team_members.length > 0 && (
              <>
                <h3>Team members</h3>
                <ul>
                  {application.team_members.map((member) => (
                    <li key={member.member_id}>
                      {member.full_name} · {titleCase(member.role)}
                      {member.email ? ` · ${member.email}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <section className="panel">
            <h2>Credentials</h2>
            <p className="muted">
              Open each required document and confirm that you have verified it.
            </p>
            {!application.documents.length && (
              <p>No credentials have been uploaded.</p>
            )}
            {application.documents.map((document) => (
              <Credential
                key={`${application.version}:${document.document_id}`}
                applicationId={application.application_id}
                document={document}
                canVerify={reviewable && !disabled}
                checked={verified.includes(document.document_id)}
                onVerified={(value) =>
                  setVerified((previous) =>
                    value
                      ? [...new Set([...previous, document.document_id])]
                      : previous.filter((id) => id !== document.document_id),
                  )
                }
              />
            ))}
          </section>
        </div>
        <aside>
          <section className="panel decision">
            <h2>Review decision</h2>
            <p className="muted">
              Your decision applies to this saved application version.
            </p>
            {reviewable ? (
              <>
                <Button
                  variant="secondary"
                  disabled={disabled || application.status === 'under_review'}
                  onClick={() => choose('under_review')}
                >
                  Start review
                </Button>
                <Button
                  disabled={disabled || !ready}
                  onClick={() => choose('approve')}
                >
                  Approve application
                </Button>
                {!ready && (
                  <p className="hint">
                    Approval requires the current applicant attestation,
                    complete details and verified required credentials.
                  </p>
                )}
                <label className="field feedback">
                  Feedback for applicant
                  <textarea
                    placeholder="Explain what needs to be corrected"
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    maxLength={2000}
                    disabled={disabled}
                    rows={4}
                  />
                </label>
                <Button
                  variant="danger"
                  disabled={disabled || !feedback.trim()}
                  onClick={() => choose('reject')}
                >
                  Request changes
                </Button>
              </>
            ) : (
              <p>
                {application.status === 'rejected'
                  ? application.rejection_reason ||
                    'Changes have been requested.'
                  : 'No review decision is available in the current application state.'}
              </p>
            )}
          </section>
          <Activation
            application={application}
            blocked={disabled || own}
            onRetry={() => choose('retry')}
          />
        </aside>
      </div>
      <p className="record-meta">
        Submitted {formatDate(application.submitted_at)} · Version{' '}
        {application.version}
      </p>
      <History id={application.application_id} version={application.version} />
      <ConfirmDialog
        open={!!intent}
        busy={busy}
        title={intent ? `${actionLabels[intent.action]}?` : ''}
        action={intent ? actionLabels[intent.action] : 'Confirm'}
        onCancel={() => setIntent(null)}
        onConfirm={() => void confirm()}
      >
        <p>
          {application.display_name || application.legal_name} · Version{' '}
          {intent?.version}
        </p>
        {intent?.action === 'approve' && (
          <p>
            You confirm that the selected credentials have been verified.
            Approval starts professional account setup.
          </p>
        )}
        {intent?.action === 'reject' && <p>{intent.feedback}</p>}
        {intent?.action === 'retry' && (
          <p>
            Retry setup using the saved approval. Existing professional profile
            edits are preserved.
          </p>
        )}
      </ConfirmDialog>
    </main>
  );
}
