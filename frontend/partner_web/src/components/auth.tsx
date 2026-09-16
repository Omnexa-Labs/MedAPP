'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  request,
  ApiError,
  applicationApi,
  type ApplicationApi,
} from '@/lib/api';
import type { Identity, User } from '@/lib/types';
interface AuthState {
  identity: Identity | null;
  pending: boolean;
  error: string;
  reload: () => Promise<void>;
  signedIn: (identity: Identity) => void;
  logout: () => Promise<void>;
}
const Auth = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const reload = useCallback(async () => {
    const revision = ++generation.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    try {
      const value = await request<Identity | { user: null }>('/api/session', {
        signal: controller.signal,
      });
      if (revision !== generation.current) return;
      setIdentity(value.user ? (value as Identity) : null);
      setError('');
    } catch (failure) {
      if (revision !== generation.current || controller.signal.aborted) return;
      setError(
        failure instanceof Error
          ? failure.message
          : 'Sign-in could not be checked.',
      );
    } finally {
      if (revision === generation.current) setPending(false);
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
    window.addEventListener('partner:session-changed', changed);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('medapp-partner-auth');
      channel.current.onmessage = changed;
    }
    return () => {
      generation.current++;
      active.current?.abort();
      channel.current?.close();
      window.removeEventListener('partner:session-changed', changed);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [reload]);
  const signedIn = useCallback((value: Identity) => {
    generation.current++;
    active.current?.abort();
    setIdentity(value);
    setPending(false);
    setError('');
    channel.current?.postMessage('changed');
  }, []);
  const logout = useCallback(async () => {
    if (!identity) return;
    generation.current++;
    active.current?.abort();
    setPending(true);
    try {
      await request('/api/session', {
        method: 'DELETE',
        headers: { 'X-Session-Scope': identity.scope },
      });
      setError('');
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'session_changed') {
        await reload();
        return;
      }
      setError('Sign-out could not be confirmed. Retry to check your session.');
    } finally {
      setPending(false);
    }
    setIdentity(null);
    channel.current?.postMessage('changed');
  }, [identity, reload]);
  return (
    <Auth.Provider
      value={{ identity, pending, error, reload, signedIn, logout }}
    >
      {children}
    </Auth.Provider>
  );
}
export function useAuth() {
  const value = useContext(Auth);
  if (!value) throw new Error('Auth provider missing');
  return value;
}
const Scoped = createContext<{
  api: ApplicationApi;
  user: User;
  scope: string;
  signal: AbortSignal;
} | null>(null);
export function AccountScope({
  identity,
  children,
}: {
  identity: Identity;
  children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 0, gcTime: 0 },
          mutations: { retry: false },
        },
      }),
  );
  const [api] = useState(() => applicationApi(identity.scope));
  const [controller, setController] = useState<AbortController | null>(null);
  useEffect(() => {
    const current = new AbortController();
    setController(current);
    return () => {
      current.abort();
      void client.cancelQueries();
      client.clear();
    };
  }, [client]);
  if (!controller || controller.signal.aborted) return null;
  return (
    <Scoped.Provider
      value={{
        api,
        user: identity.user,
        scope: identity.scope,
        signal: controller.signal,
      }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </Scoped.Provider>
  );
}
export function useAccount() {
  const value = useContext(Scoped);
  if (!value) throw new Error('Account scope missing');
  return value;
}
