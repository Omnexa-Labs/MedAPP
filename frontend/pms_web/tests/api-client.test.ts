import { beforeEach, expect, it, vi } from "vitest";
import {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import api from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth.store";
import { identity } from "./session-fixture";
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    identity,
    scope: identity.scope,
    isAuthenticated: true,
    isHydrating: false,
    error: null,
  });
});
it("uses a same-origin route and scope header without a bearer token", async () => {
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
    data: [],
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    config,
  }));
  await api.get("/v1/drugs", {
    adapter,
    baseURL: "https://wrong.example",
    headers: { Authorization: "Bearer client-token" },
  });
  const config = adapter.mock.calls[0][0];
  expect(config.url).toBe("/api/pms/drugs");
  expect(config.baseURL).toBe("");
  expect(config.headers.get("Authorization")).toBeUndefined();
  expect(config.headers.get("X-Session-Scope")).toBe(identity.scope);
});
it.each(["success", "failure"])(
  "cancels a delayed %s from the previous account without clearing the new session",
  async (kind) => {
    const ready = Promise.withResolvers<void>(),
      pending = Promise.withResolvers<AxiosResponse>();
    let sent!: InternalAxiosRequestConfig;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      sent = config;
      ready.resolve();
      return pending.promise;
    };
    const work = api.get("/v1/customers", { adapter });
    const outcome = expect(work).rejects.toMatchObject({
      code: "ERR_CANCELED",
    });
    await ready.promise;
    useAuthStore.setState({
      identity: { ...identity, scope: "b".repeat(32) },
      scope: "b".repeat(32),
    });
    if (kind === "success")
      pending.resolve({
        data: ["old patient"],
        status: 200,
        statusText: "OK",
        headers: new AxiosHeaders(),
        config: sent,
      });
    else
      pending.reject(
        new AxiosError("Expired", "ERR_BAD_REQUEST", sent, undefined, {
          data: {},
          status: 401,
          statusText: "Expired",
          headers: new AxiosHeaders(),
          config: sent,
        }),
      );
    await outcome;
    expect(useAuthStore.getState().scope).toBe("b".repeat(32));
  },
);
it("does not start an operation after sign-out", async () => {
  useAuthStore.setState({
    identity: null,
    scope: null,
    isAuthenticated: false,
  });
  const adapter = vi.fn();
  await expect(api.post("/v1/sales", {}, { adapter })).rejects.toMatchObject({
    code: "ERR_CANCELED",
  });
  expect(adapter).not.toHaveBeenCalled();
});
