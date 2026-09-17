// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MedAppDeliveries } from "../src/components/transactions/medapp-deliveries";
import {
  deliveriesRepo as repo,
  type MedAppDelivery,
} from "../src/lib/repositories/medapp-deliveries";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { proxyPolicy } from "../src/server/proxy-policy";
import { identity, user } from "./session-fixture";

vi.mock("../src/lib/repositories/medapp-deliveries", () => ({
  deliveriesRepo: { page: vi.fn(), retry: vi.fn() },
}));
const row: MedAppDelivery = {
  id: "22222222-2222-4222-8222-222222222222",
  sequence: 3,
  kind: "corrected",
  state: "attention_required",
  version: 4,
  attempts: 12,
  created_at: "2026-09-16T12:00:00Z",
  next_attempt_at: "2026-09-16T12:10:00Z",
  delivered_at: null,
  last_error: "retry_limit_reached",
  can_retry: true,
};
let qc: QueryClient;
function show() {
  return render(
    <QueryClientProvider client={qc}>
      <MedAppDeliveries rxId={row.id} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({
    identity,
    scope: identity.scope,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: "pharmacist",
    },
    isAuthenticated: true,
  });
  vi.mocked(repo.page).mockResolvedValue({
    items: [row],
    total: 1,
    limit: 25,
    offset: 0,
  });
  vi.mocked(repo.retry).mockResolvedValue({
    ...row,
    state: "pending",
    version: 5,
  });
});
afterEach(() => {
  cleanup();
  qc.clear();
});
it("shows pending, delivered and attention states with receipt times", async () => {
  vi.mocked(repo.page).mockResolvedValue({
    items: [
      row,
      {
        ...row,
        id: "second",
        sequence: 2,
        state: "delivered",
        delivered_at: "2026-09-16T12:01:00Z",
        last_error: null,
        can_retry: false,
      },
    ],
    total: 2,
    limit: 25,
    offset: 0,
  });
  show();
  expect(
    await screen.findByText(/Update 3 · corrected · Needs attention/),
  ).toBeVisible();
  expect(
    screen.getByText(/Update 2 · corrected · Received by MedApp/),
  ).toBeVisible();
  expect(screen.queryByText("Retry update 2")).not.toBeInTheDocument();
});
it("keeps the same request key after a lost retry response", async () => {
  vi.mocked(repo.retry).mockRejectedValueOnce(new Error("Connection lost"));
  show();
  fireEvent.click(await screen.findByText("Retry update 3"));
  fireEvent.click(screen.getByText("Queue retry"));
  fireEvent.click(await screen.findByText("Retry same request"));
  await waitFor(() => expect(repo.retry).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(repo.retry).mock.calls;
  expect(calls[0][2]).toBe(calls[1][2]);
  expect(calls[0][1].version).toBe(4);
  await waitFor(() =>
    expect(screen.queryByText("Queue retry")).not.toBeInTheDocument(),
  );
});
it("keeps read access for cashiers while hiding retry controls", async () => {
  useAuthStore.setState({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: "cashier",
    },
  });
  show();
  await screen.findByText(/Update 3 · corrected/);
  expect(screen.queryByText("Retry update 3")).not.toBeInTheDocument();
});
it("does not turn a failed read into an empty delivery history", async () => {
  vi.mocked(repo.page).mockRejectedValueOnce(new Error("Unavailable"));
  show();
  await screen.findByRole("alert");
  expect(screen.queryByText(/No delivery reports/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Retry loading"));
  await screen.findByText(/Update 3 · corrected/);
});
it("only exposes delivery read and retry paths through the portal proxy", () => {
  const parts = ["prescriptions", row.id, "medapp-deliveries"];
  expect(proxyPolicy(parts, "GET")).toBe("/v1/" + parts.join("/"));
  expect(proxyPolicy([...parts, row.id, "retry"], "POST")).toBeTruthy();
  expect(proxyPolicy(parts, "POST")).toBeNull();
  expect(proxyPolicy([...parts, row.id], "PATCH")).toBeNull();
});
