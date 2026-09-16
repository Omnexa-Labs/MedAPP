import { vi } from "vitest";
import { SessionManager } from "../src/server/session-manager";
import type {
  SessionRecord,
  SessionStore,
  Tokens,
} from "../src/server/session-types";
import type { Workspace } from "../src/lib/session-types";
export const user = {
  id: "11111111-1111-4111-8111-111111111111",
  first_name: "Ada",
  last_name: "Owner",
  email: "ada@example.com",
  role: "patient",
  is_active: true,
};
export const hospitals: Workspace[] = [
  {
    hospital_id: "22222222-2222-4222-8222-222222222222",
    hospital_name: "Hospital A",
    hms_role: "hospital_admin",
  },
  {
    hospital_id: "33333333-3333-4333-8333-333333333333",
    hospital_name: "Hospital B",
    hms_role: "nurse",
  },
];
export const tokens: Tokens = {
  access_token: "platform-access-before",
  refresh_token: "platform-refresh-before",
  expires_in: 900,
};
export const nextTokens: Tokens = {
  access_token: "platform-access-after",
  refresh_token: "platform-refresh-after",
  expires_in: 900,
};
export const deviceId = "d".repeat(64);
export class MemoryStore implements SessionStore {
  values = new Map<string, SessionRecord>();
  locks = new Map<string, string>();
  async get(id: string) {
    return structuredClone(this.values.get(id) || null);
  }
  async create(id: string, value: SessionRecord) {
    this.values.set(id, structuredClone(value));
  }
  async commit(
    id: string,
    owner: string,
    revision: number,
    value: SessionRecord,
  ) {
    if (
      this.locks.get(id) !== owner ||
      this.values.get(id)?.revision !== revision
    )
      return false;
    this.values.set(id, structuredClone(value));
    return true;
  }
  async remove(id: string, scope?: string) {
    if (
      scope !== undefined &&
      this.values.has(id) &&
      this.values.get(id)?.scope !== scope
    )
      return false;
    this.values.delete(id);
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
  let now = Date.now(),
    exchanges = 0;
  const store = new MemoryStore();
  const state = {
    user: { ...user },
    workspaces: structuredClone(hospitals),
    exchangeStatus: 200,
    exchangePatch: {} as Record<string, unknown>,
  };
  const api = vi.fn(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      if (path === "/v1/me") return Response.json(state.user);
      if (path === "/v1/hms/auth/workspaces")
        return Response.json(state.workspaces);
      if (path === "/v1/auth/refresh") return Response.json(nextTokens);
      if (path === "/v1/auth/logout")
        return new Response(null, { status: 204 });
      if (path === "/v1/hms/auth/workspace-session") {
        if (state.exchangeStatus !== 200)
          return Response.json(
            { detail: "unavailable" },
            { status: state.exchangeStatus },
          );
        const body = JSON.parse(String(init.body));
        const workspace = state.workspaces.find(
          (value) => value.hospital_id === body.hospital_id,
        );
        if (!workspace)
          return Response.json({ detail: "not found" }, { status: 404 });
        return Response.json({
          access_token: "workspace-access-" + ++exchanges,
          token_type: "bearer",
          user_id: user.id,
          workspace,
          expires_at: new Date(now + 300000).toISOString(),
          ...state.exchangePatch,
        });
      }
      return Response.json({ items: [{ patient_name: "Synthetic patient" }] });
    },
  );
  const manager = new SessionManager(
    store,
    api,
    () => now,
    () => new Promise((resolve) => setTimeout(resolve, 0)),
  );
  return {
    manager,
    store,
    api,
    state,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}
export async function selected(f = fixture()) {
  const { id, identity } = await f.manager.begin(tokens, deviceId);
  const chosen = await f.manager.select(
    id,
    identity.scope,
    hospitals[0].hospital_id,
  );
  return { ...f, id, scope: chosen.scope };
}
