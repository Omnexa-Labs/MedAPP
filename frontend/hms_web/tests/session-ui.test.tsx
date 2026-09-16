// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Login from "../src/app/login/page";
import Workspaces from "../src/app/workspaces/page";
import { Shell } from "../src/components/layout/shell";
import { Providers } from "../src/components/providers";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { hospitals, user } from "./session-fixture";
import type { Identity } from "../src/lib/session-types";
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/patients",
}));
const scope = "a".repeat(32),
  nextScope = "b".repeat(32);
const identity: Identity = {
  user,
  scope,
  workspace: null,
  workspaces: hospitals,
};
function state(value: Identity = identity) {
  useAuthStore.setState({
    identity: value,
    scope: value.scope,
    user: {
      id: user.id,
      email: user.email,
      fullName: "Ada Owner",
      role: "patient",
      hospitalId: value.workspace?.hospital_id || "",
      hospitalName: value.workspace?.hospital_name || "",
      hmsRole: value.workspace?.hms_role || "",
    },
    isAuthenticated: true,
    isHydrating: false,
    error: null,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("BroadcastChannel", undefined);
  useAuthStore.setState({
    identity: null,
    user: null,
    scope: null,
    isAuthenticated: false,
    isHydrating: false,
    error: null,
  });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("hospital sign-in and workspace UI", () => {
  it("accepts MedApp credentials and requires authenticator verification before opening workspaces", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ mfa_required: true, scope, expires_in: 300 }),
      )
      .mockResolvedValueOnce(Response.json(identity));
    vi.stubGlobal("fetch", fetcher);
    const actor = userEvent.setup();
    render(<Login />);
    await actor.type(screen.getByLabelText("Email"), "ada@example.com");
    await actor.type(screen.getByLabelText("Password"), "password123");
    await actor.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByRole("heading", { name: "Verify your sign-in" }),
    ).toBeVisible();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    await actor.type(
      screen.getByLabelText("Authenticator or recovery code"),
      "123456",
    );
    await actor.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/workspaces"),
    );
    expect(fetcher.mock.calls[0][0]).toBe("/api/session/login");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      code: "123456",
      scope,
    });
    expect(localStorage.getItem("hms_token")).toBeNull();
  }, 15000);
  it("renders failed sign-in without treating it as an authenticated session", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: "Invalid credentials" }, { status: 401 }),
        ),
    );
    const actor = userEvent.setup();
    render(<Login />);
    await actor.type(screen.getByLabelText("Email"), "ada@example.com");
    await actor.type(screen.getByLabelText("Password"), "wrong");
    await actor.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid credentials",
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
  it("selects an available hospital explicitly and changes the browser scope", async () => {
    state();
    const selected = { ...identity, scope: nextScope, workspace: hospitals[1] };
    const fetcher = vi.fn((path: string) =>
      Promise.resolve(
        Response.json(path.endsWith("/workspace") ? selected : identity),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const actor = userEvent.setup();
    render(<Workspaces />);
    await actor.click(
      await screen.findByRole("button", { name: /Hospital B/ }),
    );
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/dashboard"),
    );
    expect(useAuthStore.getState().identity?.workspace?.hospital_id).toBe(
      hospitals[1].hospital_id,
    );
    const call = fetcher.mock.calls.find(([path]) =>
      path.endsWith("/workspace"),
    )!;
    expect(
      JSON.parse((call as unknown as [string, RequestInit])[1].body as string),
    ).toEqual({ hospital_id: hospitals[1].hospital_id });
  });
  it("explains missing staff membership and offers refresh instead of an empty dashboard", async () => {
    state({ ...identity, workspaces: [] });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ...identity, workspaces: [] })),
    );
    render(<Workspaces />);
    expect(
      await screen.findByRole("heading", {
        name: "No hospital workspaces yet",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Refresh access" }),
    ).toBeEnabled();
    render(
      <Shell>
        <div>Protected clinical data</div>
      </Shell>,
    );
    expect(screen.queryByText("Protected clinical data")).toBeNull();
  });
  it("removes legacy persisted tokens and refuses to hydrate a session from local storage", async () => {
    localStorage.setItem("hms_token", "legacy-token");
    localStorage.setItem("hms_user", JSON.stringify(user));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ user: null })),
    );
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.length).toBe(0);
  });
  it("discards an older hydration response after a successful sign-in", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        path === "/api/session"
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(Response.json(identity)),
      ),
    );
    const hydration = useAuthStore.getState().hydrate();
    await useAuthStore.getState().login("ada@example.com", "password");
    finish(Response.json({ user: null }));
    await hydration;
    expect(useAuthStore.getState().scope).toBe(scope);
  });
  it("creates a fresh query cache when the hospital session scope changes", async () => {
    state({ ...identity, workspace: hospitals[0] });
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        Promise.resolve(
          Response.json(
            path.endsWith("/workspace")
              ? { ...identity, scope: nextScope, workspace: hospitals[1] }
              : { ...identity, workspace: hospitals[0] },
          ),
        ),
      ),
    );
    function CacheProbe() {
      const client = useQueryClient();
      const query = useQuery({
        queryKey: ["patient"],
        queryFn: async () => "",
        enabled: false,
      });
      return (
        <>
          <span>{query.data || "No cached patient"}</span>
          <button
            onClick={() => {
              client.setQueryData(["patient"], "Hospital A patient");
            }}
          >
            Seed patient
          </button>
        </>
      );
    }
    const actor = userEvent.setup();
    render(
      <Providers>
        <CacheProbe />
      </Providers>,
    );
    await actor.click(screen.getByRole("button", { name: "Seed patient" }));
    expect(await screen.findByText("Hospital A patient")).toBeVisible();
    await act(async () => {
      await useAuthStore.getState().selectWorkspace(hospitals[1].hospital_id);
    });
    expect(screen.getByText("No cached patient")).toBeVisible();
    expect(screen.queryByText("Hospital A patient")).toBeNull();
  });
  it("does not claim sign-out succeeded when the request never reaches the portal", async () => {
    state({ ...identity, workspace: hospitals[0] });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network unavailable")),
    );
    await expect(useAuthStore.getState().signOut()).rejects.toThrow(
      "could not be reached",
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().scope).toBe(scope);
  });
  it("reloads the live session after another tab invalidates an in-flight workspace change", async () => {
    state({ ...identity, workspace: hospitals[0] });
    const selected = { ...identity, scope: nextScope, workspace: hospitals[1] };
    let finish!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        path.endsWith("/workspace")
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(Response.json(selected)),
      ),
    );
    const changing = useAuthStore
      .getState()
      .selectWorkspace(hospitals[1].hospital_id);
    const rejected = expect(changing).rejects.toMatchObject({
      code: "session_changed",
    });
    await useAuthStore.getState().invalidate();
    expect(useAuthStore.getState().identity).toBeNull();
    finish(Response.json(selected));
    await rejected;
    await waitFor(() => expect(useAuthStore.getState().scope).toBe(nextScope));
    expect(useAuthStore.getState().isHydrating).toBe(false);
  });
  it("does not mount patient pages for a pharmacist who opens their URL directly", () => {
    state({
      ...identity,
      workspace: { ...hospitals[0], hms_role: "pharmacist" },
    });
    render(
      <Shell>
        <div>Protected clinical data</div>
      </Shell>,
    );
    expect(
      screen.getByRole("heading", {
        name: "This page is unavailable for your staff role",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Protected clinical data")).toBeNull();
  });
});
