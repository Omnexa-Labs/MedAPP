"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";
export default function ReturnPage() {
  const { identity, isHydrating, returnUrl } = useAuthStore();
  const active = useRef(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function close() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      window.location.assign(await useAuthStore.getState().returnToApp());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The session could not be closed.",
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <section className="mx-auto max-w-md rounded-xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Return to MedApp</h1>
        {error && (
          <p role="alert" className="mt-4 text-red-700">
            {error}
          </p>
        )}
        {returnUrl ? (
          <>
            <p className="mt-4">
              Your pharmacy session is closed. Open MedApp to continue.
            </p>
            <a className="mt-5 block underline" href={returnUrl}>
              Open MedApp
            </a>
          </>
        ) : (
          <>
            <p className="mt-4 text-slate-600">
              Close this pharmacy website session and return to the app. Your
              saved work stays available.
            </p>
            {identity?.returnAvailable ? (
              <button
                disabled={busy || isHydrating}
                onClick={() => void close()}
                className="mt-5 w-full rounded-md bg-slate-900 p-3 font-medium text-white disabled:opacity-50"
              >
                {busy ? "Closing session…" : "Close session and return"}
              </button>
            ) : (
              <p className="mt-5">
                This session was not opened from MedApp or has ended. You can
                close this browser and reopen the app.
              </p>
            )}
            <Link href="/dashboard" className="mt-5 block text-sm underline">
              Back to pharmacy access
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
