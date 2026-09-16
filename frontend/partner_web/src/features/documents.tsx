'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  IdCard,
  ShieldPlus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAccount } from '@/components/auth';
import { useNavigation, useUnsavedChanges } from '@/components/navigation';
import {
  ApplicationAside,
  Button,
  ConfirmDialog,
  Loading,
  Notice,
  Stepper,
} from '@/components/ui';
import type { Application, DocumentRecord, Requirements } from '@/lib/types';
import { documentNames, formatDate, titleCase } from '@/lib/types';
import { useApplicationAction, useRequirements } from './application-hooks';
import { ActionError } from './action-error';

export function DocumentDownload({
  applicationId,
  document,
}: {
  applicationId: string;
  document: DocumentRecord;
}) {
  const { api } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  useEffect(
    () => () => {
      controller.current?.abort();
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current.clear();
    },
    [],
  );
  async function download() {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError('');
    try {
      const blob = await api.download(
        applicationId,
        document.document_id,
        active.signal,
      );
      if (active.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${document.document_id}.${blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/png' ? 'png' : 'jpg'}`;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }, 1000);
    } catch (failure) {
      if (!active.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Download failed. Please try again.',
        );
    } finally {
      if (controller.current === active) {
        controller.current = null;
        if (!active.signal.aborted) setBusy(false);
      }
    }
  }
  return (
    <span className="document-download">
      <Button
        variant="ghost"
        busy={busy}
        onClick={() => {
          void download();
        }}
        aria-label={`Download ${document.label || documentNames[document.kind] || 'document'}`}
      >
        <Download size={18} />
        <span>Download</span>
      </Button>
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </span>
  );
}
export function SavedDocument({
  applicationId,
  document,
  remove,
  disabled,
}: {
  applicationId: string;
  document: DocumentRecord;
  remove?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="saved-document">
      <FileText size={24} aria-hidden="true" />
      <div className="document-file">
        <strong>
          {document.label ||
            documentNames[document.kind] ||
            titleCase(document.kind)}
        </strong>
        <p>
          {document.size_bytes
            ? `${document.size_bytes < 1024 ? `${document.size_bytes} bytes` : `${(document.size_bytes / 1024).toFixed(0)} KB`} · `
            : ''}
          {formatDate(document.uploaded_at)}
        </p>
        <span
          className={`status ${document.verified ? 'status--approved' : ''}`}
        >
          {document.verified ? 'Verified' : 'Uploaded'}
        </span>
      </div>
      <div className="document-actions">
        <DocumentDownload applicationId={applicationId} document={document} />
        {remove && (
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={remove}
            aria-label={`Remove ${document.label || documentNames[document.kind]}`}
          >
            <Trash2 size={18} />
          </Button>
        )}
      </div>
    </div>
  );
}
function UploadWell({
  kind,
  requirements,
  disabled,
  upload,
}: {
  kind: string;
  requirements: Requirements;
  disabled: boolean;
  upload: (kind: string, file: File) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  async function choose(files: FileList | null) {
    if (disabled || !files) return;
    setError('');
    if (files.length !== 1) {
      setError('Choose one document at a time.');
      return;
    }
    const file = files[0];
    if (!file.size) {
      setError('The selected file is empty.');
      return;
    }
    if (file.size > requirements.max_document_bytes) {
      setError(
        `Choose a file no larger than ${Math.floor(requirements.max_document_bytes / 1024 / 1024)} MB.`,
      );
      return;
    }
    const mime =
      file.type ||
      (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
    if (!requirements.allowed_content_types.includes(mime)) {
      setError('Choose a PDF, JPG or PNG document.');
      return;
    }
    await upload(kind, file);
  }
  return (
    <>
      <div
        className={`upload-well ${dragging ? 'dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void choose(event.dataTransfer.files);
        }}
      >
        <Upload size={32} strokeWidth={1.8} aria-hidden="true" />
        <input
          className="sr-only"
          ref={input}
          type="file"
          aria-label={`Upload ${documentNames[kind] || titleCase(kind)}`}
          accept={requirements.allowed_content_types.join(',')}
          disabled={disabled}
          onChange={(event) => {
            void choose(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
        />
        <Button disabled={disabled} onClick={() => input.current?.click()}>
          Choose file
        </Button>
        <p>or drag a document here</p>
        <small>
          PDF, JPG or PNG · up to{' '}
          {Math.floor(requirements.max_document_bytes / 1024 / 1024)} MB
        </small>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function Credentials({ application }: { application: Application }) {
  const requirements = useRequirements(application);
  if (requirements.isPending)
    return <Loading label="Loading credential requirements…" />;
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
  return (
    <CredentialEditor
      application={application}
      requirements={requirements.data}
    />
  );
}
function CredentialEditor({
  application,
  requirements,
}: {
  application: Application;
  requirements: Requirements;
}) {
  const { api } = useAccount();
  const navigation = useNavigation();
  const action = useApplicationAction(application.application_id);
  const [extra, setExtra] = useState<string[]>([]);
  const [removing, setRemoving] = useState<DocumentRecord | null>(null);
  const [uploading, setUploading] = useState('');
  useUnsavedChanges(action.busy);
  const order = [
    'medical_license',
    'nursing_license',
    'pharmacy_license',
    'hospital_license',
    'registration_certificate',
    'government_id',
    'board_certificate',
    'tax_certificate',
  ];
  const kinds = [
    ...new Set([
      ...requirements.required_document_kinds,
      ...application.documents.map((document) => document.kind),
      ...extra,
    ]),
  ].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const missing = requirements.required_document_kinds.filter(
    (kind) =>
      !application.documents.some(
        (document) => document.kind === kind && document.content_type,
      ),
  );
  const disabled = action.busy || action.mustReload;
  async function upload(kind: string, file: File) {
    setUploading(kind);
    await action.run((signal) =>
      api.upload(
        application.application_id,
        application.version,
        kind,
        file,
        signal,
      ),
    );
    setUploading('');
  }
  return (
    <main className="workspace workspace--flow">
      <div className="page-heading">
        <h1>Verification &amp; Credentials</h1>
        <p>
          Upload the documents needed to review your professional application.
        </p>
      </div>
      <Stepper step={2} />
      <ActionError {...action} />
      <div className="application-columns">
        <section
          className="panel document-panel"
          aria-label="Application credentials"
        >
          {kinds.map((kind, index) => {
            const documents = application.documents.filter(
              (document) => document.kind === kind,
            );
            const required =
              requirements.required_document_kinds.includes(kind);
            const Icon = kind === 'government_id' ? IdCard : ShieldPlus;
            return (
              <section className="credential-section" key={kind}>
                {index > 0 && <hr />}
                <header className="credential-heading">
                  <Icon size={34} strokeWidth={1.8} aria-hidden="true" />
                  <div>
                    <h2>{documentNames[kind] || titleCase(kind)}</h2>
                    {required && (
                      <span className="required-label">Required</span>
                    )}
                  </div>
                  <span className="upload-status">
                    {uploading === kind && action.busy
                      ? 'Uploading…'
                      : documents.length
                        ? 'Uploaded'
                        : 'Not uploaded'}
                  </span>
                </header>
                {documents.map((document) => (
                  <SavedDocument
                    applicationId={application.application_id}
                    document={document}
                    key={document.document_id}
                    remove={() => setRemoving(document)}
                    disabled={disabled}
                  />
                ))}
                {documents.length === 0 && (
                  <UploadWell
                    kind={kind}
                    requirements={requirements}
                    disabled={
                      disabled ||
                      application.documents.length >= requirements.max_documents
                    }
                    upload={upload}
                  />
                )}
              </section>
            );
          })}
          <details className="additional-details">
            <summary>Add a supporting document</summary>
            <label className="field">
              <span>Document type</span>
              <select
                className="input"
                value=""
                disabled={disabled}
                onChange={(event) => {
                  if (event.target.value)
                    setExtra((previous) => [...previous, event.target.value]);
                }}
              >
                <option value="">Choose a document type</option>
                {requirements.allowed_document_kinds
                  .filter((kind) => !kinds.includes(kind))
                  .map((kind) => (
                    <option key={kind} value={kind}>
                      {documentNames[kind] || titleCase(kind)}
                    </option>
                  ))}
              </select>
            </label>
          </details>
          {application.documents.length >= requirements.max_documents && (
            <Notice>
              The application document limit has been reached. Remove an
              existing document before adding another.
            </Notice>
          )}
        </section>
        <ApplicationAside application={application} credentials />
      </div>
      <footer className="flow-footer">
        <div>
          <Button
            variant="secondary"
            disabled={action.busy}
            onClick={() =>
              navigation.navigate(
                `/applications/${application.application_id}/details`,
              )
            }
          >
            <ArrowLeft size={18} />
            Back to details
          </Button>
          <Button
            disabled={disabled || missing.length > 0}
            onClick={() =>
              navigation.navigate(
                `/applications/${application.application_id}/review`,
              )
            }
          >
            Continue to review
            <ArrowRight size={18} />
          </Button>
        </div>
      </footer>
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this document?"
        onCancel={() => setRemoving(null)}
        confirm="Remove document"
        onConfirm={() => {
          const document = removing;
          setRemoving(null);
          if (document)
            void action.run((signal) =>
              api.remove(
                application.application_id,
                application.version,
                document.document_id,
                signal,
              ),
            );
        }}
      >
        <p>
          The document will be removed from this draft. Its history remains
          available to you and authorized reviewers.
        </p>
      </ConfirmDialog>
    </main>
  );
}
