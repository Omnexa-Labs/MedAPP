import { vi } from "vitest";
import { SessionManager } from "@/server/session-manager";
import type {
  SessionRecord,
  SessionStore,
  Tokens,
} from "@/server/session-types";

export const userId = "11111111-1111-4111-8111-111111111111",
  staffId = "22222222-2222-4222-8222-222222222222";
const pharmacyId = "33333333-3333-4333-8333-333333333333";
const tokens: Tokens = {
  access_token: "parent-access-secret",
  refresh_token: "parent-refresh-secret",
  expires_in: 900,
};
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
export function fixture() {
  let now: number,
    context: {
      user: SessionRecord["user"];
      pharmacy: SessionRecord["pharmacy"];
      expires_at: string;
    };
  let store: MemoryStore, manager: SessionManager;
  const platform = vi.fn(),
    pms = vi.fn();

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
  return { manager, store, context, platform, pms };
}
