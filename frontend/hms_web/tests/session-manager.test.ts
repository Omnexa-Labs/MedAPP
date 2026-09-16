import { describe, expect, it, vi } from "vitest";
import {
  fixture,
  selected,
  tokens,
  deviceId,
  hospitals,
  nextTokens,
} from "./session-fixture";

describe("hospital server sessions", () => {
  it("returns public identity without tokens and requires explicit hospital selection", async () => {
    const f = fixture();
    const { id, identity } = await f.manager.begin(tokens, deviceId);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.workspace).toBeNull();
    const current = await f.manager.identity(id);
    expect(current.workspaces).toEqual(hospitals);
    expect(current.user.role).toBe("patient");
    expect(JSON.stringify(current)).not.toContain("access_token");
    expect(JSON.stringify(current)).not.toContain("refresh_token");
    await expect(
      f.manager.requestWorkspace(id, current.scope, "/v1/hms/patients"),
    ).rejects.toMatchObject({ code: "workspace_required" });
  });
  it("uses hospital credentials for clinical requests and rejects an old workspace scope", async () => {
    const f = await selected();
    await f.manager.requestWorkspace(f.id, f.scope, "/v1/hms/patients");
    expect(
      new Headers(f.api.mock.calls.at(-1)![1]?.headers).get("authorization"),
    ).toBe("Bearer workspace-access-1");
    const second = await f.manager.select(
      f.id,
      f.scope,
      hospitals[1].hospital_id,
    );
    expect(second.workspace?.hospital_name).toBe("Hospital B");
    expect(second.scope).not.toBe(f.scope);
    await expect(
      f.manager.requestWorkspace(f.id, f.scope, "/v1/hms/patients"),
    ).rejects.toMatchObject({ code: "session_changed" });
  });
  it.each([
    { user_id: hospitals[0].hospital_id },
    { workspace: hospitals[1] },
    { expires_at: "invalid" },
    { expires_at: new Date(Date.now() + 900000).toISOString() },
    { token_type: "refresh" },
    { access_token: "" },
  ])("refuses mismatched exchange results %#", async (patch) => {
    const f = fixture();
    const login = await f.manager.begin(tokens, deviceId);
    f.state.exchangePatch = patch;
    await expect(
      f.manager.select(
        login.id,
        login.identity.scope,
        hospitals[0].hospital_id,
      ),
    ).rejects.toMatchObject({ status: 502 });
    expect((await f.store.get(login.id))?.workspace).toBeNull();
  });
  it("rotates the parent and workspace once for concurrent expired requests", async () => {
    const f = await selected();
    f.advance(900000);
    await Promise.all(
      Array.from({ length: 6 }, () =>
        f.manager.requestWorkspace(f.id, f.scope, "/v1/hms/patients"),
      ),
    );
    expect(
      f.api.mock.calls.filter(([path]) => path === "/v1/auth/refresh"),
    ).toHaveLength(1);
    expect(
      f.api.mock.calls.filter(([path]) => path.endsWith("/workspace-session")),
    ).toHaveLength(2);
    expect(
      new Headers(
        f.api.mock.calls.find(([path]) => path === "/v1/auth/refresh")![1]
          ?.headers,
      ).get("X-Device-Id"),
    ).toBe(deviceId);
  });
  it("retains rotated parent credentials when workspace renewal fails", async () => {
    const f = await selected();
    f.advance(900000);
    f.state.exchangeStatus = 503;
    await expect(
      f.manager.requestWorkspace(f.id, f.scope, "/v1/hms/patients"),
    ).rejects.toMatchObject({ status: 503 });
    expect((await f.store.get(f.id))?.tokens).toEqual(nextTokens);
    f.state.exchangeStatus = 200;
    await f.manager.requestWorkspace(f.id, f.scope, "/v1/hms/patients");
    expect(
      f.api.mock.calls.filter(([path]) => path === "/v1/auth/refresh"),
    ).toHaveLength(1);
  });
  it("serializes competing selection without overwriting the winning workspace", async () => {
    const f = await selected();
    const results = await Promise.allSettled(
      hospitals.map((h) => f.manager.select(f.id, f.scope, h.hospital_id)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "session_changed" },
    });
  });
  it("does not recreate a session signed out while refresh was in flight", async () => {
    const f = await selected();
    f.advance(900000);
    const original = f.api.getMockImplementation()!;
    let finish!: (value: Response) => void;
    f.api.mockImplementation((path, init) =>
      path === "/v1/auth/refresh"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : original(path, init),
    );
    const pending = f.manager.requestWorkspace(
      f.id,
      f.scope,
      "/v1/hms/patients",
    );
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await f.manager.logout(f.id, f.scope);
    finish(Response.json(nextTokens));
    await rejected;
    expect(await f.store.get(f.id)).toBeNull();
    expect(
      f.api.mock.calls.some(
        ([path, init]) =>
          path.endsWith("/logout") &&
          String(init?.body).includes(nextTokens.refresh_token),
      ),
    ).toBe(true);
  });
  it("does not commit a refresh after its lock ownership was lost", async () => {
    const f = await selected();
    f.advance(900000);
    const original = f.api.getMockImplementation()!;
    f.api.mockImplementation(async (path, init) => {
      if (path === "/v1/auth/refresh") f.store.locks.delete(f.id);
      return original(path, init);
    });
    await expect(
      f.manager.requestWorkspace(f.id, f.scope, "/v1/hms/patients"),
    ).rejects.toMatchObject({ status: 401 });
    expect(await f.store.get(f.id)).toBeNull();
  });
  it("discards a late clinical result after selecting another hospital", async () => {
    const f = await selected();
    const original = f.api.getMockImplementation()!;
    let finish!: (value: Response) => void;
    f.api.mockImplementation((path, init) =>
      path === "/v1/hms/patients"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : original(path, init),
    );
    const pending = f.manager.requestWorkspace(
      f.id,
      f.scope,
      "/v1/hms/patients",
    );
    const rejected = expect(pending).rejects.toMatchObject({
      code: "session_changed",
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await f.manager.select(f.id, f.scope, hospitals[1].hospital_id);
    finish(Response.json({ patient_name: "Old hospital" }));
    await rejected;
  });
  it("never repeats a clinical mutation on failure", async () => {
    const f = await selected();
    const original = f.api.getMockImplementation()!;
    f.api.mockImplementation(async (path, init) =>
      path === "/v1/hms/invoices"
        ? new Response(null, { status: 503 })
        : original(path, init),
    );
    expect(
      (
        await f.manager.requestWorkspace(f.id, f.scope, "/v1/hms/invoices", {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(503);
    expect(
      f.api.mock.calls.filter(([path]) => path === "/v1/hms/invoices"),
    ).toHaveLength(1);
  });
  it("invalidates hospital selection when membership disappears during renewal", async () => {
    const f = await selected();
    f.advance(300000);
    f.state.workspaces = [];
    await expect(
      f.manager.requestWorkspace(f.id, f.scope, "/v1/hms/patients"),
    ).rejects.toMatchObject({ code: "workspace_required" });
    expect((await f.store.get(f.id))?.workspace).toBeNull();
  });
  it("changes the browser scope when the current staff role changes", async () => {
    const f = await selected();
    f.state.workspaces[0].hms_role = "nurse";
    const identity = await f.manager.identity(f.id);
    expect(identity.scope).not.toBe(f.scope);
    expect(identity.workspace?.hms_role).toBe("nurse");
    await expect(
      f.manager.requestWorkspace(f.id, f.scope, "/v1/hms/patients"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("removes inactive accounts instead of retaining a browser session", async () => {
    const f = await selected();
    f.state.user.is_active = false;
    await expect(f.manager.identity(f.id)).rejects.toMatchObject({
      status: 401,
    });
    expect(await f.store.get(f.id)).toBeNull();
  });
  it("does not let a stale tab sign out the changed session", async () => {
    const f = await selected();
    await f.manager.select(f.id, f.scope, hospitals[1].hospital_id);
    await expect(f.manager.logout(f.id, f.scope)).rejects.toMatchObject({
      status: 409,
    });
    expect(await f.store.get(f.id)).not.toBeNull();
  });
});
