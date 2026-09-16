import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fixture, tokens, deviceId, user } from "./session-fixture";
const runtime = vi.hoisted(() => ({
  sessions: null as unknown,
  apiFetch: vi.fn(),
  get: vi.fn(),
}));
vi.mock("../src/server/runtime", () => runtime);
vi.mock("../src/server/store", () => ({ sessionStore: { get: runtime.get } }));
import { handoff, returnToApp, validReturn } from "../src/server/handoff";
import { cookieName } from "../src/server/http";
let f: ReturnType<typeof fixture>;
const proof = "p".repeat(64),
  returnUrl = `medapp://hospital-workspaces?handoff_state=${"s".repeat(32)}`;
const preview = { user_id: user.id, name: "Ada Owner", email: user.email };
let result: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HMS_WEB_ORIGIN", "https://hospital.test");
  vi.stubEnv(
    "HMS_WEB_HANDOFF_SECRET",
    "hospital-handoff-test-server-credential-2026",
  );
  f = fixture();
  runtime.sessions = f.manager;
  runtime.get.mockImplementation((id: string) => f.store.get(id));
  result = {
    user_id: user.id,
    tokens,
    destination: "/workspaces",
    return_url: returnUrl,
  };
  runtime.apiFetch.mockImplementation(async (path: string) =>
    Response.json(path.endsWith("/inspect") ? preview : result),
  );
});
afterEach(() => vi.unstubAllEnvs());
function request(
  headers: Record<string, string> = {},
  body: unknown = { code: proof },
  signal?: AbortSignal,
) {
  return new NextRequest("https://hospital.test/api/session/handoff", {
    method: "POST",
    signal,
    headers: {
      Origin: "https://hospital.test",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
describe("hospital handoff boundary", () => {
  it("previews the account, installs a private device-bound session and closes only that session on return", async () => {
    expect(await (await handoff(request())).json()).toEqual({
      name: preview.name,
      email: preview.email,
    });
    expect(f.store.values.size).toBe(0);
    const response = await handoff(request(), true);
    expect(response.status).toBe(200);
    const identity = await response.json();
    expect(identity.returnAvailable).toBe(true);
    expect(identity.workspace).toBeNull();
    expect(JSON.stringify(identity)).not.toContain(tokens.refresh_token);
    expect(JSON.stringify(identity)).not.toContain("handoff_state");
    const id = response.cookies.get(cookieName())!.value;
    const saved = (await f.store.get(id))!;
    expect(saved.returnUrl).toBe(returnUrl);
    expect(saved.deviceId).toMatch(/^[a-f0-9]{64}$/);
    const redeem = runtime.apiFetch.mock.calls.find(([path]) =>
      path.endsWith("/redeem"),
    )!;
    expect(new Headers(redeem[1].headers).get("X-Device-Id")).toBe(
      saved.deviceId,
    );
    const returned = await returnToApp(
      request(
        { Cookie: `${cookieName()}=${id}`, "X-Session-Scope": identity.scope },
        {},
      ),
    );
    expect(returned.status).toBe(200);
    expect(await returned.json()).toEqual({ url: returnUrl });
    expect(await f.store.get(id)).toBeNull();
    expect(returned.headers.get("set-cookie")).toBeNull();
  });
  it("rejects cross-origin and oversized proof requests before sending a credential", async () => {
    expect(
      (await handoff(request({ Origin: "https://other.test" }), true)).status,
    ).toBe(403);
    expect(
      (await handoff(request({}, { code: "x".repeat(17000) }), true)).status,
    ).toBe(413);
    expect(runtime.apiFetch).not.toHaveBeenCalled();
  });
  it("refuses to replace another signed-in account", async () => {
    const login = await f.manager.begin(tokens, deviceId);
    f.store.values.get(login.id)!.user.id =
      "99999999-9999-4999-8999-999999999999";
    // A live identity check must agree with the existing record.
    f.state.user.id = "99999999-9999-4999-8999-999999999999";
    const response = await handoff(
      request({ Cookie: `${cookieName()}=${login.id}` }),
      true,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("handoff_account_mismatch");
    expect(
      runtime.apiFetch.mock.calls.every(([path]) => !path.endsWith("/redeem")),
    ).toBe(true);
    expect(await f.store.get(login.id)).not.toBeNull();
  });
  it("requires the current browser scope before replacing an existing same-account session", async () => {
    const login = await f.manager.begin(tokens, deviceId);
    const headers = {
      Cookie: `${cookieName()}=${login.id}`,
      "X-Session-Scope": "stale",
    };
    expect((await handoff(request(headers), true)).status).toBe(409);
    headers["X-Session-Scope"] = login.identity.scope;
    const response = await handoff(request(headers), true);
    expect(response.status).toBe(200);
    expect(await f.store.get(login.id)).toBeNull();
    expect(f.store.values.size).toBe(1);
  });
  it.each([
    "https://other.test/hospital-workspaces?handoff_state=" + "s".repeat(32),
    "medapp://onboarding-status?handoff_state=" + "s".repeat(32),
    "medapp://hospital-workspaces?handoff_state=short",
    returnUrl + "&role=hospital_admin",
    returnUrl + "#extra",
  ])(
    "revokes malformed upstream handoffs instead of installing an unsafe return %s",
    async (url) => {
      result.return_url = url;
      expect((await handoff(request(), true)).status).toBe(502);
      expect(f.store.values.size).toBe(0);
      expect(
        runtime.apiFetch.mock.calls.some(
          ([path]) => path === "/v1/auth/logout",
        ),
      ).toBe(true);
    },
  );
  it("removes a newly installed session if the browser aborted while redeeming", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      (await handoff(request({}, { code: proof }, controller.signal), true))
        .status,
    ).toBe(409);
    expect(f.store.values.size).toBe(0);
  });
  it("cannot return a password session or close a newer workspace scope", async () => {
    const login = await f.manager.begin(tokens, deviceId);
    const headers = {
      Cookie: `${cookieName()}=${login.id}`,
      "X-Session-Scope": login.identity.scope,
    };
    expect((await returnToApp(request(headers, {}))).status).toBe(400);
    f.store.values.get(login.id)!.returnUrl = returnUrl;
    headers["X-Session-Scope"] = "old";
    expect((await returnToApp(request(headers, {}))).status).toBe(409);
    expect(await f.store.get(login.id)).not.toBeNull();
  });
  it("accepts only configured return destinations with one state parameter", () => {
    expect(validReturn(returnUrl)).toBe(true);
    expect(validReturn(returnUrl + "&handoff_state=" + "s".repeat(32))).toBe(
      false,
    );
  });
});
