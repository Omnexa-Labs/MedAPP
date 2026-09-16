import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import api from "../src/lib/api/client";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { hospitals, user } from "./session-fixture";
const scope = "a".repeat(32);
beforeEach(() => {
  useAuthStore.setState({
    scope,
    identity: { user, scope, workspace: hospitals[0], workspaces: hospitals },
  });
});
describe("hospital browser API", () => {
  it("uses only the local BFF and current scope, without a browser bearer token", async () => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
      data: {},
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config,
    }));
    await api.get("/v1/patients", {
      headers: { Authorization: "Bearer obsolete" },
      adapter,
    });
    const config = adapter.mock.calls[0][0];
    expect(config.url).toBe("/api/hms/patients");
    expect(config.headers.get("Authorization")).toBeUndefined();
    expect(config.headers.get("X-Session-Scope")).toBe(scope);
  });
  it("rejects late results from a previous hospital before they can enter a query cache", async () => {
    let finish!: () => void;
    const adapter = vi.fn(
      (config: InternalAxiosRequestConfig) =>
        new Promise<any>((resolve) => {
          finish = () =>
            resolve({
              data: { patient: "old" },
              status: 200,
              statusText: "OK",
              headers: new AxiosHeaders(),
              config,
            });
        }),
    );
    const pending = api.get("/v1/patients", { adapter });
    const rejected = expect(pending).rejects.toMatchObject({
      code: "ERR_CANCELED",
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    useAuthStore.setState({ scope: "b".repeat(32) });
    finish();
    await rejected;
  });
  it("makes no clinical request until a hospital has been selected", async () => {
    useAuthStore.setState({
      identity: { user, scope, workspace: null, workspaces: hospitals },
    });
    const adapter = vi.fn();
    await expect(api.get("/v1/patients", { adapter })).rejects.toMatchObject({
      code: "ERR_CANCELED",
    });
    expect(adapter).not.toHaveBeenCalled();
  });
});
