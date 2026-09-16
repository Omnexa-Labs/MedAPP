import { beforeEach, expect, it, vi } from "vitest";
import { SessionManager } from "@/server/session-manager";
import type {
  SessionRecord,
  SessionStore,
  Tokens,
} from "@/server/session-types";
import { HttpError } from "@/server/errors";
const userId = "11111111-1111-4111-8111-111111111111",
  staffId = "22222222-2222-4222-8222-222222222222";
const pharmacyId = "33333333-3333-4333-8333-333333333333";
const tokens: Tokens = {
  access_token: "parent-access-secret",
  refresh_token: "parent-refresh-secret",
  expires_in: 900,
};
const device = "a".repeat(64);
class MemoryStore implements SessionStore {
  rows = new Map<string, SessionRecord>();
  locks = new Map<string, string>();
  async get(id: string) {
    return structuredClone(this.rows.get(id) || null);
  }
  async create(id: string, value: SessionRecord) {
    this.rows.set(id, structuredClone(value));
  }
  async commit(
    id: string,
    owner: string,
    revision: number,
    value: SessionRecord,
  ) {
    if (
      this.locks.get(id) !== owner ||
      this.rows.get(id)?.revision !== revision
    )
      return false;
    this.rows.set(id, structuredClone(value));
    return true;
  }
  async remove(id: string, scope?: string) {
    const value = this.rows.get(id);
    if (value && scope !== undefined && value.scope !== scope) return false;
    this.rows.delete(id);
    return true;
  }
  async lock(id: string, owner: string) {
    if (this.locks.has(id)) return false;
    this.locks.set(id, owner);
    return true;
  }
  async unlock(id: string, owner: string) {
    if (this.locks.get(id) === owner) this.locks.delete(id);
  }
}
let now: number,
  context: {
    user: SessionRecord["user"];
    pharmacy: SessionRecord["pharmacy"];
    expires_at: string;
  };
let store: MemoryStore, manager: SessionManager;
const platform = vi.fn(),
  pms = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  now = Date.parse("2026-09-15T12:00:00Z");
  store = new MemoryStore();
  context = {
    user: {
      id: staffId,
      email: "ama@example.com",
      full_name: "Ama Mensah",
      role: "pharmacy_admin",
    },
    pharmacy: {
      id: pharmacyId,
      name: "Care Pharmacy",
      deployment_key: "accra",
    },
    expires_at: new Date(now + 300000).toISOString(),
  };
  platform.mockImplementation(async (path: string) => {
    if (path === "/v1/me")
      return Response.json({
        id: userId,
        is_active: true,
        email_verified: true,
      });
    if (path === "/v1/auth/refresh")
      return Response.json({
        ...tokens,
        access_token: "rotated-parent-access",
        refresh_token: "rotated-parent-refresh",
      });
    if (path === "/v1/auth/logout") return Response.json({ ok: true });
    throw Error("Unexpected platform path " + path);
  });
  pms.mockImplementation(async (path: string) => {
    if (path === "/v1/auth/context") return Response.json(context);
    if (path === "/v1/auth/medapp-session" || path === "/v1/auth/login") {
      context.expires_at = new Date(now + 300000).toISOString();
      return Response.json({
        access_token: "pharmacy-access-secret",
        token_type: "bearer",
      });
    }
    return Response.json({ items: [] });
  });
  manager = new SessionManager(
    store,
    platform,
    pms,
    "accra",
    () => now,
    () => new Promise((resolve) => setTimeout(resolve, 0)),
  );
});
async function begin() {
  return manager.begin(tokens, device);
}
it("routes binary photo uploads through the current pharmacy and server credential", async () => {
  const login = await begin();
  platform.mockImplementation(async (path: string) =>
    path === "/v1/me"
      ? Response.json({ id: userId, is_active: true, email_verified: true })
      : Response.json({ version: 2 }),
  );
  const body = new Uint8Array([0, 255, 1]);
  await manager.request(
    login.id,
    login.identity.scope,
    "/v1/pharmacy-profile/photo",
    {
      method: "POST",
      body,
      headers: {
        "Content-Type": "image/png",
        "If-Match": "1",
        Authorization: "forged",
        "X-Owner": "other",
      },
    },
  );
  const [path, init] = platform.mock.calls.at(-1)!;
  expect(path).toBe(`/v1/pharmacy-workspaces/${pharmacyId}/profile/photo`);
  expect(init.body).toBe(body);
  expect(Object.fromEntries(new Headers(init.headers))).toEqual({
    "content-type": "image/png",
    "if-match": "1",
    authorization: "Bearer " + tokens.access_token,
  });
  await expect(
    manager.request(
      login.id,
      login.identity.scope,
      "/v1/pharmacy-profile/photo?pharmacy_id=other",
      { method: "POST" },
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("derives the directory profile target from the checked session and sends only the MedApp credential", async () => {
  const login = await begin();
  platform.mockImplementation(async (path: string) =>
    path === "/v1/me"
      ? Response.json({ id: userId, is_active: true, email_verified: true })
      : Response.json({ pharmacy_id: pharmacyId }),
  );
  await manager.request(
    login.id,
    login.identity.scope,
    "/v1/pharmacy-profile/history?offset=20",
  );
  const [path, init] = platform.mock.calls.at(-1)!;
  expect(path).toBe(
    "/v1/pharmacy-workspaces/" + pharmacyId + "/profile/history?offset=20",
  );
  expect(new Headers(init.headers).get("Authorization")).toBe(
    "Bearer " + tokens.access_token,
  );
  await expect(
    manager.request(
      login.id,
      login.identity.scope,
      "/v1/pharmacy-profile?pharmacy_id=other",
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("refuses directory profile operations for local pharmacy administrators", async () => {
  const login = await manager.beginLocal("local@example.com", "password");
  await expect(
    manager.request(login.id, login.identity.scope, "/v1/pharmacy-profile"),
  ).rejects.toMatchObject({ status: 403 });
  expect(platform).not.toHaveBeenCalled();
});
it.each(["account", "pharmacy"])(
  "rejects a handoff whose %s does not match current access",
  async (target) => {
    const other = "99999999-9999-4999-8999-999999999999";
    await expect(
      manager.begin(tokens, device, {
        accountId: target === "account" ? other : userId,
        pharmacyId: target === "pharmacy" ? other : pharmacyId,
        returnUrl:
          "medapp://pharmacy-workspaces?handoff_state=" + "s".repeat(32),
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(store.rows.size).toBe(0);
    expect(
      platform.mock.calls.some(([path]) => path === "/v1/auth/logout"),
    ).toBe(true);
  },
);
it("keeps parent and pharmacy credentials server-side and exposes the verified pharmacy identity", async () => {
  const result = await begin();
  expect(result.id).toMatch(/^[a-f0-9]{64}$/);
  expect(result.identity).toEqual({
    scope: expect.any(String),
    mode: "medapp",
    user: context.user,
    pharmacy: context.pharmacy,
  });
  expect(JSON.stringify(result.identity)).not.toMatch(/secret|token|deviceId/);
  const saved = await manager.get(result.id);
  expect(saved.platform?.tokens).toEqual(tokens);
  await manager.request(result.id, result.identity.scope, "/v1/drugs");
  const [path, init] = pms.mock.calls.at(-1)!;
  expect(path).toBe("/v1/drugs");
  expect(new Headers(init.headers).get("Authorization")).toBe(
    "Bearer pharmacy-access-secret",
  );
  expect(new Headers(pms.mock.calls[0][1].headers).get("Authorization")).toBe(
    "Bearer parent-access-secret",
  );
});
it("supports local staff without a platform request and bounds the session to the PMS token", async () => {
  const result = await manager.beginLocal("local@example.com", "password");
  expect(result.identity.mode).toBe("local");
  expect(platform).not.toHaveBeenCalled();
  const saved = await manager.get(result.id);
  expect(saved.platform).toBeNull();
  expect(saved.expiresAt).toBe(Date.parse(context.expires_at));
});
it.each(["unverified", "inactive", "wrong-account"])(
  "rejects %s MedApp identity before renewing pharmacy access",
  async (reason) => {
    const result = await begin();
    platform.mockImplementation(async (path) =>
      Response.json(
        path === "/v1/me"
          ? {
              id: reason === "wrong-account" ? staffId : userId,
              is_active: reason !== "inactive",
              email_verified: reason !== "unverified",
            }
          : { ok: true },
      ),
    );
    pms.mockClear();
    await expect(manager.identity(result.id)).rejects.toMatchObject({
      status: 401,
    });
    expect(store.rows.has(result.id)).toBe(false);
    expect(pms).not.toHaveBeenCalled();
  },
);
it("rejects a different configured pharmacy and revokes the rejected sign-in", async () => {
  context.pharmacy.deployment_key = "other";
  await expect(begin()).rejects.toMatchObject({ status: 502 });
  expect(store.rows.size).toBe(0);
  expect(platform.mock.calls.at(-1)?.[0]).toBe("/v1/auth/logout");
});
it("rejects an overlong pharmacy credential even if the upstream session response succeeds", async () => {
  pms.mockImplementation(async (path) =>
    path === "/v1/auth/context"
      ? Response.json({
          ...context,
          expires_at: new Date(now + 3600000).toISOString(),
        })
      : Response.json({
          access_token: "pharmacy-access-secret",
          token_type: "bearer",
        }),
  );
  await expect(begin()).rejects.toMatchObject({ status: 502 });
  expect(store.rows.size).toBe(0);
});
it("uses a new scope for a changed role and does not send the stale mutation", async () => {
  const result = await begin();
  context.user.role = "cashier";
  await expect(
    manager.request(result.id, result.identity.scope, "/v1/staff", {
      method: "POST",
    }),
  ).rejects.toMatchObject({ status: 409, code: "session_changed" });
  expect(pms.mock.calls.some(([path]) => path === "/v1/staff")).toBe(false);
  const next = await manager.identity(result.id);
  expect(next.scope).not.toBe(result.identity.scope);
  expect(next.user.role).toBe("cashier");
});
it("rejects stale scope before identity reads or operational writes", async () => {
  const result = await begin();
  platform.mockClear();
  pms.mockClear();
  await expect(
    manager.request(result.id, "old", "/v1/sales", { method: "POST" }),
  ).rejects.toMatchObject({ status: 409 });
  expect(platform).not.toHaveBeenCalled();
  expect(pms).not.toHaveBeenCalled();
});
it("renews the short pharmacy credential without rotating a still-valid parent token", async () => {
  const result = await begin();
  now += 280000;
  pms.mockClear();
  platform.mockClear();
  await manager.identity(result.id);
  expect(
    pms.mock.calls.filter(([path]) => path === "/v1/auth/medapp-session"),
  ).toHaveLength(1);
  expect(
    platform.mock.calls.some(([path]) => path === "/v1/auth/refresh"),
  ).toBe(false);
});
it("serializes concurrent refreshes and saves the rotated refresh token before continuing", async () => {
  const result = await begin();
  now += 880000;
  platform.mockClear();
  const both = await Promise.all([
    manager.identity(result.id),
    manager.identity(result.id),
  ]);
  expect(both[0]).toEqual(both[1]);
  expect(
    platform.mock.calls.filter(([path]) => path === "/v1/auth/refresh"),
  ).toHaveLength(1);
  expect((await manager.get(result.id)).platform?.tokens.refresh_token).toBe(
    "rotated-parent-refresh",
  );
});
it("does not resurrect a logged-out session when an in-flight refresh finishes", async () => {
  const result = await begin();
  now += 880000;
  let finish!: (value: Response) => void;
  const started = Promise.withResolvers<void>();
  platform.mockImplementation(async (path) => {
    if (path === "/v1/auth/refresh") {
      started.resolve();
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }
    return Response.json({ ok: true });
  });
  const pending = manager.identity(result.id);
  const outcome = expect(pending).rejects.toMatchObject({ status: 401 });
  await started.promise;
  await manager.logout(result.id, result.identity.scope);
  finish(Response.json({ ...tokens, refresh_token: "rotated-parent-refresh" }));
  await outcome;
  expect(store.rows.has(result.id)).toBe(false);
  expect(
    platform.mock.calls.some(
      ([path, init]) =>
        path === "/v1/auth/logout" &&
        JSON.parse(init.body).refresh_token === "rotated-parent-refresh",
    ),
  ).toBe(true);
});
it("keeps rotated parent credentials after a transient pharmacy outage", async () => {
  const result = await begin();
  now += 880000;
  pms.mockRejectedValue(new HttpError(503, "Temporarily unavailable"));
  await expect(manager.identity(result.id)).rejects.toMatchObject({
    status: 503,
  });
  expect((await manager.get(result.id)).platform?.tokens.refresh_token).toBe(
    "rotated-parent-refresh",
  );
});
it("does not replay an operational mutation whose response was lost", async () => {
  const result = await begin();
  pms.mockImplementation(async (path) => {
    if (path === "/v1/auth/context") return Response.json(context);
    throw new HttpError(503, "Connection lost");
  });
  await expect(
    manager.request(result.id, result.identity.scope, "/v1/sales", {
      method: "POST",
      body: "{}",
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect(pms.mock.calls.filter(([path]) => path === "/v1/sales")).toHaveLength(
    1,
  );
});
it("removes the session after live pharmacy membership is revoked", async () => {
  const result = await begin();
  pms.mockResolvedValue(
    Response.json({ detail: "Inactive membership" }, { status: 401 }),
  );
  await expect(manager.identity(result.id)).rejects.toMatchObject({
    status: 401,
  });
  expect(store.rows.size).toBe(0);
});
it("rejects a delayed successful operation after sign-out", async () => {
  const result = await begin();
  const pending = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  pms.mockImplementation(async (path) => {
    if (path === "/v1/auth/context") return Response.json(context);
    started.resolve();
    return pending.promise;
  });
  const work = manager.request(result.id, result.identity.scope, "/v1/sales");
  const outcome = expect(work).rejects.toMatchObject({ status: 401 });
  await started.promise;
  await manager.logout(result.id, result.identity.scope);
  pending.resolve(Response.json({ items: ["old"] }));
  await outcome;
});
