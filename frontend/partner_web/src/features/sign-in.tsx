'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { request } from '@/lib/api';
import type { Identity } from '@/lib/types';
import { useAuth } from '@/components/auth';
import { AppLink } from '@/components/navigation';
import { Button, Field, Notice } from '@/components/ui';
interface Challenge {
  mfa_required: true;
  challenge_token: string;
  expires_in: number;
}
export function SignIn() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<
    (Challenge & { deadline: number }) | null
  >(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (active.current || (challenge && challenge.deadline <= Date.now()))
      return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    try {
      const result = await request<Identity | Challenge>(
        challenge ? '/api/session/verify' : '/api/session/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(
            challenge
              ? { challenge_token: challenge.challenge_token, code }
              : { email, password },
          ),
        },
      );
      if (controller.signal.aborted) return;
      if ('mfa_required' in result) {
        setChallenge({
          ...result,
          deadline: Date.now() + result.expires_in * 1000,
        });
        setPassword('');
        setCode('');
        setNow(Date.now());
      } else {
        setPassword('');
        setCode('');
        auth.signedIn(result);
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Sign-in failed. Please try again.',
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  const expired = Boolean(challenge && now >= challenge.deadline);
  return (
    <main className="signin-container">
      <div className="signin-heading">
        <LockKeyhole size={30} />
        <h1>
          {challenge ? 'Verify your sign-in' : 'Sign in to MedApp Partner'}
        </h1>
        <p>
          {challenge
            ? 'Enter your authenticator code or a recovery code.'
            : 'Use your MedApp account to start or continue an application.'}
        </p>
      </div>
      <form className="panel signin-form" onSubmit={submit}>
        {error && <Notice danger>{error}</Notice>}
        {challenge ? (
          <>
            <Field
              label="Authenticator or recovery code"
              name="code"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              minLength={6}
              maxLength={32}
              required
              disabled={busy || expired}
            />
            <p role="status" className={expired ? 'field-error' : 'muted'}>
              {expired
                ? 'This sign-in request has expired. Start again.'
                : `Code entry expires in ${Math.max(0, Math.ceil((challenge.deadline - now) / 1000))} seconds.`}
            </p>
          </>
        ) : (
          <>
            <Field
              label="Email address"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={255}
              required
              disabled={busy}
            />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={128}
              required
              disabled={busy}
            />
          </>
        )}
        <Button type="submit" busy={busy} disabled={expired}>
          {challenge ? 'Verify and continue' : 'Sign in'}
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
        {challenge && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setChallenge(null);
              setCode('');
              setError('');
            }}
          >
            Start again
          </Button>
        )}
      </form>
      <p className="signin-footer">
        New to the network?{' '}
        <AppLink href="/new">Choose your provider profile</AppLink>
      </p>
      <p className="muted signin-footer">
        Use the MedApp mobile app to create an account or reset your password.
      </p>
    </main>
  );
}
