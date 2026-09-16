"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth.store";
export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isHydrating, identity, error } = useAuthStore();
  useEffect(() => {
    if (!isHydrating && !error)
      router.replace(
        isAuthenticated
          ? identity?.workspace
            ? "/dashboard"
            : "/workspaces"
          : "/login",
      );
  }, [isAuthenticated, isHydrating, identity?.workspace, error, router]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button
            onClick={() => void useAuthStore.getState().hydrate()}
            className="underline"
          >
            Retry
          </button>
          <Link href="/login">Back to sign-in</Link>
        </>
      ) : (
        <p role="status">Loading your hospital portal…</p>
      )}
    </main>
  );
}
