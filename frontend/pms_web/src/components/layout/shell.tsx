"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useAuthStore } from "@/lib/stores/auth.store";

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isHydrating, error, hydrate } = useAuthStore();

  useEffect(() => {
    if (!isHydrating && !isAuthenticated && !error) {
      router.replace("/login");
    }
  }, [isAuthenticated, isHydrating, error, router]);

  if (isHydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }
  if (error)
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold">Check pharmacy access</h1>
        <p role="alert" className="mt-4 text-red-700">
          {error}
        </p>
        <button
          className="mt-4 min-h-11 underline"
          onClick={() => void hydrate()}
        >
          Retry session check
        </button>
      </main>
    );
  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
          <details className="mb-5 rounded-lg border bg-white md:hidden">
            <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">
              Pharmacy menu
            </summary>
            <Sidebar mobile />
          </details>
          {children}
        </main>
      </div>
    </div>
  );
}
