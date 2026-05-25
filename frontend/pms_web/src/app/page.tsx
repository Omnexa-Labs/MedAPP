"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth.store";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isHydrating } = useAuthStore();

  useEffect(() => {
    if (isHydrating) return;
    router.replace(isAuthenticated ? "/dashboard" : "/login");
  }, [isAuthenticated, isHydrating, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse text-lg text-slate-500">Loading...</div>
    </div>
  );
}
