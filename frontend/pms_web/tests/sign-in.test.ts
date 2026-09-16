import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { tokens, deviceId, user, identity } from "./session-fixture";
const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  begin: vi.fn(),
  beginLocal: vi.fn(),
  logout: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  values: new Map(),
  locks: new Map(),
}));
vi.mock("../src/server/runtime", () => ({
  apiFetch: mocks.apiFetch,
  sessions: {
    begin: mocks.begin,
    beginLocal: mocks.beginLocal,
    logout: mocks.logout,
  },
}));
vi.mock("../src/server/store", () => ({ sessionStore: { get: mocks.get } }));
vi.mock("../src/server/signin-store", () => ({
  attempts: {
    get: async (id: string) => mocks.values.get(id) || null,
    put: async (id: string, value: unknown) => {
      mocks.values.set(id, value);
    },
    remove: mocks.remove,
    lock: async (id: string, owner: string) => {
      if (mocks.locks.has(id)) return false;
      mocks.locks.set(id, owner);
      return true;
    },
    unlock: async (id: string, owner: string) => {
      if (mocks.locks.get(id) === owner) mocks.locks.delete(id);
    },
  },
}));
import { POST as login } from "../src/app/api/session/login/route";
import { POST as verify } from "../src/app/api/session/verify/route";
import { attemptCookie } from "../src/server/sign-in";
import { cookieName } from "../src/server/http";
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("PMS_WEB_ORIGIN", "https://pharmacy.test");
  mocks.values.clear();
  mocks.locks.clear();
  mocks.get.mockResolvedValue(null);
  mocks.apiFetch.mockResolvedValue(Response.json(tokens));
  mocks.begin.mockResolvedValue({ id: "b".repeat(64), identity });
  mocks.beginLocal.mockResolvedValue({
    id: "b".repeat(64),
    identity: { ...identity, mode: "local" },
  });
  mocks.logout.mockResolvedValue(undefined);
  mocks.remove.mockImplementation(async (id: string) => {
    mocks.values.delete(id);
  });
});
function request(
  body: unknown,
  cookies = "",
  origin = "https://pharmacy.test",
) {
  return new NextRequest("https://pharmacy.test/api/session/login", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: cookies,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
describe("MedApp sign-in for pharmacy staff", () => {
  it("uses the platform login with a generated device and returns only public session data", async () => {
    const response = await login(
      request({ email: "ada@example.com", password: "secret" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(identity);
    const [path, init] = mocks.apiFetch.mock.calls[0];
    expect(path).toBe("/v1/auth/login");
    const device = new Headers(init.headers).get("X-Device-Id");
    expect(device).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.begin).toHaveBeenCalledWith(tokens, device);
    expect(response.headers.get("set-cookie")).toContain(cookieName());
  });
  it("keeps an MFA challenge on the server and binds verification to its cookie, scope and device", async () => {
    mocks.apiFetch.mockResolvedValueOnce(
      Response.json({
        mfa_required: true,
        challenge_token: "private-challenge-value-2026",
        expires_in: 300,
      }),
    );
    const response = await login(
      request({ email: "ada@example.com", password: "secret" }),
    );
    const result = await response.json();
    expect(result.mfa_required).toBe(true);
    expect(result.challenge_token).toBeUndefined();
    const [id, attempt] = [...mocks.values.entries()][0];
    expect(attempt.challenge).toBe("private-challenge-value-2026");
    expect(mocks.begin).not.toHaveBeenCalled();
    const wrong = await verify(
      request({ code: "123456", scope: "old" }, `${attemptCookie()}=${id}`),
    );
    expect(wrong.status).toBe(409);
    const verified = await verify(
      request(
        { code: "RECOVERY-123", scope: result.scope },
        `${attemptCookie()}=${id}`,
      ),
    );
    expect(verified.status).toBe(200);
    expect(mocks.values.has(id)).toBe(false);
    const [path, init] = mocks.apiFetch.mock.calls[1];
    expect(path).toBe("/v1/auth/two-factor/verify");
    expect(new Headers(init.headers).get("X-Device-Id")).toBe(attempt.deviceId);
    expect(JSON.parse(init.body)).toEqual({
      challenge_token: attempt.challenge,
      code: "RECOVERY-123",
    });
    expect(mocks.begin).toHaveBeenCalledWith(tokens, attempt.deviceId);
    expect(
      (
        await verify(
          request(
            { code: "123456", scope: result.scope },
            `${attemptCookie()}=${id}`,
          ),
        )
      ).status,
    ).toBe(401);
  });
  it("does not accept a browser-supplied backend MFA challenge without its attempt cookie", async () => {
    expect(
      (
        await verify(
          request({
            challenge_token: "forged",
            code: "123456",
            scope: "a".repeat(32),
          }),
        )
      ).status,
    ).toBe(401);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
  it("keeps an existing signed-in session instead of silently replacing its account", async () => {
    mocks.get.mockResolvedValue({ user });
    expect(
      (
        await login(
          request(
            { email: "other@example.com", password: "secret" },
            `${cookieName()}=${"a".repeat(64)}`,
          ),
        )
      ).status,
    ).toBe(409);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and oversized sign-in requests before identity calls", async () => {
    expect(
      (
        await login(
          request(
            { email: "ada@example.com", password: "secret" },
            "",
            "https://other.test",
          ),
        )
      ).status,
    ).toBe(403);
    expect((await login(request({ password: "x".repeat(20000) }))).status).toBe(
      413,
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
  it("serializes repeated verification and preserves retryable incorrect codes", async () => {
    const id = "a".repeat(64),
      scope = "b".repeat(32);
    mocks.values.set(id, {
      deviceId,
      scope,
      challenge: "private-challenge-2026",
      expiresAt: Date.now() + 60000,
    });
    mocks.locks.set(id, "other");
    expect(
      (
        await verify(
          request({ code: "123456", scope }, `${attemptCookie()}=${id}`),
        )
      ).status,
    ).toBe(409);
    mocks.locks.clear();
    mocks.apiFetch.mockResolvedValue(
      Response.json({ detail: "Incorrect code" }, { status: 400 }),
    );
    expect(
      (
        await verify(
          request({ code: "123456", scope }, `${attemptCookie()}=${id}`),
        )
      ).status,
    ).toBe(400);
    expect(mocks.values.has(id)).toBe(true);
  });
  it("revokes a new session when MFA cleanup fails before its cookie can be delivered", async () => {
    const id = "a".repeat(64),
      scope = "b".repeat(32);
    mocks.values.set(id, {
      deviceId,
      scope,
      challenge: "private-challenge-2026",
      expiresAt: Date.now() + 60000,
    });
    mocks.remove.mockRejectedValueOnce(new Error("Redis unavailable"));
    const response = await verify(
      request({ code: "123456", scope }, `${attemptCookie()}=${id}`),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.logout).toHaveBeenCalledWith("b".repeat(64));
  });
});

it("uses the explicit local staff mode without requesting a platform password session", async () => {
  const response = await login(
    request({ email: "local@example.com", password: "secret", mode: "local" }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).mode).toBe("local");
  expect(mocks.beginLocal).toHaveBeenCalledWith("local@example.com", "secret");
  expect(mocks.apiFetch).not.toHaveBeenCalled();
});
it("sets a secure HttpOnly production session cookie without exposing credentials", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const response = await login(
    request({ email: "ama@example.com", password: "secret" }),
  );
  const cookie = response.headers.get("set-cookie")!;
  expect(cookie).toContain("__Host-medapp_pms=");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toMatch(/SameSite=strict/i);
  expect(await response.text()).not.toContain("parent-access-secret");
});
it("does not complete verification after the sign-in attempt was replaced", async () => {
  const id = "a".repeat(64),
    scope = "b".repeat(32);
  mocks.values.set(id, {
    deviceId,
    scope,
    challenge: "private-challenge-2026",
    expiresAt: Date.now() + 60000,
  });
  mocks.apiFetch.mockImplementation(async (path) => {
    if (path === "/v1/auth/two-factor/verify") {
      mocks.values.delete(id);
      return Response.json(tokens);
    }
    return Response.json({ ok: true });
  });
  const response = await verify(
    request({ code: "123456", scope }, attemptCookie() + "=" + id),
  );
  expect(response.status).toBe(409);
  expect(mocks.begin).not.toHaveBeenCalled();
  expect(mocks.apiFetch.mock.calls.at(-1)?.[0]).toBe("/v1/auth/logout");
  expect(response.headers.get("set-cookie")).toBeNull();
});
