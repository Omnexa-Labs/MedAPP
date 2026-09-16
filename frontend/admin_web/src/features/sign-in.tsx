'use client';
import { useEffect, useRef, useState } from 'react';
import { request, type SigninStart, type SigninResult } from '@/lib/api';
import type { Identity } from '@/lib/types';
import { Button, Loading, Notice } from '@/components/ui';
interface GoogleIdentity {
  initialize(options: {
    client_id: string;
    nonce: string;
    hd: string;
    auto_select: boolean;
    callback: (response: { credential: string }) => void;
  }): void;
  renderButton(element: HTMLElement, options: Record<string, unknown>): void;
  cancel(): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}
function GoogleButton({
  attempt,
  onCredential,
  onError,
}: {
  attempt: SigninStart;
  onCredential: (value: string) => void;
  onError: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onCredential, onError });
  handlers.current = { onCredential, onError };
  useEffect(() => {
    let current = true;
    let observer: ResizeObserver | undefined;
    const render = () => {
      if (!current || !ref.current || !window.google) return;
      const google = window.google.accounts.id;
      google.initialize({
        client_id: attempt.client_id,
        nonce: attempt.nonce,
        hd:
          attempt.hosted_domains.length === 1 ? attempt.hosted_domains[0] : '*',
        auto_select: false,
        callback: (result) => {
          if (current) handlers.current.onCredential(result.credential);
        },
      });
      let lastWidth = 0;
      const draw = () => {
        if (!current || !ref.current) return;
        const width = Math.max(
          200,
          Math.min(300, ref.current.clientWidth || 300),
        );
        if (width === lastWidth) return;
        lastWidth = width;
        ref.current.replaceChildren();
        google.renderButton(ref.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          width,
        });
      };
      draw();
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(draw);
        observer.observe(ref.current);
      }
    };
    const failed = () => {
      if (current) {
        script?.remove();
        handlers.current.onError();
      }
    };
    let script = document.querySelector<HTMLScriptElement>(
      'script[data-admin-google]',
    );
    if (window.google) render();
    else {
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.dataset.adminGoogle = 'true';
        document.head.append(script);
      }
      script.addEventListener('load', render);
      script.addEventListener('error', failed);
    }
    return () => {
      current = false;
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', failed);
      observer?.disconnect();
      window.google?.accounts.id.cancel();
    };
  }, [attempt]);
  return (
    <div
      ref={ref}
      className="google-button"
      aria-label="Google Workspace sign-in"
    />
  );
}
export function SignIn({
  onSuccess,
}: {
  onSuccess: (identity: Identity) => void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [availabilityCheck, setAvailabilityCheck] = useState(0);
  const [attempt, setAttempt] = useState<SigninStart | null>(null);
  const [mfa, setMfa] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const active = new AbortController();
    request<{ enabled: boolean }>('/api/sso/config', { signal: active.signal })
      .then((value) => {
        if (!active.signal.aborted) setEnabled(value.enabled);
      })
      .catch((failure) => {
        if (!active.signal.aborted) {
          setError(failure.message);
          setEnabled(false);
        }
      });
    return () => {
      mounted.current = false;
      active.abort();
      controller.current?.abort();
    };
  }, [availabilityCheck]);
  async function run(action: string, body: object = {}, scope?: string) {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError('');
    try {
      const result = await request<SigninStart | SigninResult>(
        `/api/sso/${action}`,
        {
          method: 'POST',
          signal: active.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(scope ? { 'X-Signin-Scope': scope } : {}),
          },
          body: JSON.stringify(body),
        },
      );
      if (!mounted.current || active.signal.aborted) return;
      if ('nonce' in result) {
        setAttempt(result);
        setMfa(null);
        setCode('');
      } else if ('mfa_required' in result) {
        setMfa(result.scope);
        setAttempt(null);
      } else {
        onSuccess(result);
      }
    } catch (failure) {
      if (mounted.current && !active.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Sign-in failed. Start again.',
        );
    } finally {
      if (controller.current === active) {
        controller.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }
  return (
    <main className="signin">
      <section className="panel">
        <h1>Sign in to MedApp Admin</h1>
        <p className="muted">
          Use your authorized Google Workspace account to review professional
          applications.
        </p>
        {error && <Notice error>{error}</Notice>}
        {enabled === null ? (
          <Loading>Checking Workspace sign-in…</Loading>
        ) : !enabled ? (
          <Notice>
            Google Workspace sign-in is not configured or could not be reached.
            Contact your MedApp administrator.
            <p>
              <Button
                variant="secondary"
                onClick={() => {
                  setError('');
                  setEnabled(null);
                  setAvailabilityCheck((value) => value + 1);
                }}
              >
                Check sign-in availability
              </Button>
            </p>
          </Notice>
        ) : mfa ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run('verify', { code: code.trim() }, mfa);
            }}
          >
            <label className="field">
              Authenticator or recovery code
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                maxLength={32}
                required
                disabled={busy}
              />
            </label>
            <Button type="submit" busy={busy}>
              Verify and sign in
            </Button>
          </form>
        ) : attempt ? (
          <>
            <GoogleButton
              attempt={attempt}
              onCredential={(credential) =>
                void run('complete', { credential }, attempt.scope)
              }
              onError={() =>
                setError(
                  'Google sign-in could not load. Check your connection and reload.',
                )
              }
            />
            {busy && <Loading>Verifying sign-in…</Loading>}
          </>
        ) : (
          <Button busy={busy} onClick={() => void run('begin')}>
            Continue with Google Workspace
          </Button>
        )}
        {(attempt || mfa) && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void run('begin')}
          >
            Start sign-in again
          </Button>
        )}
      </section>
    </main>
  );
}
