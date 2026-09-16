"use client";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useAuthStore } from "@/lib/stores/auth.store";
import { canAccessModule } from "@/lib/utils/permissions";
const modules: Record<string, string> = {
  "hospital-profile": "hospital-profile",
  dashboard: "dashboard",
  patients: "patients",
  appointments: "appointments",
  queue: "appointments",
  staff: "staff",
  departments: "staff",
  pharmacy: "pharmacy",
  prescriptions: "pharmacy",
  billing: "billing",
};
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter(),
    pathname = usePathname();
  const { isAuthenticated, isHydrating, identity, user, error } =
    useAuthStore();
  useEffect(() => {
    if (!isHydrating && !error) {
      if (!isAuthenticated) router.replace("/login");
      else if (!identity?.workspace) router.replace("/workspaces");
    }
  }, [isAuthenticated, isHydrating, identity?.workspace, error, router]);
  if (isHydrating)
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center text-slate-600"
      >
        Checking hospital access…
      </div>
    );
  if (!isAuthenticated || !identity?.workspace)
    return (
      <main className="p-8">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              onClick={() => void useAuthStore.getState().hydrate()}
              className="mt-4 underline"
            >
              Retry session check
            </button>
          </>
        ) : (
          <Link href={isAuthenticated ? "/workspaces" : "/login"}>
            Continue
          </Link>
        )}
      </main>
    );
  const allowed = canAccessModule(
    modules[pathname.split("/")[1]],
    user?.hmsRole,
  );
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-md bg-amber-50 p-3 text-sm"
            >
              {error}{" "}
              <button
                onClick={() => void useAuthStore.getState().hydrate()}
                className="underline"
              >
                Retry
              </button>
            </div>
          )}
          {allowed ? (
            children
          ) : (
            <section className="rounded-xl border bg-white p-6">
              <h1 className="text-xl font-semibold">
                This page is unavailable for your staff role
              </h1>
              <p className="mt-2 text-slate-600">
                Choose an available section or contact your hospital
                administrator.
              </p>
              <Link href="/workspaces" className="mt-4 inline-block underline">
                Choose another workspace
              </Link>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
