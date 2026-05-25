"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth.store";

export function Topbar() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();

  const handleSignOut = () => {
    signOut();
    router.replace("/login");
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-600">{user?.email}</span>
        <button
          onClick={handleSignOut}
          className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
