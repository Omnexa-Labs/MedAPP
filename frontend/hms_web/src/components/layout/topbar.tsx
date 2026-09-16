"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth.store";
export function Topbar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const returnAvailable = useAuthStore((s) => s.identity?.returnAvailable);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await useAuthStore.getState().signOut();
      router.replace("/login");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sign-out failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-3">
      <div>
        <p className="font-semibold text-slate-800">{user?.hospitalName}</p>
        <Link href="/workspaces" className="text-xs underline">
          Switch hospital
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {returnAvailable && (
          <Link href="/return" className="text-sm underline">
            Return to MedApp
          </Link>
        )}
        <span className="text-sm text-slate-600">{user?.email}</span>
        <button
          disabled={busy}
          onClick={() => void signOut()}
          className="rounded-md px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
      {error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      )}
    </header>
  );
}
