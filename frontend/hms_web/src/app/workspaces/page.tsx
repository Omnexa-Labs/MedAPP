"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth.store";
import { JoinInvitation } from "@/components/staff/join-invitation";
export default function WorkspacesPage() {
  const router = useRouter();
  const {
    identity,
    isHydrating,
    isAuthenticated,
    error: sessionError,
  } = useAuthStore();
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void useAuthStore.getState().hydrate();
  }, []);
  useEffect(() => {
    if (!isHydrating && !isAuthenticated && !sessionError)
      router.replace("/login");
  }, [isHydrating, isAuthenticated, sessionError, router]);
  async function select(id: string) {
    setBusy(id);
    setError("");
    try {
      await useAuthStore.getState().selectWorkspace(id);
      router.replace("/dashboard");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The workspace could not be opened.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <section className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold text-slate-600">
          MedApp · Hospital portal
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">
          Choose your hospital
        </h1>
        <p className="mt-2 text-slate-600">
          {identity?.user.email ? `Signed in as ${identity.user.email}. ` : ""}
          Your staff access determines the workspaces available here.
        </p>
        {(error || sessionError) && (
          <p
            role="alert"
            className="mt-6 rounded-md bg-red-50 p-4 text-red-700"
          >
            {error || sessionError}
          </p>
        )}
        {isHydrating ? (
          <p role="status" className="mt-8">
            Loading your workspaces…
          </p>
        ) : identity && identity.workspaces.length ? (
          <ul className="mt-8 space-y-3">
            {identity.workspaces.map((workspace) => (
              <li key={workspace.hospital_id}>
                <button
                  disabled={!!busy}
                  onClick={() => void select(workspace.hospital_id)}
                  className="w-full rounded-xl border bg-white p-5 text-left shadow-sm hover:border-slate-500 disabled:opacity-50"
                >
                  <span className="block text-lg font-semibold">
                    {workspace.hospital_name}
                  </span>
                  <span className="mt-1 block text-sm capitalize text-slate-600">
                    {workspace.hms_role.replaceAll("_", " ")}
                  </span>
                  <span className="mt-3 block text-sm font-medium">
                    {busy === workspace.hospital_id
                      ? "Opening workspace…"
                      : "Open workspace →"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : identity ? (
          <div className="mt-8 rounded-xl border bg-white p-6">
            <h2 className="font-semibold">No hospital workspaces yet</h2>
            <p className="mt-2 text-sm text-slate-600">
              Hospital owners and staff can access a workspace once setup and
              their membership are active. Contact your hospital administrator
              if you expected access.
            </p>
          </div>
        ) : null}
        {identity && !isHydrating && <JoinInvitation />}
        <div className="mt-6 flex flex-wrap gap-5 text-sm">
          {identity?.returnAvailable && (
            <Link href="/return" className="underline">
              Return to MedApp
            </Link>
          )}
          <button
            disabled={!!busy || isHydrating}
            onClick={() => void useAuthStore.getState().hydrate()}
            className="underline"
          >
            Refresh access
          </button>
          {identity?.workspace && (
            <Link href="/dashboard" className="underline">
              Back to {identity.workspace.hospital_name}
            </Link>
          )}
          {identity ? (
            <button
              disabled={!!busy}
              onClick={async () => {
                setBusy("signout");
                try {
                  await useAuthStore.getState().signOut();
                  router.replace("/login");
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "Sign-out failed.",
                  );
                } finally {
                  setBusy(null);
                }
              }}
              className="underline"
            >
              Sign out
            </button>
          ) : (
            <Link href="/login" className="underline">
              Back to sign-in
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
