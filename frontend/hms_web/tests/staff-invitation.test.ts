import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fixture, tokens, deviceId, hospitals } from "./session-fixture";
import { cookieName } from "../src/server/http";
import { proxyPolicy } from "../src/server/proxy-policy";
const runtime = vi.hoisted(() => ({
  sessions: null as unknown,
  apiFetch: vi.fn(),
}));
vi.mock("../src/server/runtime", () => runtime);
import { POST } from "../src/app/api/session/invitation/[action]/route";
let f: ReturnType<typeof fixture>, id: string, scope: string;
const code = "i".repeat(43),
  staffId = "44444444-4444-4444-8444-444444444444";
const details = {
  hospital_id: hospitals[0].hospital_id,
  hospital_name: hospitals[0].hospital_name,
  email: "ada@example.com",
  hms_role: "nurse",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  accepted: false,
};
beforeEach(async () => {
  vi.stubEnv("HMS_WEB_ORIGIN", "https://hospital.test");
  f = fixture();
  runtime.sessions = f.manager;
  const original = f.api.getMockImplementation()!;
  f.api.mockImplementation(async (path, init) =>
    path.endsWith("/staff-invitations/inspect")
      ? Response.json({ ...details, access_token: "must-not-leak" })
      : path.endsWith("/staff-invitations/accept")
        ? Response.json({
            hospital_id: hospitals[0].hospital_id,
            staff_id: staffId,
            already_joined: false,
            refresh_token: "must-not-leak",
          })
        : original(path, init),
  );
  const login = await f.manager.begin(tokens, deviceId);
  id = login.id;
  scope = login.identity.scope;
});
afterEach(() => vi.unstubAllEnvs());
function request(
  body: unknown = { code },
  headers: Record<string, string> = {},
) {
  return new NextRequest(
    "https://hospital.test/api/session/invitation/inspect",
    {
      method: "POST",
      headers: {
        Cookie: `${cookieName()}=${id}`,
        Origin: "https://hospital.test",
        "Content-Type": "application/json",
        "X-Session-Scope": scope,
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
}
const context = (action = "inspect") => ({
  params: Promise.resolve({ action }),
});
it("previews and accepts with the server's platform session before any workspace is selected", async () => {
  const preview = await POST(request(), context());
  expect(preview.status).toBe(200);
  expect(await preview.json()).toEqual(details);
  const response = await POST(request(), context("accept"));
  expect(await response.json()).toEqual({
    hospital_id: hospitals[0].hospital_id,
    staff_id: staffId,
    already_joined: false,
  });
  const call = f.api.mock.calls.find(([path]) =>
    path.endsWith("/staff-invitations/accept"),
  )!;
  expect(new Headers(call[1]?.headers).get("Authorization")).toBe(
    `Bearer ${tokens.access_token}`,
  );
  expect(new Headers(call[1]?.headers).get("X-Device-Id")).toBe(deviceId);
  expect((await f.store.get(id))?.workspace).toBeNull();
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("rotates parent credentials before acceptance and preserves the resulting session", async () => {
  f.advance(900000);
  expect((await POST(request(), context("accept"))).status).toBe(200);
  const sent = f.api.mock.calls.find(([path]) =>
    path.endsWith("/staff-invitations/accept"),
  )!;
  expect(new Headers(sent[1]?.headers).get("Authorization")).toBe(
    "Bearer platform-access-after",
  );
  expect(
    f.api.mock.calls.filter(([path]) => path === "/v1/auth/refresh"),
  ).toHaveLength(1);
});
it.each([
  [{ code }, { Origin: "https://other.test" }, "inspect", 403],
  [{ code }, { Cookie: "" }, "inspect", 401],
  [{ code }, { "X-Session-Scope": "old" }, "inspect", 409],
  [{ code, hospital_id: hospitals[1].hospital_id }, {}, "accept", 400],
  [{ code: "bad" }, {}, "accept", 400],
  [{ code }, {}, "logout", 404],
] as const)(
  "rejects invalid invitation boundary requests %#",
  async (body, headers, action, status) => {
    expect((await POST(request(body, headers), context(action))).status).toBe(
      status,
    );
    expect(
      f.api.mock.calls.some(([path]) => path.includes("staff-invitations")),
    ).toBe(false);
  },
);
it("does not replay an acceptance when the backend reports an error", async () => {
  f.api.mockImplementationOnce(async () =>
    Response.json(
      { detail: "This invitation is unavailable." },
      { status: 410 },
    ),
  );
  expect((await POST(request(), context("accept"))).status).toBe(410);
  expect(
    f.api.mock.calls.filter(([path]) =>
      path.endsWith("/staff-invitations/accept"),
    ),
  ).toHaveLength(1);
});
it("rejects a delayed reply after the browser session is removed", async () => {
  let resolve!: (response: Response) => void;
  f.api.mockImplementationOnce(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const pending = POST(request(), context());
  await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
  await f.store.remove(id);
  resolve(Response.json(details));
  expect((await pending).status).toBe(401);
});
it("adds only the finite team routes to the hospital proxy", () => {
  expect(proxyPolicy(["team", "invitations"], "POST")).toBe(
    "/v1/hms/team/invitations",
  );
  expect(proxyPolicy(["team", "invitations", staffId], "DELETE")).toBeTruthy();
  expect(proxyPolicy(["team", "memberships", staffId], "PATCH")).toBeTruthy();
  expect(proxyPolicy(["staff", staffId], "DELETE")).toBeNull();
  expect(proxyPolicy(["team", "memberships"], "POST")).toBeNull();
  expect(
    proxyPolicy(["auth", "staff-invitations", "accept"], "POST"),
  ).toBeNull();
});
