// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Handoff from "../src/app/handoff/page";
import ReturnPage from "../src/app/return/page";
import { Providers } from "../src/components/providers";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { user } from "./session-fixture";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const proof = "p".repeat(64),
  scope = "a".repeat(32),
  nextScope = "b".repeat(32);
const identity = {
  user,
  scope,
  workspace: null,
  workspaces: [],
  returnAvailable: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("BroadcastChannel", undefined);
  useAuthStore.setState({
    identity: null,
    user: null,
    scope: null,
    isAuthenticated: false,
    isHydrating: true,
    error: null,
    returnUrl: null,
  });
  window.history.replaceState(null, "", "/handoff#code=" + proof);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("hospital handoff screens", () => {
  it("retains the proof through initial session hydration, requires confirmation and navigates after the scope remount", async () => {
    const fetcher = vi.fn((path: string) =>
      Promise.resolve(
        Response.json(
          path.endsWith("/redeem")
            ? { ...identity, scope: nextScope }
            : path.endsWith("/handoff")
              ? { name: "Ada Owner", email: user.email }
              : identity,
        ),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      <Providers>
        <Handoff />
      </Providers>,
    );
    expect(await screen.findByText(user.email)).toBeVisible();
    expect(window.location.hash).toBe("");
    expect(fetcher.mock.calls.some(([path]) => path.endsWith("/redeem"))).toBe(
      false,
    );
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Continue with this account" }),
      );
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/workspaces"),
    );
    expect(useAuthStore.getState().scope).toBe(nextScope);
    expect(localStorage.length).toBe(0);
  }, 15000);
  it("shows expired links without attempting redemption", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        Promise.resolve(
          path.endsWith("/handoff")
            ? Response.json(
                { detail: "This link expired. Open a new link from MedApp." },
                { status: 410 },
              )
            : Response.json({ user: null }),
        ),
      ),
    );
    render(
      <Providers>
        <Handoff />
      </Providers>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link expired",
    );
    expect(
      screen.queryByRole("button", { name: "Continue with this account" }),
    ).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("keeps an explicit return link available after the scoped provider is replaced on sign-out", async () => {
    const url = `medapp://hospital-workspaces?handoff_state=${"s".repeat(32)}`;
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        Promise.resolve(
          Response.json(path.endsWith("/return") ? { url } : identity),
        ),
      ),
    );
    await useAuthStore.getState().hydrate();
    render(
      <Providers>
        <ReturnPage />
      </Providers>,
    );
    expect(
      await screen.findByRole("button", { name: "Close session and return" }),
    ).toBeEnabled();
    await act(async () => {
      await useAuthStore.getState().returnToApp();
    });
    expect(screen.getByRole("link", { name: "Open MedApp" })).toHaveAttribute(
      "href",
      url,
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
