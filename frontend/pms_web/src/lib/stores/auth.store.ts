import { create } from "zustand";
import { pmsRoles, type Identity, type Challenge } from "@/lib/session-types";

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
  role: Identity["user"]["role"];
}
interface AuthState {
  returnUrl: string | null;
  identity: Identity | null;
  user: AuthUser | null;
  scope: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  invalidate: () => Promise<void>;
  login: (
    email: string,
    password: string,
    mode?: "medapp" | "local",
  ) => Promise<Challenge | null>;
  verify: (code: string, scope: string) => Promise<void>;
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
      "The pharmacy portal could not be reached. Please try again.",
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new SessionError(
      "The pharmacy portal returned an unreadable response.",
    );
  }
  if (!response.ok)
    throw new SessionError(
      typeof body?.detail === "string"
        ? body.detail
        : "The request could not be completed.",
      response.status,
      body?.code,
    );
  return body;
}
function broadcast() {
  if (
    typeof window !== "undefined" &&
    typeof BroadcastChannel !== "undefined"
  ) {
    const channel = new BroadcastChannel("medapp-pms-session");
    channel.postMessage("changed");
    channel.close();
  }
}
function publicIdentity(value: unknown): Identity {
  const v = value as Identity;
  if (
    !v?.user?.id ||
    typeof v.user.email !== "string" ||
    typeof v.user.full_name !== "string" ||
    !pmsRoles.includes(v.user.role) ||
    typeof v.scope !== "string" ||
    !/^[a-f0-9]{32}$/.test(v.scope) ||
    !v.pharmacy ||
    typeof v.pharmacy.name !== "string" ||
    !["medapp", "local"].includes(v.mode)
  )
    throw new SessionError("Pharmacy access could not be loaded.");
  // Keep only the public identity even if an upstream response contains extra fields.
  return {
    ...(v.returnAvailable === true ? { returnAvailable: true } : {}),
    scope: v.scope,
    mode: v.mode,
    user: {
      id: v.user.id,
      email: v.user.email,
      full_name: v.user.full_name,
      role: v.user.role,
    },
    pharmacy: {
      id: v.pharmacy.id,
      name: v.pharmacy.name,
      deployment_key: v.pharmacy.deployment_key,
    },
  };
}
function apply(identity: Identity | null, notify = false) {
  const changed = useAuthStore.getState().scope !== (identity?.scope || null);
  generation++;
  const user = identity?.user;
  useAuthStore.setState({
    identity,
    ...(identity ? { returnUrl: null } : {}),
    scope: identity?.scope || null,
    user: user
      ? {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
        }
      : null,
    isAuthenticated: !!user,
    isHydrating: false,
    error: null,
  });
  if (changed && notify) broadcast();
}
function finishAction() {
  actions--;
  if (!actions && hydrationQueued) {
    hydrationQueued = false;
    void useAuthStore.getState().hydrate();
  }
}
function unchanged(current: number) {
  if (current !== generation)
    throw new SessionError(
      "Your session changed. Reload to continue.",
      409,
      "session_changed",
    );
}
export const useAuthStore = create<AuthState>((set, get) => ({
  returnUrl: null,
  identity: null,
  user: null,
  scope: null,
  isAuthenticated: false,
  isHydrating: true,
  error: null,
  hydrate: async () => {
    if (actions) {
      hydrationQueued = true;
      return;
    }
    if (hydration?.generation === generation) return hydration.promise;
    try {
      for (const key of ["pms_token", "pms_user"]) localStorage.removeItem(key);
    } catch {
      /* Storage may be disabled. */
    }
    const current = generation;
    const promise = (async () => {
      try {
        const value = await request("");
        if (current === generation)
          apply(value.user ? publicIdentity(value) : null);
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
  login: async (email, password, mode = "medapp") => {
    const current = ++generation;
    actions++;
    try {
      const result = await request("/login", {
        method: "POST",
        body: JSON.stringify({ email, password, mode }),
      });
      unchanged(current);
      if (result.mfa_required === true) {
        if (
          !/^[a-f0-9]{32}$/.test(result.scope) ||
          !Number.isFinite(result.expires_in) ||
          result.expires_in < 1 ||
          result.expires_in > 600
        )
          throw new SessionError("Restart sign-in.");
        return {
          mfa_required: true,
          scope: result.scope,
          expires_in: result.expires_in,
        };
      }
      apply(publicIdentity(result), true);
      return null;
    } catch (error) {
      if (
        current === generation &&
        error instanceof SessionError &&
        error.code === "session_changed"
      )
        hydrationQueued = true;
      throw error;
    } finally {
      finishAction();
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
      unchanged(current);
      apply(publicIdentity(result), true);
    } catch (error) {
      if (
        current === generation &&
        error instanceof SessionError &&
        error.code === "session_changed"
      )
        hydrationQueued = true;
      throw error;
    } finally {
      finishAction();
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
      if (current === generation) {
        // Recheck uncertain logout; never report it as completed without a server read.
        apply(null, true);
        set({ isHydrating: true });
        hydrationQueued = true;
      }
      throw error;
    } finally {
      finishAction();
    }
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
      unchanged(current);
      if (signal?.aborted)
        throw new SessionError("Opening the pharmacy was cancelled.");
      apply(publicIdentity(result), true);
      set({ returnUrl: null });
    } finally {
      finishAction();
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
      unchanged(current);
      if (typeof result.url !== "string")
        throw new SessionError("The MedApp return could not be prepared.");
      apply(null, true);
      set({ returnUrl: result.url });
      return result.url;
    } finally {
      finishAction();
    }
  },
}));
export { request as sessionRequest };
