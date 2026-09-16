'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth';
import { useNavigation } from '@/components/navigation';
import { Button, Loading, Notice } from '@/components/ui';
import { request } from '@/lib/api';
import type { Identity } from '@/lib/types';

export function Handoff() {
  const auth = useAuth();
  const navigation = useNavigation();
  const code = useRef<string | null>(null);
  const active = useRef(false);
  const submission = useRef<AbortController | null>(null);
  const [details, setDetails] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const incoming = () => {
      // An OS/browser may reuse this document for a second fragment-only link.
      // A new document resets the old proof, preview and in-flight confirmation.
      if (window.location.hash.startsWith('#code=')) window.location.reload();
    };
    window.addEventListener('hashchange', incoming);
    return () => window.removeEventListener('hashchange', incoming);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (code.current === null) {
      code.current =
        new URLSearchParams(window.location.hash.slice(1)).get('code') || '';
      // Remove the proof from history before requesting account details. It is
      // never stored in localStorage, sent as a query, or copied to another route.
      window.history.replaceState(window.history.state, '', '/handoff');
    }
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(code.current)) {
      setError('Open a new onboarding link from MedApp.');
      return;
    }
    void request<{ name: string; email: string }>('/api/session/handoff', {
      method: 'POST',
      body: JSON.stringify({ code: code.current }),
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setDetails(value);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : 'The link could not be checked.',
          );
      });
    return () => {
      controller.abort();
      submission.current?.abort();
    };
  }, []);
  async function proceed() {
    if (active.current || !details || auth.pending) return;
    active.current = true;
    const controller = new AbortController();
    submission.current = controller;
    setBusy(true);
    setError('');
    try {
      const result = await request<Identity & { destination: string }>(
        '/api/session/handoff/redeem',
        {
          method: 'POST',
          headers: auth.identity
            ? { 'X-Session-Scope': auth.identity.scope }
            : {},
          body: JSON.stringify({ code: code.current }),
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      code.current = '';
      auth.signedIn(result);
      navigation.afterSave(result.destination);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(
        failure instanceof Error
          ? failure.message
          : 'The link could not be opened. Start again in MedApp.',
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="workspace">
      <section
        className="panel"
        style={{ maxWidth: 600, margin: '40px auto', padding: 32 }}
      >
        <h1>Continue from MedApp</h1>
        <p>Open professional onboarding with the account you use in the app.</p>
        {error && <Notice danger>{error}</Notice>}
        {!details && !error ? (
          <Loading label="Checking your MedApp account…" />
        ) : null}
        {details && (
          <>
            <h2>{details.name}</h2>
            <p>{details.email}</p>
            <p>
              Continue only if this is your account. Use Return to MedApp when
              you finish to close this website session.
            </p>
            <Button
              busy={busy}
              disabled={auth.pending}
              onClick={() => {
                void proceed();
              }}
            >
              Continue with this account
            </Button>
          </>
        )}
      </section>
    </main>
  );
}

export function ReturnToApp() {
  const auth = useAuth();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function close() {
    if (!auth.identity || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await request<{ url: string }>('/api/session/return', {
        method: 'POST',
        headers: { 'X-Session-Scope': auth.identity.scope },
      });
      setUrl(result.url);
      window.dispatchEvent(new Event('partner:session-changed'));
      // This page retains an explicit link when the OS cannot open MedApp.
      window.location.assign(result.url);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not close your website session.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="workspace">
      <section
        className="panel"
        style={{ maxWidth: 600, margin: '40px auto', padding: 32 }}
      >
        <h1>Return to MedApp</h1>
        {error && <Notice danger>{error}</Notice>}
        {url ? (
          <>
            <p>
              Your website session is closed. MedApp will reload your saved
              application status.
            </p>
            <a className="button button--primary" href={url}>
              Open MedApp
            </a>
          </>
        ) : (
          <>
            <p>
              Your saved application stays available. Close this website session
              and return to the app to check its status.
            </p>
            <Button
              busy={busy}
              disabled={!auth.identity || auth.pending}
              onClick={() => {
                void close();
              }}
            >
              Close session and return
            </Button>
            {!auth.pending && !auth.identity && (
              <p>
                Your website session has ended. Close this browser and reopen
                MedApp to refresh your saved status.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
