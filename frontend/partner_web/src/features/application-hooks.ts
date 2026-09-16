'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount } from '@/components/auth';
import { ApiError } from '@/lib/api';
import type { Application } from '@/lib/types';
export function useApplication(id: string) {
  const account = useAccount();
  return useQuery({
    queryKey: ['application', account.scope, id],
    queryFn: ({ signal }) => account.api.read(id, signal),
  });
}
export function useRequirements(application: Application) {
  const account = useAccount();
  return useQuery({
    queryKey: [
      'requirements',
      account.scope,
      application.application_id,
      application.partner_type,
      application.practitioner_role,
      application.onboarding_mode,
    ],
    queryFn: ({ signal }) =>
      account.api.requirements(application.application_id, signal),
  });
}
export function useApplicationAction(id?: string) {
  const account = useAccount();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mustReload, setMustReload] = useState(false);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  async function run(
    task: (signal: AbortSignal) => Promise<Application>,
  ): Promise<Application | undefined> {
    if (active.current || mustReload || account.signal.aborted) return;
    const controller = new AbortController();
    const abort = () => controller.abort();
    account.signal.addEventListener('abort', abort, { once: true });
    active.current = controller;
    setBusy(true);
    setError('');
    try {
      const application = await task(controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      client.setQueryData(
        ['application', account.scope, application.application_id],
        application,
      );
      void client.invalidateQueries({
        queryKey: ['applications', account.scope],
      });
      return application;
    } catch (failure) {
      if (!mounted.current || controller.signal.aborted) return;
      setError(
        failure instanceof Error
          ? failure.message
          : 'The change could not be saved.',
      );
      setMustReload(
        !(failure instanceof ApiError) ||
          failure.status === 0 ||
          failure.status >= 500 ||
          [409, 412].includes(failure.status),
      );
    } finally {
      account.signal.removeEventListener('abort', abort);
      if (active.current === controller) {
        active.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }
  async function reload() {
    if (!id) return;
    setBusy(true);
    try {
      const value = await account.api.read(id, account.signal);
      if (!mounted.current || account.signal.aborted) return;
      client.setQueryData(['application', account.scope, id], value);
      setMustReload(false);
      setError('');
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'The saved application could not be loaded.',
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return {
    run,
    reload,
    busy,
    error,
    mustReload,
    clearError: () => setError(''),
  };
}
