import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const fake = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/server/runtime", () => ({ sessions: fake }));
import { GET, POST, PATCH } from "../src/app/api/pms/[...path]/route";
const params = (path: string[]) => ({ params: Promise.resolve({ path }) });

it.each([
  ["sales"],
  ["prescriptions"],
  ["sales", "22222222-2222-4222-8222-222222222222", "void"],
  ["prescriptions", "22222222-2222-4222-8222-222222222222", "dispense"],
  ["prescriptions", "22222222-2222-4222-8222-222222222222", "cancel"],
  ["sales", "22222222-2222-4222-8222-222222222222", "corrections"],
  ["sales", "22222222-2222-4222-8222-222222222222", "refunds"],
  ["sales", "22222222-2222-4222-8222-222222222222", "reconcile-prescription"],
  [
    "sales",
    "22222222-2222-4222-8222-222222222222",
    "refunds",
    "33333333-3333-4333-8333-333333333333",
    "void",
  ],
])("requires and forwards a transaction replay key for %j", async (...path) => {
  expect(
    (await POST(request("POST", { "Idempotency-Key": "" }, "{}"), params(path)))
      .status,
  ).toBe(400);
  expect(fake.request).not.toHaveBeenCalled();
  expect((await POST(request("POST", {}, "{}"), params(path))).status).toBe(
    200,
  );
  expect(
    new Headers(fake.request.mock.calls[0][3].headers).get("idempotency-key"),
  ).toBe("11111111-1111-4111-8111-111111111111");
});
it.each([
  ["sales", "quote"],
  ["prescriptions", "22222222-2222-4222-8222-222222222222", "quote"],
  ["sales", "22222222-2222-4222-8222-222222222222", "corrections", "quote"],
])("allows price review without a write key for %j", async (...path) => {
  expect(
    (await POST(request("POST", { "Idempotency-Key": "" }, "{}"), params(path)))
      .status,
  ).toBe(200);
  expect(
    new Headers(fake.request.mock.calls[0][3].headers).has("idempotency-key"),
  ).toBe(false);
});
function request(
  method = "GET",
  headers: Record<string, string> = {},
  body?: string,
) {
  return new NextRequest("http://localhost/api/pms/drugs?page=2", {
    method,
    body,
    headers: {
      Cookie: "medapp_pms=" + "a".repeat(64),
      Origin: "http://localhost",
      "X-Session-Scope": "scope",
      "Content-Type": "application/json",
      "Idempotency-Key": "11111111-1111-4111-8111-111111111111",
      ...headers,
    },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PMS_WEB_ORIGIN", "http://localhost");
  fake.request.mockImplementation(async () => Response.json({ items: [] }));
});
it("forwards bounded photo bytes and a version with safe headers", async () => {
  const response = await POST(
    request(
      "POST",
      { "Content-Type": "image/png", "If-Match": "7", Authorization: "forged" },
      "photo bytes",
    ),
    params(["pharmacy-profile", "photo"]),
  );
  expect(response.status).toBe(200);
  const init = fake.request.mock.calls[0][3];
  expect(new Headers(init.headers).get("if-match")).toBe("7");
  expect(new Headers(init.headers).get("content-type")).toBe("image/png");
  expect(new Headers(init.headers).has("authorization")).toBe(false);
  expect(new TextDecoder().decode(init.body)).toBe("photo bytes");
});
it.each([
  [{ "Content-Type": "image/svg+xml", "If-Match": "1" }, "photo", 415],
  [{ "Content-Type": "image/png" }, "photo", 400],
  [
    { "Content-Type": "image/png", "If-Match": "1" },
    "x".repeat(8 * 1024 * 1024 + 1),
    413,
  ],
] as const)("rejects invalid photo requests", async (headers, body, status) => {
  expect(
    (
      await POST(
        request("POST", headers, body),
        params(["pharmacy-profile", "photo"]),
      )
    ).status,
  ).toBe(status);
  expect(fake.request).not.toHaveBeenCalled();
});
it("returns private photo content with no-store and nosniff headers", async () => {
  fake.request.mockResolvedValue(
    new Response("jpeg", { headers: { "Content-Type": "image/jpeg" } }),
  );
  const response = await GET(
    request(),
    params([
      "pharmacy-profile",
      "photos",
      "11111111-1111-4111-8111-111111111111",
    ]),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await response.text()).toBe("jpeg");
});
it("forwards only the selected PMS path, scope, body and safe headers", async () => {
  const response = await POST(
    request(
      "POST",
      {
        Authorization: "Bearer browser-value",
        "X-Activation-Secret": "forged",
      },
      '{"name":"Aspirin"}',
    ),
    params(["drugs"]),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const [id, scope, path, init] = fake.request.mock.calls[0];
  expect(id).toBe("a".repeat(64));
  expect(scope).toBe("scope");
  expect(path).toBe("/v1/drugs?page=2");
  expect(Object.fromEntries(init.headers)).toEqual({
    "content-type": "application/json",
    "idempotency-key": "11111111-1111-4111-8111-111111111111",
  });
  expect(new TextDecoder().decode(init.body)).toBe('{"name":"Aspirin"}');
});
it.each([
  "auth/login",
  "internal/pharmacy-activations",
  "dev/seed",
  "integrations/stock",
  "drugs/../staff",
  "https://other",
])("denies unlisted route %s", async (path) => {
  expect((await GET(request(), params(path.split("/")))).status).toBe(404);
  expect(fake.request).not.toHaveBeenCalled();
});
it("rejects cross-site writes before reaching the PMS", async () => {
  expect(
    (
      await POST(
        request("POST", { Origin: "https://other.example" }, "{}"),
        params(["drugs"]),
      )
    ).status,
  ).toBe(403);
  expect(fake.request).not.toHaveBeenCalled();
});
it("rejects oversized bodies without trusting a missing content-length header", async () => {
  expect(
    (
      await POST(
        request("POST", {}, "a".repeat(128 * 1024 + 1)),
        params(["drugs"]),
      )
    ).status,
  ).toBe(413);
  expect(fake.request).not.toHaveBeenCalled();
});
it("does not forward writes without an opaque session cookie", async () => {
  expect(
    (await POST(request("POST", { Cookie: "" }, "{}"), params(["sales"])))
      .status,
  ).toBe(401);
  expect(fake.request).not.toHaveBeenCalled();
});
it("keeps internal errors and secrets out of the response", async () => {
  fake.request.mockResolvedValue(
    Response.json({ detail: "password=server-secret" }, { status: 500 }),
  );
  const response = await GET(request(), params(["drugs"]));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("server-secret");
});
it.each(["", "not-a-uuid"])(
  "rejects invalid inventory receipt keys %s",
  async (key) => {
    expect(
      (
        await POST(
          request("POST", { "Idempotency-Key": key }, "{}"),
          params(["batches"]),
        )
      ).status,
    ).toBe(400);
    expect(fake.request).not.toHaveBeenCalled();
  },
);
it.each([
  { path: ["reports", "dashboard"] },
  { path: ["sales", "22222222-2222-4222-8222-222222222222", "corrections"] },
  { path: ["sales", "22222222-2222-4222-8222-222222222222", "refunds"] },
  { path: ["batches", "11111111-1111-4111-8111-111111111111", "movements"] },
])("allows inventory read route $path", async ({ path }) => {
  expect((await GET(request(), params(path))).status).toBe(200);
});
it("forwards the purchase draft version and replay key through the scoped proxy", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const response = await PATCH(
    request("PATCH", {}, '{"version":2,"notes":"Checked"}'),
    params(["purchase-orders", id]),
  );
  expect(response.status).toBe(200);
  const [, scope, path, init] = fake.request.mock.calls[0];
  expect(scope).toBe("scope");
  expect(path).toContain("/v1/purchase-orders/" + id);
  expect(init.method).toBe("PATCH");
  expect(init.headers.get("Idempotency-Key")).toBe(
    "11111111-1111-4111-8111-111111111111",
  );
  expect(new TextDecoder().decode(init.body)).toBe(
    '{"version":2,"notes":"Checked"}',
  );
});
it.each(["send", "cancel", "receive", "reconcile"])(
  "requires a key for purchase action %s",
  async (action) => {
    const response = await POST(
      request("POST", { "Idempotency-Key": "" }, "{}"),
      params([
        "purchase-orders",
        "22222222-2222-4222-8222-222222222222",
        action,
      ]),
    );
    expect(response.status).toBe(400);
    expect(fake.request).not.toHaveBeenCalled();
  },
);
it("allows purchase history reads under the current session", async () => {
  const response = await GET(
    request(),
    params([
      "purchase-orders",
      "22222222-2222-4222-8222-222222222222",
      "history",
    ]),
  );
  expect(response.status).toBe(200);
});
