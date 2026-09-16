"use client";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { makeQueryClient } from "@/lib/query-client";
import { useAuthStore } from "@/lib/stores/auth.store";
function ScopedQueries({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeQueryClient);
  useEffect(
    () => () => {
      void client.cancelQueries();
      client.clear();
    },
    [client],
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
export function Providers({ children }: { children: React.ReactNode }) {
  const scope = useAuthStore((s) => s.scope);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden")
        void useAuthStore.getState().hydrate();
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("medapp-hms-session")
        : null;
    if (channel)
      channel.onmessage = () => {
        void useAuthStore.getState().invalidate();
      };
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      channel?.close();
    };
  }, []);
  return <ScopedQueries key={scope || "anonymous"}>{children}</ScopedQueries>;
}
