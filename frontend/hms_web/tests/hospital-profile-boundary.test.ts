import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosHeaders, InternalAxiosRequestConfig } from "axios";
import api from "../src/lib/api/client";
import { hospitalProfileRepository as repository } from "../src/lib/repositories/hospital-profile.repository";
import { proxyPolicy } from "../src/server/proxy-policy";
import { canAccessModule } from "../src/lib/utils/permissions";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { user, hospitals } from "./session-fixture";
const previous = api.defaults.adapter;
const scope = "a".repeat(32);
beforeEach(() =>
  useAuthStore.setState({
    scope,
    identity: { user, scope, workspace: hospitals[0], workspaces: hospitals },
  }),
);
afterEach(() => {
  api.defaults.adapter = previous;
});
it("exposes only the five selected-workspace profile operations", () => {
  for (const [route, method] of [
    ["hospital-profile", "GET"],
    ["hospital-profile", "PATCH"],
    ["hospital-profile/history", "GET"],
    ["hospital-profile/publish", "POST"],
    ["hospital-profile/withdraw", "POST"],
  ])
    expect(proxyPolicy(route.split("/"), method)).toBe(`/v1/hms/${route}`);
  for (const [route, method] of [
    ["hospital-profile", "POST"],
    ["hospital-profile", "DELETE"],
    ["hospital-profile/history", "POST"],
    ["hospital-profile/publish", "GET"],
    ["hospital-profile/withdraw", "PATCH"],
    ["hospital-profile/tenant", "GET"],
    ["internal/hospital-profiles", "PATCH"],
  ])
    expect(proxyPolicy(route.split("/"), method)).toBeNull();
  expect(canAccessModule("hospital-profile", "hospital_admin")).toBe(true);
  for (const role of ["admin", "doctor", "department_head", "nurse"])
    expect(canAccessModule("hospital-profile", role)).toBe(false);
});
it("routes profile writes through the cookie BFF with displayed revision and current scope", async () => {
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
    data: {},
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    config,
  }));
  api.defaults.adapter = adapter;
  await repository.save(7, {
    description: null,
    insurance_accepted: ["NHIS", "Axa"],
  });
  await repository.publish(8);
  await repository.withdraw(9);
  await repository.history(20);
  const requests = adapter.mock.calls.map(([config]) => config);
  expect(requests.map((config) => config.url)).toEqual([
    "/api/hms/hospital-profile",
    "/api/hms/hospital-profile/publish",
    "/api/hms/hospital-profile/withdraw",
    "/api/hms/hospital-profile/history",
  ]);
  expect(JSON.parse(requests[0].data)).toEqual({
    version: 7,
    changes: { description: null, insurance_accepted: ["NHIS", "Axa"] },
  });
  expect(JSON.parse(requests[1].data)).toEqual({ version: 8 });
  expect(JSON.parse(requests[2].data)).toEqual({ version: 9 });
  expect(requests[3].params).toEqual({ offset: 20 });
  for (const config of requests) {
    expect(config.headers.get("X-Session-Scope")).toBe(scope);
    expect(config.headers.has("Authorization")).toBe(false);
  }
});
