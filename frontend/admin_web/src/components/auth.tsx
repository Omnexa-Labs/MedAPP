'use client';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Identity } from '@/lib/types';
import { adminApi, request, type AdminApi } from '@/lib/api';
import { SignIn } from '@/features/sign-in';
import { Button, Loading, Notice } from './ui';
const Account = createContext<{ identity: Identity; api: AdminApi } | null>(
  null,
);
export function useAccount() {
  const value = useContext(Account);
  if (!value) throw new Error('Administrator session required');
  return value;
}
function AccountScope({
  identity,
  children,
}: {
  identity: Identity;
  children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
      }),
  );
  const api = useMemo(() => adminApi(identity.scope), [identity.scope]);
  useEffect(
    () => () => {
      void client.cancelQueries();
      client.clear();
    },
    [client],
  );
  return (
    <Account.Provider value={{ identity, api }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </Account.Provider>
  );
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const reload = useCallback(async () => {
    const version = ++revision.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    try {
      const result = await request<Identity | { user: null }>('/api/session', {
        signal: controller.signal,
      });
      if (version !== revision.current) return;
      setIdentity(result.user ? (result as Identity) : null);
      setError('');
    } catch (failure) {
      if (version === revision.current && !controller.signal.aborted) {
        setIdentity(null);
        setError(
          failure instanceof Error
            ? failure.message
            : 'Sign-in could not be checked.',
        );
      }
    } finally {
      if (version === revision.current) setPending(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    const changed = () => {
      setIdentity(null);
      setPending(true);
      void reload();
    };
    const focus = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    window.addEventListener('admin:session-changed', changed);
    window.addEventListener('focus', focus);
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('medapp-admin-auth');
      channel.current.onmessage = changed;
    }
    return () => {
      revision.current++;
      active.current?.abort();
      channel.current?.close();
      window.removeEventListener('admin:session-changed', changed);
      window.removeEventListener('focus', focus);
    };
  }, [reload]);
  function signedIn(value: Identity) {
    revision.current++;
    active.current?.abort();
    setIdentity(value);
    setError('');
    setPending(false);
    channel.current?.postMessage('changed');
  }
  async function logout() {
    if (!identity) return;
    setPending(true);
    const version = ++revision.current;
    active.current?.abort();
    try {
      await request('/api/session', {
        method: 'DELETE',
        headers: { 'X-Session-Scope': identity.scope },
      });
      if (version !== revision.current) return;
      setIdentity(null);
      setError('');
      channel.current?.postMessage('changed');
    } catch (failure) {
      if (version !== revision.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : 'Sign-out could not be confirmed.',
      );
      await reload();
    } finally {
      if (version === revision.current) setPending(false);
    }
  }
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="MedApp Admin home">
          <span className="brand-mark">
            <Plus size={30} strokeWidth={4} aria-hidden="true" />
          </span>
          <strong>MedApp</strong>
          <span className="brand-section">Admin</span>
        </Link>
        {identity && (
          <div className="header-account">
            <span>
              {identity.user.first_name} {identity.user.last_name}
            </span>
            <Button
              variant="ghost"
              busy={pending}
              onClick={() => void logout()}
            >
              Sign out
            </Button>
          </div>
        )}
      </header>
      {pending ? (
        <Loading>Checking administrator access…</Loading>
      ) : error ? (
        <main className="signin">
          <Notice error>{error}</Notice>
          <Button onClick={() => void reload()}>Check sign-in again</Button>
        </main>
      ) : identity ? (
        <AccountScope key={identity.scope} identity={identity}>
          {children}
        </AccountScope>
      ) : (
        <SignIn onSuccess={signedIn} />
      )}
    </>
  );
}
