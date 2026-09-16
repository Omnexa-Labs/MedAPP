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
import {
  CorrectionEditor,
  ReconcileEditor,
  RefundEditor,
  RefundVoidEditor,
} from "../src/components/transactions/correction-editors";
import { SaleAdjustments } from "../src/components/transactions/sale-adjustments";
import { ReportsScreen } from "../src/components/transactions/reports-screen";
import {
  correctionsRepo as repo,
  type Correction,
  type Refund,
} from "../src/lib/repositories/sale-corrections";
import { reportsRepo } from "../src/lib/repositories/reports";
import {
  prescriptionsRepo,
  type Prescription,
} from "../src/lib/repositories/prescriptions";
import type { Sale } from "../src/lib/repositories/sales";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { identity, user } from "./session-fixture";
import { formatCents } from "../src/lib/utils";

vi.mock("../src/lib/repositories/sale-corrections", () => ({
  correctionsRepo: {
    list: vi.fn(),
    refunds: vi.fn(),
    quote: vi.fn(),
    correct: vi.fn(),
    refund: vi.fn(),
    voidRefund: vi.fn(),
    reconcile: vi.fn(),
  },
}));
vi.mock("../src/lib/repositories/prescriptions", () => ({
  prescriptionsRepo: { get: vi.fn() },
}));
vi.mock("../src/lib/repositories/reports", () => ({
  reportsRepo: {
    salesSummary: vi.fn(),
    salesDaily: vi.fn(),
    topDrugs: vi.fn(),
  },
}));
const sale: Sale = {
  id: "sale1",
  version: 2,
  sale_number: "SL-QA",
  prescription_id: "rx1",
  subtotal_cents: 500,
  total_cents: 500,
  discount_cents: 0,
  tax_cents: 0,
  credited_cents: 250,
  refundable_cents: 250,
  refunded_cents: 0,
  currency: "GHS",
  payment_method: "cash",
  status: "completed",
  created_at: "2026-09-16T10:00:00Z",
  items: [
    {
      id: "i1",
      sale_id: "sale1",
      prescription_item_id: "ri1",
      drug_id: "d1",
      drug_batch_id: "b1",
      drug_name_snapshot: "QA medicine",
      quantity: 4,
      corrected_quantity: 2,
      unit_price_cents: 125,
      line_total_cents: 500,
    },
  ],
};
const rx: Prescription = {
  id: "rx1",
  version: 3,
  rx_number: "RX-QA",
  source: "walk_in",
  status: "partially_dispensed",
  created_at: sale.created_at,
  items: [
    {
      id: "ri1",
      prescription_id: "rx1",
      drug_id: "d1",
      drug_name_snapshot: "QA medicine",
      quantity_prescribed: 10,
      quantity_dispensed: 2,
      dosage_instructions: "As prescribed",
    },
  ],
};
const correction: Correction = {
  id: "c1",
  sale_id: sale.id,
  number: "CR-QA",
  kind: "not_collected",
  reason: "Retained at counter",
  credit_cents: 125,
  actor_staff_id: user.id,
  actor_name: user.full_name,
  created_at: sale.created_at,
  items: [{ sale_item_id: "i1", quantity: 1, credit_cents: 125 }],
};
const refund: Refund = {
  id: "rf1",
  sale_id: sale.id,
  number: "RF-QA",
  amount_cents: 125,
  payment_method: "cash",
  payment_ref: "CASH-REF-1",
  reason: "Return credit settled",
  actor_staff_id: user.id,
  actor_name: user.full_name,
  created_at: sale.created_at,
  status: "recorded",
  void_reason: null,
  voided_at: null,
  voided_by: null,
};
const clients: QueryClient[] = [];
function mount(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(qc);
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({
    identity,
    scope: identity.scope,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
    isAuthenticated: true,
  });
  vi.mocked(repo.quote).mockResolvedValue({
    credit_cents: 125,
    currency: "GHS",
    items: correction.items,
  });
  vi.mocked(repo.correct).mockResolvedValue(correction);
  vi.mocked(repo.refund).mockResolvedValue(refund);
  vi.mocked(repo.reconcile).mockResolvedValue(sale);
  vi.mocked(repo.voidRefund).mockResolvedValue({ ...refund, status: "voided" });
  vi.mocked(repo.list).mockResolvedValue({
    items: [correction],
    total: 1,
    offset: 0,
    limit: 25,
  });
  vi.mocked(repo.refunds).mockResolvedValue({
    items: [refund],
    total: 1,
    offset: 0,
    limit: 25,
  });
  vi.mocked(prescriptionsRepo.get).mockResolvedValue(rx);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((qc) => qc.clear());
});
async function review(kind = "not_collected") {
  fireEvent.change(screen.getByLabelText("Stock disposition"), {
    target: { value: kind },
  });
  fireEvent.change(screen.getByLabelText("Correction quantity line 1"), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByLabelText("Correction reason"), {
    target: { value: "Retained at counter" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Review correction" }));
  await screen.findByText(/Credit:/);
}
it("reviews a partial correction with both saved revisions and retries the same request", async () => {
  const done = vi.fn();
  vi.mocked(repo.correct)
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValue(correction);
  mount(<CorrectionEditor sale={sale} rx={rx} done={done} close={() => {}} />);
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry same request" }),
  );
  await waitFor(() => expect(done).toHaveBeenCalledWith(correction));
  const calls = vi.mocked(repo.correct).mock.calls;
  expect(calls[0][1]).toMatchObject({
    version: 2,
    prescription_version: 3,
    kind: "not_collected",
    stock_confirmed: true,
    items: [{ sale_item_id: "i1", quantity: 1 }],
  });
  expect(calls[0][1]).toEqual(calls[1][1]);
  expect(calls[0][2]).toBe(calls[1][2]);
});
it("customer returns explicitly keep stock outside usable inventory", async () => {
  mount(
    <CorrectionEditor sale={sale} rx={rx} done={() => {}} close={() => {}} />,
  );
  await review("customer_return");
  expect(
    screen.getByText(
      /original prescription dispensing quantities will remain recorded/,
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
  await waitFor(() => expect(repo.correct).toHaveBeenCalled());
  expect(vi.mocked(repo.correct).mock.calls[0][1].kind).toBe("customer_return");
});
it("older receipts cannot restore uncollected quantities without verified prescription links", () => {
  mount(
    <CorrectionEditor
      sale={{
        ...sale,
        items: [{ ...sale.items[0], prescription_item_id: null }],
      }}
      rx={rx}
      done={() => {}}
      close={() => {}}
    />,
  );
  expect(
    screen.getByRole("option", { name: /Never collected/ }),
  ).toBeDisabled();
  expect(screen.getByRole("option", { name: /Customer return/ })).toBeEnabled();
});
it("stale correction records require a reload rather than allowing another write", async () => {
  vi.mocked(repo.correct).mockRejectedValue({
    response: { status: 409, data: { detail: "Prescription changed" } },
  });
  mount(
    <CorrectionEditor sale={sale} rx={rx} done={() => {}} close={() => {}} />,
  );
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
  await screen.findByText("Prescription changed");
  expect(
    screen.getByRole("button", { name: "Save correction" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Close and reload" }),
  ).toBeEnabled();
});
it("records only the completed refund amount/reference and preserves them after a lost response", async () => {
  const done = vi.fn();
  vi.mocked(repo.refund)
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockResolvedValue(refund);
  mount(<RefundEditor sale={sale} done={done} close={() => {}} />);
  fireEvent.change(screen.getByLabelText("Refund amount (GHS)"), {
    target: { value: "1.25" },
  });
  fireEvent.change(screen.getByLabelText("Refund method"), {
    target: { value: "cash" },
  });
  fireEvent.change(screen.getByLabelText("Refund reference"), {
    target: { value: "CASH-REF-1" },
  });
  fireEvent.change(screen.getByLabelText("Refund reason"), {
    target: { value: "Return credit settled" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Save refund record" }));
  await screen.findByRole("button", { name: "Retry same request" });
  expect(screen.getByLabelText("Refund reference")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(refund));
  const calls = vi.mocked(repo.refund).mock.calls;
  expect(calls[0][1]).toMatchObject({
    version: 2,
    amount_cents: 125,
    payment_ref: "CASH-REF-1",
    payment_confirmed: true,
  });
  expect(calls[0][2]).toBe(calls[1][2]);
});
it("requires an explicit verified choice for each older prescription line", async () => {
  mount(
    <ReconcileEditor
      sale={{
        ...sale,
        items: [{ ...sale.items[0], prescription_item_id: null }],
      }}
      rx={rx}
      done={() => {}}
      close={() => {}}
    />,
  );
  expect(screen.getByLabelText("Prescription link line 1")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Prescription link line 1"), {
    target: { value: "ri1" },
  });
  fireEvent.change(screen.getByLabelText("Records review note"), {
    target: { value: "Original paper record verified" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save verified links" }));
  await waitFor(() => expect(repo.reconcile).toHaveBeenCalled());
  expect(vi.mocked(repo.reconcile).mock.calls[0][1]).toMatchObject({
    version: 2,
    prescription_version: 3,
    allocations: [{ sale_item_id: "i1", prescription_item_id: "ri1" }],
  });
});
it("keeps refund-entry correction separate from reversing a real payment", async () => {
  mount(
    <RefundVoidEditor
      sale={sale}
      refund={refund}
      done={() => {}}
      close={() => {}}
    />,
  );
  expect(
    screen.getByText(/does not reverse a real payment/),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Correction reason"), {
    target: { value: "Incorrect duplicate entry" },
  });
  expect(
    screen.getByRole("button", { name: "Mark entry incorrect" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Mark entry incorrect" }));
  await waitFor(() => expect(repo.voidRefund).toHaveBeenCalled());
  expect(vi.mocked(repo.voidRefund).mock.calls[0][2]).toMatchObject({
    version: 2,
    entry_was_incorrect: true,
  });
});
it("cashiers can inspect correction history but cannot create corrections or refunds", async () => {
  useAuthStore.setState({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: "cashier",
    },
  });
  mount(<SaleAdjustments sale={sale} />);
  await screen.findByText(/CR-QA/);
  await screen.findByText(/RF-QA/);
  expect(
    screen.queryByRole("button", { name: "Correct receipt quantities" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Record completed refund" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Correct refund entry/ }),
  ).not.toBeInTheDocument();
});
it("reports show later credits and refund-only days without subtracting refunds twice", async () => {
  vi.mocked(reportsRepo.salesSummary).mockResolvedValue({
    currency: "GHS",
    start_date: "2026-09-16",
    end_date: "2026-09-16",
    sale_count: 0,
    gross_total_cents: 0,
    credit_total_cents: 250,
    refund_total_cents: 125,
    net_sales_cents: -250,
    discount_cents: 0,
    by_payment_method: [],
  });
  vi.mocked(reportsRepo.salesDaily).mockResolvedValue([
    {
      day: "2026-09-16",
      sale_count: 0,
      total_cents: 0,
      credit_cents: 250,
      refund_cents: 125,
      net_sales_cents: -250,
    },
  ]);
  vi.mocked(reportsRepo.topDrugs).mockResolvedValue([]);
  mount(<ReportsScreen />);
  const heading = await screen.findByRole("heading", {
    name: "Sales after credits",
  });
  expect(heading.closest("section")).toHaveTextContent(
    formatCents(-250, "GHS"),
  );
  expect(
    screen
      .getByRole("heading", { name: "Refunds recorded" })
      .closest("section"),
  ).toHaveTextContent(formatCents(125, "GHS"));
  expect(screen.getByText("2026-09-16")).toBeInTheDocument();
});
