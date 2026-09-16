import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fixture, tokens, deviceId, hospitals } from "./session-fixture";
const runtime = vi.hoisted(() => ({
  sessions: null as unknown,
  apiFetch: vi.fn(),
}));
vi.mock("../src/server/runtime", () => runtime);
import {
  GET as identity,
  DELETE as logout,
} from "../src/app/api/session/route";
import { POST as select } from "../src/app/api/session/workspace/route";
import { GET as read, POST as write } from "../src/app/api/hms/[...path]/route";
import { cookieName, setSession, privateJson } from "../src/server/http";
import { proxyPolicy } from "../src/server/proxy-policy";
let f: ReturnType<typeof fixture>, id: string, scope: string;
beforeEach(async () => {
  vi.stubEnv("HMS_WEB_ORIGIN", "https://hospital.test");
  f = fixture();
  runtime.sessions = f.manager;
  const login = await f.manager.begin(tokens, deviceId);
  id = login.id;
  scope = login.identity.scope;
});
afterEach(() => vi.unstubAllEnvs());
function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest("https://hospital.test" + path, {
    method,
    headers: {
      Cookie: `${cookieName()}=${id}`,
      Origin: "https://hospital.test",
      "X-Session-Scope": scope,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
describe("hospital BFF boundary", () => {
  it("uses a secure httpOnly host cookie in production and never returns credentials", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const cookie = setSession(privateJson({ ok: true }), id).headers.get(
      "set-cookie",
    )!;
    expect(cookie).toContain("__Host-medapp_hms=");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toContain("Max-Age=28800");
    const response = await identity(request("/api/session"));
    const text = await response.text();
    expect(text).not.toContain(tokens.access_token);
    expect(text).not.toContain(tokens.refresh_token);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("requires an authenticated cookie and same-origin workspace selection", async () => {
    expect(
      (
        await select(
          request(
            "/api/session/workspace",
            "POST",
            { hospital_id: hospitals[0].hospital_id },
            { Cookie: "" },
          ),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await select(
          request(
            "/api/session/workspace",
            "POST",
            { hospital_id: hospitals[0].hospital_id },
            { Origin: "https://other.test" },
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      f.api.mock.calls.some(([path]) => path.endsWith("/workspace-session")),
    ).toBe(false);
  });
  it("allows only a hospital identifier and rejects stale browser scopes", async () => {
    expect(
      (
        await select(
          request("/api/session/workspace", "POST", {
            hospital_id: hospitals[0].hospital_id,
            role: "hospital_admin",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await select(
          request(
            "/api/session/workspace",
            "POST",
            { hospital_id: hospitals[0].hospital_id },
            { "X-Session-Scope": "old" },
          ),
        )
      ).status,
    ).toBe(409);
  });
  it("uses the server-selected hospital token and strips credentials and hospital hints", async () => {
    const chosen = await select(
      request("/api/session/workspace", "POST", {
        hospital_id: hospitals[0].hospital_id,
      }),
    );
    scope = (await chosen.json()).scope;
    const response = await read(
      request(
        "/api/hms/patients?search=A&hospital_id=other",
        "GET",
        undefined,
        {
          Authorization: "Bearer browser-forgery",
          "X-Activation-Secret": "forgery",
        },
      ),
      { params: Promise.resolve({ path: ["patients"] }) },
    );
    expect(response.status).toBe(200);
    const [path, init] = f.api.mock.calls.at(-1)!;
    expect(path).toBe("/v1/hms/patients?search=A");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer workspace-access-1",
    );
    expect(new Headers(init?.headers).get("x-activation-secret")).toBeNull();
  });
  it("does not forward oversized clinical bodies or cross-site writes", async () => {
    const context = { params: Promise.resolve({ path: ["patients"] }) };
    expect(
      (
        await write(
          request("/api/hms/patients", "POST", { value: "x".repeat(66000) }),
          context,
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await write(
          request(
            "/api/hms/patients",
            "POST",
            {},
            { "Sec-Fetch-Site": "cross-site" },
          ),
          context,
        )
      ).status,
    ).toBe(403);
  });
  it("rejects stale sign-out without clearing another active scope", async () => {
    await f.manager.select(id, scope, hospitals[0].hospital_id);
    const response = await logout(request("/api/session", "DELETE"));
    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await f.store.get(id)).not.toBeNull();
  });
  it("does not clear a newer browser cookie when an expired session request completes", async () => {
    const oldIdentityRequest = request("/api/session");
    const oldClinicalRequest = request("/api/hms/patients");
    await f.manager.logout(id, scope);
    const newer = await f.manager.begin(tokens, deviceId);
    const response = await identity(oldIdentityRequest);
    expect(await response.json()).toEqual({ user: null });
    expect(response.headers.get("set-cookie")).toBeNull();
    const clinical = await read(oldClinicalRequest, {
      params: Promise.resolve({ path: ["patients"] }),
    });
    expect(clinical.status).toBe(401);
    expect(clinical.headers.get("set-cookie")).toBeNull();
    expect(await f.store.get(newer.id)).not.toBeNull();
  });
  it("invalidates sign-out immediately without a delayed cookie deletion affecting the next sign-in", async () => {
    const original = f.api.getMockImplementation()!;
    let finish!: (value: Response) => void;
    f.api.mockImplementation((path, init) =>
      path === "/v1/auth/logout"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : original(path, init),
    );
    const pending = logout(request("/api/session", "DELETE"));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(await f.store.get(id)).toBeNull();
    const newer = await f.manager.begin(tokens, deviceId);
    finish(Response.json({ ok: true }));
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await f.store.get(newer.id)).not.toBeNull();
  });
  it.each(
    [
      ["auth", "workspace-session"],
      ["tenants"],
      ["internal", "hospital-activations"],
      ["..", "me"],
      ["%2e%2e", "me"],
      ["patients%2f.."],
      ["patients", "x"],
    ].map((segments) => ({ segments })),
  )(
    "does not expose privileged or ambiguous paths $segments",
    ({ segments }) => {
      expect(proxyPolicy(segments, "GET")).toBeNull();
      expect(proxyPolicy(segments, "POST")).toBeNull();
    },
  );
});
