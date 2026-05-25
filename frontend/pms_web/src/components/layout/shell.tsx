"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useAuthStore } from "@/lib/stores/auth.store";

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isHydrating } = useAuthStore();

  useEffect(() => {
    if (!isHydrating && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isHydrating, router]);

  if (isHydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
      </div>
    </div>
  );
}
