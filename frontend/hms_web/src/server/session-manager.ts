import { randomBytes } from "node:crypto";
import {
  hmsRoles,
  type Identity,
  type WebUser,
  type Workspace,
} from "@/lib/session-types";
import { HttpError, responseError } from "./errors";
import type { SessionRecord, SessionStore, Tokens } from "./session-types";

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const newScope = () => randomBytes(16).toString("hex");
export function parseTokens(value: unknown): Tokens {
  const v = value as Partial<Tokens> | null;
  if (
    !v ||
    typeof v.access_token !== "string" ||
    typeof v.refresh_token !== "string" ||
    v.access_token.length < 10 ||
    v.refresh_token.length < 10 ||
    v.access_token.length > 8192 ||
    v.refresh_token.length > 8192 ||
    typeof v.expires_in !== "number" ||
    !Number.isFinite(v.expires_in) ||
    v.expires_in < 1 ||
    v.expires_in > 86400
  )
    throw new HttpError(
      502,
      "Sign-in returned an invalid session. Please try again.",
    );
  return {
    access_token: v.access_token,
    refresh_token: v.refresh_token,
    expires_in: v.expires_in,
  };
}
export function parseUser(value: unknown): WebUser {
  const v = value as Record<string, unknown> | null;
  if (
    !v ||
    typeof v.id !== "string" ||
    !uuid.test(v.id) ||
    typeof v.email !== "string" ||
    typeof v.first_name !== "string" ||
    typeof v.last_name !== "string" ||
    typeof v.role !== "string"
  )
    throw new HttpError(502, "Your account details could not be loaded.");
  if (v.is_active !== true)
    throw new HttpError(401, "This account is unavailable. Sign in again.");
  return {
    id: v.id,
    email: v.email,
    first_name: v.first_name,
    last_name: v.last_name,
    role: v.role,
  };
}
export function parseWorkspace(value: unknown): Workspace {
  const v = value as Partial<Workspace> | null;
  if (
    !v ||
    typeof v.hospital_id !== "string" ||
    !uuid.test(v.hospital_id) ||
    typeof v.hospital_name !== "string" ||
    !v.hospital_name.trim() ||
    !hmsRoles.includes(v.hms_role!)
  )
    throw new HttpError(502, "Hospital access could not be confirmed.");
  return {
    hospital_id: v.hospital_id,
    hospital_name: v.hospital_name,
    hms_role: v.hms_role!,
  };
}
export function checkScope(
  session: SessionRecord,
  scope: string | null | undefined,
) {
  if (session.scope !== scope)
    throw new HttpError(
      409,
      "Your hospital or signed-in account changed. Reload to continue.",
      "session_changed",
    );
}
export class SessionManager {
  constructor(
    private store: SessionStore,
    private api: ApiFetch,
    private now = Date.now,
    private pause = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}

  async begin(tokens: Tokens, deviceId: string, returnUrl?: string) {
    try {
      if (!/^[a-f0-9]{64}$/.test(deviceId))
        throw new HttpError(400, "Restart sign-in.");
      const response = await this.api("/v1/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!response.ok) throw await responseError(response);
      const session: SessionRecord = {
        tokens,
        user: parseUser(await response.json()),
        deviceId,
        ...(returnUrl ? { returnUrl } : {}),
        scope: newScope(),
        revision: 0,
        accessExpiresAt: this.now() + tokens.expires_in * 1000,
        expiresAt: this.now() + 8 * 3600000,
        workspace: null,
      };
      const id = randomBytes(32).toString("hex");
      await this.store.create(id, session);
      return { id, identity: this.publicIdentity(session, []) };
    } catch (error) {
      await this.revoke(tokens.refresh_token, deviceId).catch(() => {});
      throw error;
    }
  }
  async get(id: string) {
    const session = await this.store.get(id);
    if (!session || session.expiresAt <= this.now())
      throw new HttpError(401, "Your session has expired. Sign in again.");
    return session;
  }
  private async locked<T>(
    id: string,
    scope: string | undefined,
    action: (session: SessionRecord, owner: string) => Promise<T>,
  ) {
    const owner = randomBytes(16).toString("hex");
    for (let attempt = 0; attempt < 120; attempt++) {
      await this.get(id);
      if (await this.store.lock(id, owner)) {
        try {
          const session = await this.get(id);
          if (scope !== undefined) checkScope(session, scope);
          return await action(session, owner);
        } finally {
          // The lease expires independently; cleanup failure must not hide a
          // committed session or a useful upstream error from the browser.
          await this.store.unlock(id, owner).catch(() => {});
        }
      }
      await this.pause(100);
    }
    throw new HttpError(503, "Your session is busy. Please try again.");
  }
  private async save(
    id: string,
    owner: string,
    current: SessionRecord,
    next: SessionRecord,
  ) {
    const updated = { ...next, revision: current.revision + 1 };
    if (!(await this.store.commit(id, owner, current.revision, updated)))
      throw new HttpError(
        409,
        "Your session changed. Reload before continuing.",
        "session_changed",
      );
    return updated;
  }
  private async platform(id: string, owner: string, session: SessionRecord) {
    if (session.accessExpiresAt > this.now() + 30000) return session;
    let tokens: Tokens | undefined;
    try {
      const response = await this.api("/v1/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": session.deviceId,
        },
        body: JSON.stringify({ refresh_token: session.tokens.refresh_token }),
      });
      if (!response.ok) throw await responseError(response);
      tokens = parseTokens(await response.json());
      // Persist rotation before further upstream work can fail. A missing session
      // or lost lock cannot be recreated by a delayed refresh response.
      return await this.save(id, owner, session, {
        ...session,
        tokens,
        accessExpiresAt: this.now() + tokens.expires_in * 1000,
      });
    } catch {
      await this.store.remove(id).catch(() => {});
      await this.revoke(
        tokens?.refresh_token || session.tokens.refresh_token,
        session.deviceId,
      ).catch(() => {});
      throw new HttpError(
        401,
        "Your session could not be renewed. Sign in again.",
      );
    }
  }
  private platformRequest(
    session: SessionRecord,
    path: string,
    init: RequestInit = {},
  ) {
    return this.api(path, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        Authorization: `Bearer ${session.tokens.access_token}`,
        "X-Device-Id": session.deviceId,
      },
    });
  }
  private publicIdentity(
    session: SessionRecord,
    workspaces: Workspace[],
  ): Identity {
    return {
      user: session.user,
      scope: session.scope,
      workspace: session.workspace?.value || null,
      workspaces,
      ...(session.returnUrl ? { returnAvailable: true } : {}),
    };
  }
  async identity(id: string): Promise<Identity> {
    try {
      return await this.locked(id, undefined, async (before, owner) => {
        const session = await this.platform(id, owner, before);
        const [profile, access] = await Promise.all([
          this.platformRequest(session, "/v1/me"),
          this.platformRequest(session, "/v1/hms/auth/workspaces"),
        ]);
        if (!profile.ok) throw await responseError(profile);
        if (!access.ok) throw await responseError(access);
        const user = parseUser(await profile.json());
        if (user.id !== session.user.id)
          throw new HttpError(401, "Your account changed. Sign in again.");
        const rows: unknown = await access.json();
        if (!Array.isArray(rows))
          throw new HttpError(502, "Hospital access could not be loaded.");
        const workspaces = rows.map(parseWorkspace);
        const selected = workspaces.find(
          (item) => item.hospital_id === session.workspace?.value.hospital_id,
        );
        const changed =
          !!session.workspace &&
          (!selected || selected.hms_role !== session.workspace.value.hms_role);
        const saved = await this.save(id, owner, session, {
          ...session,
          user,
          workspace:
            selected && session.workspace
              ? { ...session.workspace, value: selected }
              : null,
          scope: changed ? newScope() : session.scope,
        });
        return this.publicIdentity(saved, workspaces);
      });
    } catch (error) {
      if (error instanceof HttpError && [401, 403].includes(error.status)) {
        await this.logout(id).catch(() => {});
        throw new HttpError(401, "Account access changed. Sign in again.");
      }
      throw error;
    }
  }
  private async exchange(session: SessionRecord, hospitalId: string) {
    const response = await this.platformRequest(
      session,
      "/v1/hms/auth/workspace-session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospital_id: hospitalId }),
      },
    );
    if (!response.ok) throw await responseError(response);
    const result = await response.json();
    const value = parseWorkspace(result.workspace);
    const expiresAt =
      typeof result.expires_at === "string"
        ? Date.parse(result.expires_at)
        : NaN;
    if (
      result.user_id !== session.user.id ||
      value.hospital_id !== hospitalId ||
      result.token_type !== "bearer" ||
      typeof result.access_token !== "string" ||
      result.access_token.length < 10 ||
      result.access_token.length > 8192 ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= this.now() ||
      expiresAt > this.now() + 305000 ||
      expiresAt > session.accessExpiresAt + 5000
    )
      throw new HttpError(502, "Hospital access could not be confirmed.");
    return { token: result.access_token, expiresAt, value };
  }
  async select(id: string, scope: string, hospitalId: string) {
    if (!uuid.test(hospitalId))
      throw new HttpError(400, "Choose a hospital workspace.");
    try {
      return await this.locked(id, scope, async (before, owner) => {
        const session = await this.platform(id, owner, before);
        const workspace = await this.exchange(session, hospitalId);
        const saved = await this.save(id, owner, session, {
          ...session,
          workspace,
          scope: newScope(),
        });
        return this.publicIdentity(saved, []);
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401)
        await this.logout(id).catch(() => {});
      throw error;
    }
  }
  private async readyWorkspace(id: string, scope: string) {
    let session = await this.get(id);
    checkScope(session, scope);
    if (!session.workspace)
      throw new HttpError(
        409,
        "Choose a hospital workspace to continue.",
        "workspace_required",
      );
    if (session.workspace.expiresAt <= this.now() + 30000) {
      session = await this.locked(id, scope, async (before, owner) => {
        const current = await this.platform(id, owner, before);
        if (!current.workspace)
          throw new HttpError(
            409,
            "Choose a hospital workspace.",
            "workspace_required",
          );
        if (current.workspace.expiresAt > this.now() + 30000) return current;
        let workspace: SessionRecord["workspace"];
        try {
          workspace = await this.exchange(
            current,
            current.workspace.value.hospital_id,
          );
        } catch (error) {
          if (error instanceof HttpError && error.status === 401)
            await this.logout(id).catch(() => {});
          if (error instanceof HttpError && [403, 404].includes(error.status)) {
            await this.save(id, owner, current, {
              ...current,
              workspace: null,
              scope: newScope(),
            });
            throw new HttpError(
              409,
              "Hospital access changed. Choose an available workspace.",
              "workspace_required",
            );
          }
          throw error;
        }
        return this.save(id, owner, current, {
          ...current,
          workspace,
          scope:
            workspace.value.hms_role !== current.workspace.value.hms_role
              ? newScope()
              : current.scope,
        });
      });
      checkScope(session, scope);
    }
    return session;
  }
  async requestWorkspace(
    id: string,
    scope: string,
    path: string,
    init: RequestInit = {},
  ) {
    const session = await this.readyWorkspace(id, scope);
    const response = await this.api(path, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        Authorization: `Bearer ${session.workspace!.token}`,
      },
    });
    checkScope(await this.get(id), scope);
    // Never replay a clinical mutation after an uncertain outcome or auth error.
    if (response.status === 401) {
      await this.locked(id, scope, async (current, owner) =>
        this.save(id, owner, current, {
          ...current,
          workspace: null,
          scope: newScope(),
        }),
      );
      throw new HttpError(
        409,
        "Hospital session expired. Select your workspace again.",
        "workspace_required",
      );
    }
    return response;
  }
  async staffInvitation(
    id: string,
    scope: string,
    action: "inspect" | "accept",
    code: string,
    signal?: AbortSignal,
  ) {
    if (
      !["inspect", "accept"].includes(action) ||
      !/^[A-Za-z0-9_-]{43}$/.test(code)
    )
      throw new HttpError(
        400,
        "Enter the invitation code from your hospital administrator.",
      );
    const response = await this.locked(id, scope, async (before, owner) => {
      const session = await this.platform(id, owner, before);
      if (signal?.aborted)
        throw new HttpError(409, "This invitation request was cancelled.");
      return this.platformRequest(
        session,
        `/v1/hms/auth/staff-invitations/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
          signal,
        },
      );
    });
    checkScope(await this.get(id), scope);
    if (!response.ok) throw await responseError(response);
    return response.json();
  }
  private async revoke(refreshToken: string, deviceId: string) {
    const response = await this.api("/v1/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) throw await responseError(response);
  }
  async logout(id: string, scope?: string) {
    const session = await this.store.get(id);
    if (!session) return;
    if (scope !== undefined) checkScope(session, scope);
    if (!(await this.store.remove(id, scope)))
      throw new HttpError(
        409,
        "Your session changed. Reload to continue.",
        "session_changed",
      );
    await this.revoke(session.tokens.refresh_token, session.deviceId);
  }
}
