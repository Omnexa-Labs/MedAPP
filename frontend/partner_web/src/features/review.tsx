'use client';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  History,
  Pencil,
} from 'lucide-react';
import { useAccount } from '@/components/auth';
import {
  AppLink,
  useNavigation,
  useUnsavedChanges,
} from '@/components/navigation';
import {
  Button,
  ConfirmDialog,
  Loading,
  Notice,
  Stepper,
} from '@/components/ui';
import type { Application } from '@/lib/types';
import { documentNames, formatDate, typeNames } from '@/lib/types';
import { useApplicationAction, useRequirements } from './application-hooks';
import { ActionError } from './action-error';
import { Status } from './application-list';
import { SavedDocument } from './documents';
import { ActivationStatus } from './activation-status';
import { detailKeys, labels } from './details-model';
export function Review({ application }: { application: Application }) {
  const requirements = useRequirements(application);
  const account = useAccount();
  const navigation = useNavigation();
  const action = useApplicationAction(application.application_id);
  const [attestedVersion, setAttestedVersion] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const draft = application.status === 'draft';
  const accepted = attestedVersion === application.version;
  useUnsavedChanges(action.busy);
  if (requirements.isPending)
    return <Loading label="Loading application review…" />;
  if (requirements.isError)
    return (
      <Notice
        danger
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void requirements.refetch();
            }}
          >
            Retry
          </Button>
        }
      >
        {requirements.error.message}
      </Notice>
    );
  const missingFields = requirements.data.required_fields.filter(
    (key) => !application[key as keyof Application],
  );
  const missingDocuments = requirements.data.required_document_kinds.filter(
    (kind) =>
      !application.documents.some(
        (document) => document.kind === kind && document.content_type,
      ),
  );
  const missingTeam =
    requirements.data.requires_team_member &&
    application.team_members.length === 0;
  const ready =
    missingFields.length === 0 && missingDocuments.length === 0 && !missingTeam;
  const title = draft
    ? 'Review your application'
    : application.status === 'submitted'
      ? 'Application submitted'
      : application.status === 'under_review'
        ? 'Your application is under review'
        : application.status === 'approved'
          ? 'Application approved'
          : application.status === 'rejected'
            ? 'Changes requested'
            : application.status === 'suspended'
              ? 'Application suspended'
              : 'Application status unavailable';
  async function submit() {
    setConfirm(false);
    if (!draft || !accepted || !ready || action.busy || action.mustReload)
      return;
    const saved = await action.run((signal) =>
      account.api.submit(
        application.application_id,
        application.version,
        requirements.data!.attestation_version,
        signal,
      ),
    );
    if (saved) {
      setAttestedVersion(null);
      navigation.afterSave(`/applications/${saved.application_id}/review`);
    }
  }
  return (
    <main className="workspace workspace--flow">
      <div className="page-heading page-heading--actions">
        <div>
          <h1>
            {!draft && application.status === 'approved' && (
              <CheckCircle2 className="title-icon" aria-hidden="true" />
            )}
            {title}
          </h1>
          <p>
            {draft
              ? 'Check your details and credentials before submitting for review.'
              : 'View your saved application, documents, and review history.'}
          </p>
        </div>
        <Status status={application.status} />
      </div>
      {draft && <Stepper step={3} />}
      <ActionError {...action} />
      {application.status === 'approved' && (
        <ActivationStatus
          key={application.application_id}
          application={application}
        />
      )}
      {application.status === 'rejected' && (
        <Notice danger>
          <h2>Feedback from your reviewer</h2>
          <p>
            {application.rejection_reason ||
              'Review your details and credentials before submitting again.'}
          </p>
          <Button
            disabled={action.mustReload}
            busy={action.busy}
            onClick={() => {
              void action
                .run((signal) =>
                  account.api.reopen(
                    application.application_id,
                    application.version,
                    signal,
                  ),
                )
                .then((saved) => {
                  if (saved)
                    navigation.afterSave(
                      `/applications/${saved.application_id}/details`,
                    );
                });
            }}
          >
            <Pencil size={18} />
            Revise application
          </Button>
        </Notice>
      )}
      {draft && !ready && (
        <Notice>
          <h2>Complete these items before submitting</h2>
          <ul>
            {missingFields.map((key) => (
              <li key={key}>
                {labels[key as keyof typeof labels] || key.replaceAll('_', ' ')}
              </li>
            ))}
            {missingDocuments.map((kind) => (
              <li key={kind}>{documentNames[kind] || kind}</li>
            ))}
            {missingTeam && <li>Add at least one care team member.</li>}
          </ul>
        </Notice>
      )}
      <div className="review-layout">
        <section className="panel review-panel">
          <div className="section-heading">
            <h2>{typeNames[application.partner_type]}</h2>
            {draft && (
              <AppLink
                href={`/applications/${application.application_id}/details`}
                className="text-link"
              >
                <Pencil size={16} />
                Edit details
              </AppLink>
            )}
          </div>
          <dl className="details-readback">
            {detailKeys
              .filter(
                (key) =>
                  application[key] !== null &&
                  application[key] !== undefined &&
                  application[key] !== '',
              )
              .map((key) => (
                <div key={key}>
                  <dt>{labels[key]}</dt>
                  <dd>{application[key]}</dd>
                </div>
              ))}
          </dl>
          {application.team_members.length > 0 && (
            <>
              <hr />
              <h2>Care team</h2>
              <ul className="team-list">
                {application.team_members.map((member) => (
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
        </section>
        <section className="panel review-panel">
          <div className="section-heading">
            <h2>Credentials</h2>
            {draft && (
              <AppLink
                href={`/applications/${application.application_id}/credentials`}
                className="text-link"
              >
                <Pencil size={16} />
                Edit documents
              </AppLink>
            )}
          </div>
          {application.documents.length ? (
            application.documents.map((document) => (
              <div key={document.document_id} className="review-document">
                <h3>{documentNames[document.kind] || document.kind}</h3>
                <SavedDocument
                  applicationId={application.application_id}
                  document={document}
                />
              </div>
            ))
          ) : (
            <p>No credentials uploaded yet.</p>
          )}
        </section>
      </div>
      <section className="panel review-panel attestation-panel">
        {draft ? (
          <>
            <h2>Confirm your application</h2>
            <label className="attestation">
              <input
                type="checkbox"
                checked={accepted}
                disabled={action.busy || action.mustReload}
                onChange={(event) =>
                  setAttestedVersion(
                    event.target.checked ? application.version : null,
                  )
                }
              />
              <span>{requirements.data.attestation_text}</span>
            </label>
          </>
        ) : (
          <dl className="submission-details">
            <div>
              <dt>Submitted</dt>
              <dd>{formatDate(application.submitted_at)}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatDate(application.updated_at)}</dd>
            </div>
            <div>
              <dt>Application version</dt>
              <dd>{application.version}</dd>
            </div>
          </dl>
        )}
        <AppLink
          className="text-link"
          href={`/applications/${application.application_id}/history`}
        >
          <History size={18} />
          View application history
        </AppLink>
      </section>
      <footer className="flow-footer">
        <div>
          {draft ? (
            <>
              <Button
                variant="secondary"
                disabled={action.busy}
                onClick={() =>
                  navigation.navigate(
                    `/applications/${application.application_id}/credentials`,
                  )
                }
              >
                <ArrowLeft size={18} />
                Back to credentials
              </Button>
              <Button
                disabled={!accepted || !ready || action.mustReload}
                busy={action.busy}
                onClick={() => setConfirm(true)}
              >
                Submit for verification
                <ArrowRight size={18} />
              </Button>
            </>
          ) : (
            <>
              <AppLink href="/" className="button button--secondary">
                <ArrowLeft size={18} />
                Your applications
              </AppLink>
              <Button
                variant="secondary"
                busy={action.busy}
                onClick={() => {
                  void action.reload();
                }}
              >
                Refresh status
              </Button>
            </>
          )}
        </div>
      </footer>
      <ConfirmDialog
        open={confirm}
        title="Submit this application?"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          void submit();
        }}
        confirm="Submit for verification"
      >
        <p>
          Your details and documents will be sent for review. You can edit them
          again if changes are requested.
        </p>
      </ConfirmDialog>
    </main>
  );
}
