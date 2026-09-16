import { randomBytes } from "node:crypto";
import {
  pmsRoles,
  type Identity,
  type Pharmacy,
  type StaffUser,
} from "@/lib/session-types";
import { HttpError, responseError } from "./errors";
import type { SessionRecord, SessionStore, Tokens } from "./session-types";
export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scope = () => randomBytes(16).toString("hex");
export function parseTokens(input: unknown): Tokens {
  const v = input as Tokens;
  if (
    !v ||
    typeof v.access_token !== "string" ||
    v.access_token.length < 10 ||
    v.access_token.length > 8192 ||
    typeof v.refresh_token !== "string" ||
    v.refresh_token.length < 10 ||
    v.refresh_token.length > 8192 ||
    !Number.isFinite(v.expires_in) ||
    v.expires_in < 1 ||
    v.expires_in > 86400
  )
    throw new HttpError(502, "Sign-in returned an invalid session.");
  return {
    access_token: v.access_token,
    refresh_token: v.refresh_token,
    expires_in: v.expires_in,
  };
}
export function checkScope(session: SessionRecord, value: string) {
  if (session.scope !== value)
    throw new HttpError(
      409,
      "Your account or pharmacy access changed. Reload to continue.",
      "session_changed",
    );
}
function publicIdentity(session: SessionRecord): Identity {
  return {
    scope: session.scope,
    user: session.user,
    pharmacy: session.pharmacy,
    mode: session.platform ? "medapp" : "local",
    ...(session.returnUrl ? { returnAvailable: true } : {}),
  };
}
export class SessionManager {
  constructor(
    private store: SessionStore,
    private platformApi: ApiFetch,
    private pmsApi: ApiFetch,
    private deploymentKey: string,
    private now = Date.now,
    private pause = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}
  private async readContext(token: string) {
    const response = await this.pmsApi("/v1/auth/context", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw await responseError(response);
    const v = (await response.json()) as {
      user: StaffUser;
      pharmacy: Pharmacy;
      expires_at: string;
    };
    const expiresAt = Date.parse(v?.expires_at);
    if (
      !v?.user ||
      !uuid.test(v.user.id) ||
      typeof v.user.email !== "string" ||
      typeof v.user.full_name !== "string" ||
      !pmsRoles.includes(v.user.role) ||
      !v.pharmacy ||
      typeof v.pharmacy.name !== "string" ||
      !v.pharmacy.name.trim() ||
      !(
        v.pharmacy.id === null ||
        (typeof v.pharmacy.id === "string" && uuid.test(v.pharmacy.id))
      ) ||
      !(
        v.pharmacy.deployment_key === null ||
        typeof v.pharmacy.deployment_key === "string"
      ) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= this.now() ||
      expiresAt > this.now() + 13 * 3600000 ||
      (this.deploymentKey && v.pharmacy.deployment_key !== this.deploymentKey)
    )
      throw new HttpError(502, "The pharmacy session could not be confirmed.");
    return {
      expiresAt,
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
  private async account(tokens: Tokens, expected?: string) {
    const response = await this.platformApi("/v1/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!response.ok) throw await responseError(response);
    const v = await response.json();
    if (
      !uuid.test(v?.id) ||
      v.is_active !== true ||
      v.email_verified !== true ||
      (expected && v.id !== expected)
    )
      throw new HttpError(
        401,
        "An active, email-verified MedApp account is required.",
      );
    return v.id as string;
  }
  private async exchange(tokens: Tokens) {
    if (!this.deploymentKey)
      throw new HttpError(
        503,
        "MedApp pharmacy sign-in has not been configured.",
      );
    const response = await this.pmsApi("/v1/auth/medapp-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (response.status === 404)
      throw new HttpError(
        403,
        "This MedApp account does not have access to this pharmacy.",
      );
    if (!response.ok) throw await responseError(response);
    const v = await response.json();
    if (
      typeof v.access_token !== "string" ||
      v.access_token.length < 10 ||
      v.access_token.length > 8192 ||
      v.token_type !== "bearer"
    )
      throw new HttpError(502, "The pharmacy session could not be confirmed.");
    return v.access_token as string;
  }
  async begin(
    tokens: Tokens,
    deviceId: string,
    handoff?: { accountId: string; pharmacyId: string; returnUrl: string },
  ) {
    try {
      if (!/^[a-f0-9]{64}$/.test(deviceId))
        throw new HttpError(400, "Restart sign-in.");
      const accountId = await this.account(tokens, handoff?.accountId);
      const token = await this.exchange(tokens);
      const context = await this.readContext(token);
      if (handoff && context.pharmacy.id !== handoff.pharmacyId)
        throw new HttpError(
          401,
          "The pharmacy does not match the link from MedApp.",
        );
      if (
        !context.pharmacy.id ||
        context.expiresAt > this.now() + 305000 ||
        context.expiresAt > this.now() + tokens.expires_in * 1000 + 5000
      )
        throw new HttpError(
          502,
          "The pharmacy session lifetime could not be confirmed.",
        );
      return await this.create({
        ...(handoff ? { returnUrl: handoff.returnUrl } : {}),
        platform: {
          tokens,
          accountId,
          deviceId,
          accessExpiresAt: this.now() + tokens.expires_in * 1000,
        },
        credential: { token, expiresAt: context.expiresAt },
        user: context.user,
        pharmacy: context.pharmacy,
      });
    } catch (error) {
      await this.revoke(tokens.refresh_token, deviceId).catch(() => {});
      throw error;
    }
  }
  async beginLocal(email: string, password: string) {
    const response = await this.pmsApi("/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw await responseError(response);
    const v = await response.json();
    if (
      typeof v.access_token !== "string" ||
      v.access_token.length < 10 ||
      v.access_token.length > 8192 ||
      v.token_type !== "bearer"
    )
      throw new HttpError(502, "The pharmacy session could not be confirmed.");
    const context = await this.readContext(v.access_token);
    return this.create({
      platform: null,
      credential: { token: v.access_token, expiresAt: context.expiresAt },
      user: context.user,
      pharmacy: context.pharmacy,
    });
  }
  private async create(
    value: Omit<SessionRecord, "scope" | "revision" | "expiresAt">,
  ) {
    const record = {
      ...value,
      scope: scope(),
      revision: 0,
      expiresAt: Math.min(
        this.now() + 8 * 3600000,
        value.platform ? Infinity : value.credential.expiresAt,
      ),
    };
    const id = randomBytes(32).toString("hex");
    await this.store.create(id, record);
    return { id, identity: publicIdentity(record) };
  }
  async get(id: string) {
    const record = await this.store.get(id);
    if (!record || record.expiresAt <= this.now())
      throw new HttpError(401, "Your session expired. Sign in again.");
    return record;
  }
  private async locked<T>(
    id: string,
    expected: string | undefined,
    action: (session: SessionRecord, owner: string) => Promise<T>,
  ) {
    const owner = scope();
    for (let attempt = 0; attempt < 120; attempt++) {
      await this.get(id);
      if (await this.store.lock(id, owner)) {
        try {
          const record = await this.get(id);
          if (expected !== undefined) checkScope(record, expected);
          return await action(record, owner);
        } finally {
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
        "Your session changed. Reload to continue.",
        "session_changed",
      );
    return updated;
  }
  private async checked(id: string, owner: string, before: SessionRecord) {
    let session = before;
    if (session.platform) {
      if (session.platform.accessExpiresAt <= this.now() + 30000) {
        let rotated: Tokens | undefined;
        try {
          const response = await this.platformApi("/v1/auth/refresh", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Device-Id": session.platform.deviceId,
            },
            body: JSON.stringify({
              refresh_token: session.platform.tokens.refresh_token,
            }),
          });
          if (!response.ok) throw await responseError(response);
          rotated = parseTokens(await response.json());
          session = await this.save(id, owner, session, {
            ...session,
            platform: {
              ...session.platform,
              tokens: rotated,
              accessExpiresAt: this.now() + rotated.expires_in * 1000,
            },
          });
        } catch {
          await this.store.remove(id).catch(() => {});
          await this.revoke(
            rotated?.refresh_token || session.platform!.tokens.refresh_token,
            session.platform!.deviceId,
          ).catch(() => {});
          throw new HttpError(401, "Sign in again to renew your session.");
        }
      }
      await this.account(session.platform!.tokens, session.platform!.accountId);
      if (session.credential.expiresAt <= this.now() + 30000) {
        const token = await this.exchange(session.platform!.tokens);
        const context = await this.readContext(token);
        if (
          context.user.id !== session.user.id ||
          context.pharmacy.id !== session.pharmacy.id ||
          context.expiresAt > this.now() + 305000 ||
          context.expiresAt > session.platform!.accessExpiresAt + 5000
        )
          throw new HttpError(401, "Pharmacy access changed. Sign in again.");
        session = await this.save(id, owner, session, {
          ...session,
          credential: { token, expiresAt: context.expiresAt },
        });
      }
    }
    const context = await this.readContext(session.credential.token);
    if (
      context.user.id !== session.user.id ||
      context.pharmacy.id !== session.pharmacy.id ||
      context.pharmacy.deployment_key !== session.pharmacy.deployment_key
    )
      throw new HttpError(401, "Pharmacy access changed. Sign in again.");
    return this.save(id, owner, session, {
      ...session,
      user: context.user,
      pharmacy: context.pharmacy,
      scope: context.user.role !== session.user.role ? scope() : session.scope,
    });
  }
  async identity(id: string): Promise<Identity> {
    try {
      return await this.locked(id, undefined, async (session, owner) =>
        publicIdentity(await this.checked(id, owner, session)),
      );
    } catch (error) {
      if (error instanceof HttpError && [401, 403].includes(error.status))
        await this.logout(id).catch(() => {});
      throw error;
    }
  }
  async request(
    id: string,
    expected: string,
    path: string,
    init: RequestInit = {},
  ) {
    try {
      const response = await this.locked(
        id,
        expected,
        async (before, owner) => {
          const session = await this.checked(id, owner, before);
          checkScope(session, expected);
          if (init.signal?.aborted)
            throw new HttpError(499, "The request was cancelled.");
          if (path.startsWith("/v1/pharmacy-profile")) {
            if (
              !session.platform ||
              session.user.role !== "pharmacy_admin" ||
              !session.pharmacy.id
            )
              throw new HttpError(
                403,
                "Only the MedApp pharmacy owner can manage the directory profile.",
              );
            const url = new URL(path, "https://internal.invalid");
            if (
              !/^\/v1\/pharmacy-profile(\/(history|publish|withdraw|photo|photos\/[0-9a-fA-F-]{36}))?$/.test(
                url.pathname,
              )
            )
              throw new HttpError(404, "This profile action is unavailable.");
            if (
              url.search &&
              (url.pathname !== "/v1/pharmacy-profile/history" ||
                [...url.searchParams.keys()].join(",") !== "offset" ||
                !/^\d{1,6}$/.test(url.searchParams.get("offset") || ""))
            )
              throw new HttpError(400, "Invalid profile history query.");
            const destination =
              "/v1/pharmacy-workspaces/" +
              session.pharmacy.id +
              "/profile" +
              url.pathname.slice("/v1/pharmacy-profile".length) +
              url.search;
            const headers = new Headers({
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.platform.tokens.access_token}`,
            });
            if (url.pathname === "/v1/pharmacy-profile/photo") {
              const incoming = new Headers(init.headers);
              const type = incoming.get("content-type") || "";
              const version = incoming.get("if-match") || "";
              if (
                init.method !== "POST" ||
                !["image/jpeg", "image/png", "image/webp"].includes(type) ||
                !/^[1-9][0-9]{0,9}$/.test(version)
              )
                throw new HttpError(400, "Invalid pharmacy photo upload.");
              headers.set("Content-Type", type);
              headers.set("If-Match", version);
            }
            return this.platformApi(destination, {
              ...init,
              headers,
            });
          }
          return this.pmsApi(path, {
            ...init,
            headers: {
              ...Object.fromEntries(new Headers(init.headers)),
              Authorization: `Bearer ${session.credential.token}`,
            },
          });
        },
      );
      checkScope(await this.get(id), expected);
      if (response.status === 401) {
        await this.logout(id, expected).catch(() => {});
        throw new HttpError(401, "Pharmacy access changed. Sign in again.");
      }
      return response;
    } catch (error) {
      if (error instanceof HttpError && error.status === 401)
        await this.logout(id, expected).catch(() => {});
      throw error;
    }
  }
  private async revoke(refresh: string, deviceId: string) {
    const response = await this.platformApi("/v1/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!response.ok) throw await responseError(response);
  }
  async logout(id: string, expected?: string) {
    const session = await this.store.get(id);
    if (!session) return;
    if (expected !== undefined) checkScope(session, expected);
    if (!(await this.store.remove(id, expected)))
      throw new HttpError(
        409,
        "Your session changed. Reload to continue.",
        "session_changed",
      );
    if (session.platform)
      await this.revoke(
        session.platform.tokens.refresh_token,
        session.platform.deviceId,
      );
  }
}
