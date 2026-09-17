import { useEffect } from "react";
import { AppState } from "react-native";
import { router, type Href } from "expo-router";
import { listenForReminders } from "./push-platform";
import { useAuthStore } from "@/store/auth-store";
import { renewReminderDevice, revokeReminderDevice, type ReminderSession } from "./reminder-device";

/** Renews only an installation explicitly opted in earlier; never prompts on launch. */
export function ReminderDeviceBridge() {
  useEffect(() => {
    let session: ReminderSession | null = null;
    let identity = "";
    const update = () => {
      const auth = useAuthStore.getState();
      const next =
        auth.isAuthenticated && auth.user && auth.token ? `${auth.user.id}:${auth.revision}` : "";
      if (next !== identity) {
        if (session) void revokeReminderDevice(session).catch(() => {});
        identity = next;
        session = null;
      }
      if (next && auth.user && auth.token) {
        const owner = auth.user.id,
          revision = auth.revision;
        session = {
          owner,
          token: auth.token,
          current: () => {
            const active = useAuthStore.getState();
            return (
              active.isAuthenticated && active.user?.id === owner && active.revision === revision
            );
          },
        };
      }
    };
    update();
    if (session) void renewReminderDevice(session).catch(() => {});
    const unsubscribe = useAuthStore.subscribe(() => {
      const previous = identity;
      update();
      if (identity !== previous && session) void renewReminderDevice(session).catch(() => {});
    });
    const foreground = AppState.addEventListener("change", (state) => {
      update();
      if (state === "active" && session) void renewReminderDevice(session).catch(() => {});
    });
    const stopReminders = listenForReminders(
      () => router.push("/(app)/medication-tracker" as Href),
      () => {
        update();
        if (session) void renewReminderDevice(session).catch(() => {});
      },
      () => useAuthStore.getState().isAuthenticated,
    );
    return () => {
      unsubscribe();
      foreground.remove();
      stopReminders();
    };
  }, []);
  return null;
}
