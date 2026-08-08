// An expired access token used to brick the app.
//
// `client.ts` had no 401 handling, `query-client.ts` refuses to retry 4xx, and
// nothing informed the auth store — so `isAuthenticated` stayed true, the (app)
// guard kept the user inside, and every screen showed nothing forever. Only a
// cold restart recovered.
//
// These cases lock the replacement: one refresh, one retry, ONE refresh shared
// by concurrent failures, and a signed-out user when renewal is impossible.

// `@/lib/config` resolves app.config.ts extras at require time and THROWS when
// they are absent, which they are under Jest. The client imports it for the
// base URL only.
jest.mock("@/lib/config", () => ({
  config: {
    appEnv: "dev",
    apiBaseUrl: "http://api.test",
    partnerOnboardingUrl: "http://partner.test",
  },
}));

import { ApiError } from "@/types/api";
import {
  client,
  registerAuthTokenProvider,
  registerSessionRefresher,
  __resetAuthRefreshForTests,
} from "../client";

function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = jest.fn();

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Lets pending fetch/refresh microtasks settle without faking timers. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("api client 401 handling", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    __resetAuthRefreshForTests();
    registerAuthTokenProvider(() => "access-token");
  });

  afterEach(() => {
    __resetAuthRefreshForTests();
    registerAuthTokenProvider(() => null);
  });

  it("refreshes once and retries the request once", async () => {
    const refresher = jest.fn(async () => true);
    registerSessionRefresher(refresher);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: "token expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(client.get("/v1/me")).resolves.toEqual({ ok: true });

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares ONE refresh across concurrent 401s", async () => {
    // The failure this prevents: N parallel queries on a screen each start
    // their own refresh. The backend rotates the refresh token on every call,
    // so refreshes 2..N present a token the first already consumed and the
    // user is signed out of a session that had just been renewed.
    const gate = deferred<void>();
    let refreshed = false;
    const refresher = jest.fn(async () => {
      await gate.promise;
      refreshed = true;
      return true;
    });
    registerSessionRefresher(refresher);

    // Every request 401s until the shared refresh has completed.
    fetchMock.mockImplementation(async () =>
      refreshed ? jsonResponse(200, { ok: true }) : jsonResponse(401),
    );

    const inflight = Promise.all([
      client.get("/v1/a"),
      client.get("/v1/b"),
      client.get("/v1/c"),
    ]);

    // All three have 401'd and are queued on the shared refresh by now.
    await flush();
    gate.resolve();

    await expect(inflight).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refresher).toHaveBeenCalledTimes(1);
    // 3 initial 401s + 3 retries. No request refreshed twice.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("allows a NEW refresh after the shared one settles", async () => {
    // The single-flight must not be a one-shot latch — a later expiry needs
    // its own refresh.
    const refresher = jest.fn(async () => true);
    registerSessionRefresher(refresher);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(200, { n: 1 }))
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(200, { n: 2 }));

    await client.get("/v1/one");
    await client.get("/v1/two");

    expect(refresher).toHaveBeenCalledTimes(2);
  });

  it("surfaces the 401 when refresh fails, and does not retry", async () => {
    // The refresher signs the user out itself (see auth-store); the client's
    // job is only to stop pretending the request can succeed.
    const refresher = jest.fn(async () => false);
    registerSessionRefresher(refresher);
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: "expired" }));

    await expect(client.get("/v1/me")).rejects.toMatchObject({ status: 401 });

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not loop when the retry also 401s", async () => {
    const refresher = jest.fn(async () => true);
    registerSessionRefresher(refresher);
    fetchMock.mockResolvedValue(jsonResponse(401));

    await expect(client.get("/v1/me")).rejects.toBeInstanceOf(ApiError);

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never refreshes for withAuth:false — that is the refresh call itself", async () => {
    // `authApi.refresh` and `authApi.signOut` pass withAuth:false. If their own
    // 401 re-entered this path it would recurse until the stack died.
    const refresher = jest.fn(async () => true);
    registerSessionRefresher(refresher);
    fetchMock.mockResolvedValue(jsonResponse(401));

    await expect(
      client.post("/v1/auth/refresh", { refresh_token: "x" }, { withAuth: false }),
    ).rejects.toMatchObject({ status: 401 });

    expect(refresher).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves non-401 failures alone", async () => {
    const refresher = jest.fn(async () => true);
    registerSessionRefresher(refresher);
    fetchMock.mockResolvedValue(jsonResponse(403, { detail: "forbidden" }));

    await expect(client.get("/v1/me")).rejects.toMatchObject({ status: 403 });

    expect(refresher).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not refresh for an aborted request", async () => {
    // Nobody is waiting on an unmounted screen's query; renewing the session
    // for it is work with no reader.
    const refresher = jest.fn(async () => true);
    registerSessionRefresher(refresher);
    fetchMock.mockResolvedValue(jsonResponse(401));
    const controller = new AbortController();
    controller.abort();

    await expect(client.get("/v1/me", { signal: controller.signal })).rejects.toMatchObject({
      status: 401,
    });

    expect(refresher).not.toHaveBeenCalled();
  });

  it("surfaces the 401 when no refresher is registered", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401));

    await expect(client.get("/v1/me")).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
