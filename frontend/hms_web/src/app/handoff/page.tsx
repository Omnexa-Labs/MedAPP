"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SessionError,
  sessionRequest,
  useAuthStore,
} from "@/lib/stores/auth.store";

export default function HandoffPage() {
  const router = useRouter();
  const pending = useAuthStore((s) => s.isHydrating);
  const code = useRef<string | null>(null),
    active = useRef<AbortController | null>(null);
  const [details, setDetails] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const incoming = () => {
      if (window.location.hash.startsWith("#code=")) window.location.reload();
    };
    window.addEventListener("hashchange", incoming);
    return () => window.removeEventListener("hashchange", incoming);
  }, []);
  useEffect(() => {
    if (pending) return;
    const controller = new AbortController();
    if (code.current === null) {
      const fragment = window.location.hash;
      code.current = /^#code=[A-Za-z0-9_-]{32,128}$/.test(fragment)
        ? fragment.slice(6)
        : "";
      window.history.replaceState(window.history.state, "", "/handoff");
    }
    if (!code.current) {
      setError("Open a new hospital link from MedApp.");
      return;
    }
    void sessionRequest("/handoff", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ code: code.current }),
    })
      .then((value) => {
        if (!controller.signal.aborted) setDetails(value);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "The link could not be checked.",
          );
      });
    return () => {
      controller.abort();
      active.current?.abort();
    };
  }, [pending]);
  async function proceed() {
    if (!code.current || !details || pending || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    try {
      await useAuthStore
        .getState()
        .redeemHandoff(code.current, controller.signal);
      router.replace("/workspaces");
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Open a new link from MedApp.",
        );
        if (
          failure instanceof SessionError &&
          failure.code === "session_changed"
        )
          await useAuthStore.getState().hydrate();
      }
    } finally {
      active.current = null;
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <section className="mx-auto max-w-md rounded-xl border bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-slate-600">
          MedApp · Hospital portal
        </p>
        <h1 className="mt-3 text-2xl font-bold">Continue from MedApp</h1>
        <p className="mt-2 text-slate-600">
          Confirm your account, then choose a hospital where you have staff
          access.
        </p>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-md bg-red-50 p-3 text-red-700"
          >
            {error}
          </p>
        )}
        {!details && !error && (
          <p role="status" className="mt-5">
            Checking your MedApp account…
          </p>
        )}
        {details && (
          <div className="mt-6">
            <h2 className="font-semibold">{details.name}</h2>
            <p className="mt-1 text-slate-600">{details.email}</p>
            <p className="mt-4 text-sm text-slate-600">
              Continue only if this is your account. When you finish, use Return
              to MedApp to close the hospital session.
            </p>
            <button
              disabled={busy || pending}
              onClick={() => void proceed()}
              className="mt-6 w-full rounded-md bg-slate-900 p-3 font-medium text-white disabled:opacity-50"
            >
              {busy ? "Opening hospital access…" : "Continue with this account"}
            </button>
          </div>
        )}
        <Link href="/workspaces" className="mt-5 block text-sm underline">
          Manage the current website session
        </Link>
      </section>
    </main>
  );
}
