'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { useAccount } from '@/components/auth';
import { Button } from '@/components/ui';
import { documentNames, formatDate, type DocumentRecord } from '@/lib/types';
export function Credential({
  applicationId,
  document,
  canVerify,
  checked,
  onVerified,
}: {
  applicationId: string;
  document: DocumentRecord;
  canVerify: boolean;
  checked: boolean;
  onVerified: (checked: boolean) => void;
}) {
  const { api } = useAccount();
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const previews = useRef<{ popup: Window; url: string }[]>([]);
  useEffect(
    () => () => {
      active.current?.abort();
      previews.current.forEach(({ popup, url }) => {
        popup.close();
        URL.revokeObjectURL(url);
      });
      previews.current = [];
    },
    [],
  );
  async function open() {
    if (active.current) return;
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      setError('Allow a document preview window, then try again.');
      return;
    }
    popup.opener = null;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    try {
      const blob = await api.document(
        applicationId,
        document.document_id,
        controller.signal,
      );
      if (controller.signal.aborted || popup.closed) {
        popup.close();
        return;
      }
      const url = URL.createObjectURL(blob);
      previews.current.push({ popup, url });
      popup.location.replace(url);
      setOpened(true);
    } catch (failure) {
      popup.close();
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Document could not be opened.',
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  }
  const name = documentNames[document.kind] || document.label || 'Document';
  return (
    <div className="credential">
      <div className="credential-top">
        <FileText size={28} aria-hidden="true" />
        <div>
          <strong>{name}</strong>
          <p>
            {document.content_type === 'application/pdf'
              ? 'PDF'
              : document.content_type === 'image/png'
                ? 'PNG'
                : document.content_type === 'image/jpeg'
                  ? 'JPG'
                  : 'Unmanaged file'}{' '}
            · Uploaded {formatDate(document.uploaded_at)}
          </p>
        </div>
        <Button
          variant="secondary"
          busy={busy}
          disabled={!document.content_type}
          onClick={() => void open()}
          aria-label={`Open ${name}`}
        >
          Open document
        </Button>
      </div>
      {canVerify ? (
        <label className="check">
          <input
            type="checkbox"
            checked={checked}
            disabled={!opened || busy}
            onChange={(event) => onVerified(event.target.checked)}
          />
          I verified this document<span className="sr-only">: {name}</span>
        </label>
      ) : document.verified ? (
        <p className="verified">Verified {formatDate(document.verified_at)}</p>
      ) : null}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
