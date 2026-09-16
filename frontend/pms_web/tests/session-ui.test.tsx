// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import Login from "@/app/login/page";
import { Shell } from "@/components/layout/shell";
import { Providers } from "@/components/providers";
import { useAuthStore } from "@/lib/stores/auth.store";
import { identity } from "./session-fixture";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/inventory",
}));
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
function signedIn() {
  useAuthStore.setState({
    identity,
    scope: identity.scope,
    user: { ...identity.user, fullName: identity.user.full_name },
    isAuthenticated: true,
  });
}
it("requires MedApp MFA before opening the pharmacy and never persists tokens in browser storage", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        mfa_required: true,
        scope: "c".repeat(32),
        expires_in: 300,
      }),
    )
    .mockResolvedValueOnce(Response.json(identity));
  vi.stubGlobal("fetch", fetcher);
  const actor = userEvent.setup();
  render(<Login />);
  expect(screen.getByLabelText("Email")).toHaveValue("");
  expect(screen.getByLabelText("Password")).toHaveValue("");
  await actor.type(screen.getByLabelText("Email"), "ama@example.com");
  await actor.type(screen.getByLabelText("Password"), "password123");
  await actor.click(
    screen.getByRole("button", { name: "Sign in with MedApp" }),
  );
  const code = await screen.findByLabelText("Authenticator or recovery code");
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  expect(router.replace).not.toHaveBeenCalled();
  await actor.type(code, "RECOVERY-123");
  await actor.click(screen.getByRole("button", { name: "Verify and sign in" }));
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith("/dashboard"),
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    email: "ama@example.com",
    password: "password123",
    mode: "medapp",
  });
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    code: "RECOVERY-123",
    scope: "c".repeat(32),
  });
  expect(localStorage.length).toBe(0);
}, 15000);
it("offers local staff login explicitly and clears the previous password when the account mode changes", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ ...identity, mode: "local" }));
  vi.stubGlobal("fetch", fetcher);
  const actor = userEvent.setup();
  render(<Login />);
  await actor.type(screen.getByLabelText("Password"), "old-password");
  await actor.click(screen.getByLabelText("Local staff account"));
  expect(screen.getByLabelText("Password")).toHaveValue("");
  await actor.type(screen.getByLabelText("Email"), "local@example.com");
  await actor.type(screen.getByLabelText("Password"), "local-password");
  await actor.click(
    screen.getByRole("button", { name: "Sign in as local staff" }),
  );
  await waitFor(() =>
    expect(useAuthStore.getState().identity?.mode).toBe("local"),
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body).mode).toBe("local");
}, 15000);
it("shows failed sign-in and allows correction without opening clinical screens", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { detail: "Check your email address and password." },
          { status: 401 },
        ),
      ),
  );
  const actor = userEvent.setup();
  render(<Login />);
  await actor.type(screen.getByLabelText("Email"), "ama@example.com");
  await actor.type(screen.getByLabelText("Password"), "wrong");
  await actor.click(
    screen.getByRole("button", { name: "Sign in with MedApp" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Check your email",
  );
  expect(
    screen.getByRole("button", { name: "Sign in with MedApp" }),
  ).toBeEnabled();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(router.replace).not.toHaveBeenCalled();
});
it("keeps the verification screen available after an incorrect code", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          mfa_required: true,
          scope: "c".repeat(32),
          expires_in: 300,
        }),
      )
      .mockResolvedValue(
        Response.json({ detail: "Incorrect code" }, { status: 400 }),
      ),
  );
  const actor = userEvent.setup();
  render(<Login />);
  await actor.type(screen.getByLabelText("Email"), "ama@example.com");
  await actor.type(screen.getByLabelText("Password"), "password");
  await actor.click(
    screen.getByRole("button", { name: "Sign in with MedApp" }),
  );
  await actor.type(
    await screen.findByLabelText("Authenticator or recovery code"),
    "123456",
  );
  await actor.click(screen.getByRole("button", { name: "Verify and sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect code");
  expect(
    screen.getByRole("button", { name: "Start sign-in again" }),
  ).toBeEnabled();
  await actor.click(
    screen.getByRole("button", { name: "Start sign-in again" }),
  );
  expect(screen.getByLabelText("Password")).toHaveValue("");
}, 15000);
it("blocks operational screens when the session check fails and exposes a retry", () => {
  signedIn();
  useAuthStore.setState({
    error: "The pharmacy service could not be reached.",
  });
  render(
    <Shell>
      <p>Clinical records</p>
    </Shell>,
  );
  expect(screen.queryByText("Clinical records")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("could not be reached");
  expect(
    screen.getByRole("button", { name: "Retry session check" }),
  ).toBeVisible();
});
it("remounts forms and clears the old query cache when the session scope changes", async () => {
  signedIn();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async () =>
        Response.json(useAuthStore.getState().identity),
      ),
  );
  const clients: QueryClient[] = [];
  function ClinicalForm() {
    const client = useQueryClient();
    if (!clients.includes(client)) clients.push(client);
    useQuery({
      queryKey: ["patient"],
      queryFn: async () => "Old patient",
      initialData: "Old patient",
    });
    const [draft, setDraft] = useState("");
    return (
      <input
        aria-label="Dispensing note"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  }
  const actor = userEvent.setup();
  render(
    <Providers>
      <ClinicalForm />
    </Providers>,
  );
  await actor.type(screen.getByLabelText("Dispensing note"), "private draft");
  const old = clients[0];
  await act(async () => {
    useAuthStore.setState({
      identity: { ...identity, scope: "b".repeat(32) },
      scope: "b".repeat(32),
    });
  });
  expect(screen.getByLabelText("Dispensing note")).toHaveValue("");
  expect(clients.at(-1)).not.toBe(old);
  expect(old.getQueryCache().getAll()).toHaveLength(0);
});
it("ignores an old hydration response after a newer successful sign-in", async () => {
  const old = Promise.withResolvers<Response>();
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(Response.json(identity));
  vi.stubGlobal("fetch", fetcher);
  localStorage.setItem("pms_token", "legacy-secret");
  const reading = useAuthStore.getState().hydrate();
  await useAuthStore.getState().login("ama@example.com", "password");
  old.resolve(Response.json({ user: null }));
  await reading;
  expect(useAuthStore.getState().scope).toBe(identity.scope);
  expect(localStorage.getItem("pms_token")).toBeNull();
});
it("confirms logout using the current scope before removing authenticated state", async () => {
  signedIn();
  const pending = Promise.withResolvers<Response>();
  const fetcher = vi.fn().mockReturnValue(pending.promise);
  vi.stubGlobal("fetch", fetcher);
  const leaving = useAuthStore.getState().signOut();
  expect(useAuthStore.getState().isAuthenticated).toBe(true);
  expect(
    new Headers(fetcher.mock.calls[0][1].headers).get("X-Session-Scope"),
  ).toBe(identity.scope);
  pending.resolve(Response.json({ signed_out: true }));
  await leaving;
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
