import { create } from "zustand";
import type { Identity } from "@/lib/session-types";
import { useTenantConfigStore } from "./tenant-config.store";
export class SessionError extends Error {
  constructor(
    message: string,
    public status = 503,
    public code?: string,
  ) {
    super(message);
  }
}
interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  hospitalId: string;
  hospitalName: string;
  hmsRole: string;
}
interface Challenge {
  mfa_required: true;
  scope: string;
  expires_in: number;
}
interface AuthState {
  identity: Identity | null;
  user: AuthUser | null;
  scope: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  error: string | null;
  returnUrl: string | null;
  hydrate: () => Promise<void>;
  invalidate: () => Promise<void>;
  login: (email: string, password: string) => Promise<Challenge | null>;
  verify: (code: string, scope: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
  redeemHandoff: (code: string, signal?: AbortSignal) => Promise<void>;
  returnToApp: () => Promise<string>;
}
let generation = 0,
  actions = 0;
let hydrationQueued = false;
let hydration: { generation: number; promise: Promise<void> } | undefined;
async function request(path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch("/api/session" + path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...Object.fromEntries(new Headers(init.headers)),
      },
    });
  } catch {
    throw new SessionError(
      "The hospital portal could not be reached. Please try again.",
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new SessionError(
      "The hospital portal returned an unreadable response.",
    );
  }
  if (!response.ok)
    throw new SessionError(
      typeof body.detail === "string"
        ? body.detail
        : "The request could not be completed.",
      response.status,
      body.code,
    );
  return body;
}
function broadcast() {
  if (
    typeof window !== "undefined" &&
    typeof BroadcastChannel !== "undefined"
  ) {
    const channel = new BroadcastChannel("medapp-hms-session");
    channel.postMessage("changed");
    channel.close();
  }
}
function clearLegacy() {
  try {
    for (const key of ["hms_token", "hms_user", "hms_tenant_config"])
      localStorage.removeItem(key);
  } catch {
    /* Storage may be disabled. */
  }
}
function publicIdentity(value: unknown): Identity {
  const identity = value as Identity;
  if (
    !identity?.user?.id ||
    typeof identity.scope !== "string" ||
    !/^[a-f0-9]{32}$/.test(identity.scope) ||
    !Array.isArray(identity.workspaces)
  )
    throw new SessionError("Hospital access could not be loaded.");
  return identity;
}
function apply(identity: Identity | null, notify = false) {
  const changed = useAuthStore.getState().scope !== (identity?.scope || null);
  generation++;
  if (changed) useTenantConfigStore.getState().reset();
  const account = identity?.user,
    workspace = identity?.workspace;
  useAuthStore.setState({
    identity,
    scope: identity?.scope || null,
    user: account
      ? {
          id: account.id,
          email: account.email,
          fullName: (account.first_name + " " + account.last_name).trim(),
          role: account.role,
          hospitalId: workspace?.hospital_id || "",
          hospitalName: workspace?.hospital_name || "",
          hmsRole: workspace?.hms_role || "",
        }
      : null,
    isAuthenticated: !!account,
    isHydrating: false,
    error: null,
    ...(identity ? { returnUrl: null } : {}),
  });
  if (changed && notify) broadcast();
}
export const useAuthStore = create<AuthState>((set, get) => ({
  identity: null,
  user: null,
  scope: null,
  isAuthenticated: false,
  isHydrating: true,
  error: null,
  returnUrl: null,
  hydrate: async () => {
    if (actions) {
      hydrationQueued = true;
      return;
    }
    if (hydration?.generation === generation) return hydration.promise;
    clearLegacy();
    const current = generation;
    const promise = (async () => {
      try {
        const result = await request("");
        if (current === generation)
          apply(result.user ? publicIdentity(result) : null);
      } catch (error) {
        if (current === generation)
          set({
            isHydrating: false,
            error:
              error instanceof Error
                ? error.message
                : "Session could not be loaded.",
          });
      } finally {
        if (hydration?.generation === current) hydration = undefined;
      }
    })();
    hydration = { generation: current, promise };
    return promise;
  },
  invalidate: async () => {
    apply(null);
    set({ isHydrating: true });
    await get().hydrate();
  },
  redeemHandoff: async (code, signal) => {
    const current = ++generation;
    actions++;
    try {
      const result = await request("/handoff/redeem", {
        method: "POST",
        signal,
        headers: { "X-Session-Scope": get().scope || "" },
        body: JSON.stringify({ code }),
      });
      if (signal?.aborted || current !== generation)
        throw new SessionError(
          "Sign-in changed. Reload to continue.",
          409,
          "session_changed",
        );
      apply(publicIdentity(result), true);
    } finally {
      actions--;
      if (!actions && hydrationQueued) {
        hydrationQueued = false;
        void get().hydrate();
      }
    }
  },
  returnToApp: async () => {
    const current = ++generation;
    actions++;
    try {
      const result = await request("/return", {
        method: "POST",
        headers: { "X-Session-Scope": get().scope || "" },
      });
      if (current !== generation)
        throw new SessionError(
          "Your session changed. Reload to continue.",
          409,
          "session_changed",
        );
      if (typeof result.url !== "string")
        throw new SessionError("The MedApp return could not be prepared.");
      apply(null, true);
      set({ returnUrl: result.url });
      return result.url;
    } finally {
      actions--;
      if (!actions && hydrationQueued) {
        hydrationQueued = false;
        void get().hydrate();
      }
    }
  },
  login: async (email, password) => {
    const current = ++generation;
    actions++;
    try {
      const result = await request("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (current !== generation)
        throw new SessionError(
          "Sign-in changed. Reload to continue.",
          409,
          "session_changed",
        );
      if (result.mfa_required === true) return result as Challenge;
      apply(publicIdentity(result), true);
      return null;
    } finally {
      actions--;
      if (!actions && hydrationQueued) {
        hydrationQueued = false;
        void get().hydrate();
      }
    }
  },
  verify: async (code, scope) => {
    const current = ++generation;
    actions++;
    try {
      const result = await request("/verify", {
        method: "POST",
        body: JSON.stringify({ code, scope }),
      });
      if (current !== generation)
        throw new SessionError(
          "Sign-in changed. Reload to continue.",
          409,
          "session_changed",
        );
      apply(publicIdentity(result), true);
    } finally {
      actions--;
      if (!actions && hydrationQueued) {
        hydrationQueued = false;
        void get().hydrate();
      }
    }
  },
  selectWorkspace: async (id) => {
    const scope = get().scope,
      current = ++generation;
    actions++;
    try {
      const result = await request("/workspace", {
        method: "POST",
        headers: { "X-Session-Scope": scope || "" },
        body: JSON.stringify({ hospital_id: id }),
      });
      if (current !== generation)
        throw new SessionError(
          "Your session changed. Reload to continue.",
          409,
          "session_changed",
        );
      apply(publicIdentity(result), true);
    } catch (error) {
      if (error instanceof SessionError && [401, 409].includes(error.status)) {
        actions--;
        try {
          await get().invalidate();
        } finally {
          actions++;
        }
      }
      throw error;
    } finally {
      actions--;
      if (!actions && hydrationQueued) {
        hydrationQueued = false;
        void get().hydrate();
      }
    }
  },
  signOut: async () => {
    const scope = get().scope,
      current = ++generation;
    actions++;
    try {
      await request("", {
        method: "DELETE",
        headers: { "X-Session-Scope": scope || "" },
      });
      if (current === generation) apply(null, true);
    } catch (error) {
      if (error instanceof SessionError && error.status === 409) {
        actions--;
        try {
          await get().invalidate();
        } finally {
          actions++;
        }
      } else if (
        current === generation &&
        error instanceof SessionError &&
        error.status === 401
      )
        apply(null, true);
      throw error;
    } finally {
      actions--;
      if (!actions && hydrationQueued) {
        hydrationQueued = false;
        void get().hydrate();
      }
    }
  },
}));
export { request as sessionRequest };
