"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth.store";
export function Topbar() {
  const { user, identity, signOut } = useAuthStore();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const handleSignOut = async () => {
    setBusy(true);
    setError("");
    try {
      await signOut();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Sign-out could not be confirmed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-2">
      <div>
        <p className="font-semibold text-slate-900">
          {identity?.pharmacy.name}
        </p>
        <p className="text-xs text-slate-500">
          {user?.role.replaceAll("_", " ")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {identity?.returnAvailable && (
          <Link
            href="/return"
            className="min-h-11 inline-flex items-center text-sm underline"
          >
            Return to MedApp
          </Link>
        )}
        <span className="text-sm text-slate-600">
          {user?.fullName || user?.email}
        </span>
        <button
          disabled={busy}
          onClick={handleSignOut}
          className="min-h-11 rounded-md px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
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
