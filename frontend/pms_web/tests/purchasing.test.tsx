// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderList } from "../src/components/purchasing/order-list";
import { OrderDetail } from "../src/components/purchasing/order-detail";
import { OrderEditor } from "../src/components/purchasing/order-editor";
import { DeliveryEditor } from "../src/components/purchasing/delivery-editor";
import { ReconcileReceipts } from "../src/components/purchasing/order-actions";
import {
  PurchaseOrder,
  purchaseOrdersRepo as repo,
} from "../src/lib/repositories/purchaseOrders";
import { drugsRepo } from "../src/lib/repositories/drugs";
import { suppliersRepo } from "../src/lib/repositories/suppliers";
import { batchesRepo } from "../src/lib/repositories/batches";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { identity, user } from "./session-fixture";

vi.mock("../src/lib/repositories/purchaseOrders", async (original) => ({
  ...(await original<object>()),
  purchaseOrdersRepo: {
    page: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    send: vi.fn(),
    cancel: vi.fn(),
    receive: vi.fn(),
    history: vi.fn(),
    legacyBatches: vi.fn(),
    reconcile: vi.fn(),
  },
}));
vi.mock("../src/lib/repositories/drugs", () => ({
  drugsRepo: { page: vi.fn() },
}));
vi.mock("../src/lib/repositories/suppliers", () => ({
  suppliersRepo: { list: vi.fn() },
}));
vi.mock("../src/lib/repositories/batches", () => ({
  batchesRepo: { page: vi.fn() },
}));
const po: PurchaseOrder = {
  id: "po1",
  version: 1,
  po_number: "PO-QA-01",
  supplier_id: "s1",
  supplier_name: "Care Supplier",
  status: "draft",
  receiving_reconciled: true,
  cancellation_reason: null,
  expected_at: null,
  total_cents: 2000,
  currency: "GHS",
  notes: null,
  created_at: "2026-09-15T10:00:00Z",
  items: [
    {
      id: "i1",
      purchase_order_id: "po1",
      drug_id: "d1",
      drug_name: "Paracetamol · 500 mg",
      quantity: 20,
      quantity_received: 0,
      quantity_outstanding: 20,
      quantity_cancelled: 0,
      unit_cost_cents: 100,
    },
  ],
};
const ordered = { ...po, status: "sent" as const, version: 2 };
const partial = {
  ...po,
  status: "partially_received" as const,
  version: 3,
  items: [{ ...po.items[0], quantity_received: 5, quantity_outstanding: 15 }],
};
const oldBatch = {
  id: "b1",
  version: 1,
  drug_id: "d1",
  drug_name: "Paracetamol",
  purchase_order_id: "po1",
  batch_number: "OLD-LOT",
  quantity_received: 12,
  quantity_on_hand: 4,
  unit_cost_cents: 100,
  selling_price_cents: 200,
  currency: "GHS",
  received_at: "2026-09-01",
  expiry_date: "2027-01-01",
};
const unavailable = {
  response: { status: 503, data: { detail: "Purchase orders unavailable" } },
};
let clients: QueryClient[] = [];
function mount(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({
    scope: "purchase-scope",
    identity,
    user: {
      id: user.id,
      fullName: "QA Pharmacist",
      email: user.email,
      role: "pharmacy_admin",
    },
  });
  vi.mocked(repo.page).mockResolvedValue({
    items: [po],
    total: 1,
    limit: 25,
    offset: 0,
    currency: "GHS",
  });
  vi.mocked(repo.get).mockResolvedValue(po);
  vi.mocked(repo.history).mockResolvedValue({ items: [], has_more: false });
  vi.mocked(suppliersRepo.list).mockResolvedValue([
    { id: "s1", name: "Care Supplier", is_active: true },
  ]);
  vi.mocked(drugsRepo.page).mockResolvedValue({
    items: [
      {
        id: "d1",
        version: 1,
        name: "Paracetamol",
        strength: "500 mg",
        category: "general",
        form: "tablet",
        unit: "tablet",
        reorder_level: 5,
        default_selling_price_cents: 400,
        currency: "GHS",
        requires_prescription: false,
        is_active: true,
        quantity_on_hand: 3,
        is_low_stock: true,
      },
    ],
    total: 1,
    offset: 0,
    limit: 50,
    currency: "GHS",
  });
  vi.mocked(batchesRepo.page).mockResolvedValue({
    items: [],
    total: 0,
    offset: 0,
    limit: 25,
    inventory_date: "2026-09-15",
  });
  vi.mocked(repo.legacyBatches).mockResolvedValue([oldBatch]);
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients = [];
});
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const enter = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = (form: string, button: string) =>
  fireEvent.click(
    within(screen.getByRole("form", { name: form })).getByRole("button", {
      name: button,
    }),
  );
function fillDelivery() {
  enter("Batch number 1", "NEW-LOT");
  enter("Units received 1", "5");
  enter("Expiry date 1", "2027-01-01");
}

it("queries status, supplier search and paging on the server", async () => {
  vi.mocked(repo.page).mockResolvedValue({
    items: [po],
    total: 26,
    offset: 0,
    limit: 25,
    currency: "GHS",
  });
  mount(<OrderList />);
  await screen.findByRole("link", { name: "PO-QA-01" });
  click("Next");
  await waitFor(() =>
    expect(repo.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 25 }),
      expect.any(AbortSignal),
    ),
  );
  enter("Search order or supplier", "Care");
  click("Search");
  enter("Order status", "partially_received");
  await waitFor(() =>
    expect(repo.page).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: "Care",
        status: "partially_received",
        offset: 0,
      }),
      expect.any(AbortSignal),
    ),
  );
});

it("shows an unavailable order list with retry and preserves the difference from an empty list", async () => {
  vi.mocked(repo.page).mockRejectedValueOnce(unavailable);
  mount(<OrderList />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Purchase orders unavailable",
  );
  expect(
    screen.queryByText("No purchase orders match this view."),
  ).not.toBeInTheDocument();
  click("Retry loading");
  await screen.findByRole("link", { name: "PO-QA-01" });
});

it("creates a draft using decimal currency and retains the chosen drug across catalog searches", async () => {
  const saved = vi.fn();
  vi.mocked(repo.create).mockResolvedValue(po);
  mount(<OrderEditor currency="GHS" saved={saved} close={vi.fn()} />);
  await screen.findByRole("option", { name: "Care Supplier" });
  enter("Supplier", "s1");
  enter("Drug 1", "d1");
  enter("Quantity 1", "3");
  enter("Unit cost (GHS) 1", "12.35");
  vi.mocked(drugsRepo.page).mockResolvedValue({
    items: [],
    total: 0,
    offset: 0,
    limit: 50,
    currency: "GHS",
  });
  enter("Search catalog", "Different drug");
  await waitFor(() =>
    expect(drugsRepo.page).toHaveBeenLastCalledWith(
      { search: "Different drug", limit: 50 },
      expect.any(AbortSignal),
    ),
  );
  expect(screen.getByLabelText("Drug 1")).toHaveValue("d1");
  click("Save order draft");
  await waitFor(() =>
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_id: "s1",
        items: [{ drug_id: "d1", quantity: 3, unit_cost_cents: 1235 }],
      }),
      expect.any(String),
      expect.any(AbortSignal),
    ),
  );
  expect(repo.send).not.toHaveBeenCalled();
  expect(saved).toHaveBeenCalledWith(po);
});

it("retains edits and retries a lost draft response with the same request key", async () => {
  vi.mocked(repo.update)
    .mockRejectedValueOnce(unavailable)
    .mockResolvedValue({ ...po, version: 2 });
  mount(
    <OrderEditor order={po} currency="GHS" saved={vi.fn()} close={vi.fn()} />,
  );
  enter("Quantity 1", "12");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save order draft" }),
    ).toBeEnabled(),
  );
  click("Save order draft");
  await screen.findByRole("button", { name: "Retry same request" });
  expect(screen.getByLabelText("Quantity 1")).toBeDisabled();
  click("Retry same request");
  await waitFor(() => expect(repo.update).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(repo.update).mock.calls;
  expect(calls[0][1]).toEqual(
    expect.objectContaining({
      version: 1,
      items: [{ drug_id: "d1", quantity: 12, unit_cost_cents: 100 }],
    }),
  );
  expect(calls[1][1]).toEqual(calls[0][1]);
  expect(calls[1][2]).toBe(calls[0][2]);
});

it("records a partial delivery with the received date at the request root and refreshes outstanding quantities", async () => {
  vi.mocked(repo.get).mockResolvedValueOnce(ordered).mockResolvedValue(partial);
  vi.mocked(repo.receive).mockResolvedValue(partial);
  mount(<OrderDetail id="po1" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Record delivery" }),
  );
  expect(screen.getByLabelText("Expiry date 1")).toHaveValue("");
  fillDelivery();
  enter("Received date", "2026-09-15");
  enter("Delivery reference (optional)", "DEL-01");
  enter("Selling price (GHS, optional) 1", "0.00");
  submit("Record delivery", "Save delivery");
  await waitFor(() =>
    expect(repo.receive).toHaveBeenCalledWith(
      "po1",
      {
        version: 2,
        received_at: "2026-09-15",
        delivery_reference: "DEL-01",
        lines: [
          {
            purchase_order_item_id: "i1",
            batch_number: "NEW-LOT",
            quantity_received: 5,
            unit_cost_cents: null,
            selling_price_cents: 0,
            expiry_date: "2027-01-01",
          },
        ],
      },
      expect.any(String),
      expect.any(AbortSignal),
    ),
  );
  await screen.findByText("Partly received");
  expect(
    within(
      screen.getByRole("table", {
        name: "Ordered items and remaining quantities",
      }),
    ).getByText("15"),
  ).toBeInTheDocument();
});

it("rejects split batch quantities that together exceed the outstanding order", () => {
  mount(<DeliveryEditor order={ordered} saved={vi.fn()} close={vi.fn()} />);
  fillDelivery();
  enter("Units received 1", "15");
  click("Add delivered batch");
  enter("Batch number 2", "SECOND");
  enter("Units received 2", "6");
  enter("Expiry date 2", "2027-01-01");
  click("Save delivery");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "combined batch quantity exceeds",
  );
  expect(repo.receive).not.toHaveBeenCalled();
});

it("keeps delivery values frozen for an uncertain retry", async () => {
  vi.mocked(repo.receive)
    .mockRejectedValueOnce(unavailable)
    .mockResolvedValue(partial);
  mount(<DeliveryEditor order={ordered} saved={vi.fn()} close={vi.fn()} />);
  fillDelivery();
  click("Save delivery");
  await screen.findByRole("button", { name: "Retry same request" });
  expect(screen.getByLabelText("Units received 1")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  click("Retry same request");
  await waitFor(() => expect(repo.receive).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(repo.receive).mock.calls;
  expect(calls[1][1]).toEqual(calls[0][1]);
  expect(calls[1][2]).toBe(calls[0][2]);
});

it("requires reload after another staff member changes the order", async () => {
  vi.mocked(repo.receive).mockRejectedValue({
    response: { status: 409, data: { detail: "This order changed." } },
  });
  const close = vi.fn();
  mount(<DeliveryEditor order={ordered} saved={vi.fn()} close={close} />);
  fillDelivery();
  click("Save delivery");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This order changed.",
  );
  expect(screen.getByRole("button", { name: "Save delivery" })).toBeDisabled();
  click("Close and reload");
  expect(close).toHaveBeenCalledOnce();
});

it("marks an order as placed only through the explicit action", async () => {
  vi.mocked(repo.send).mockResolvedValue(ordered);
  mount(<OrderDetail id="po1" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Mark as ordered" }),
  );
  expect(repo.send).not.toHaveBeenCalled();
  expect(
    screen.getByText(/Contact the supplier through your usual channel/),
  ).toBeInTheDocument();
  submit("Mark as ordered", "Mark as ordered");
  await waitFor(() =>
    expect(repo.send).toHaveBeenCalledWith(
      "po1",
      1,
      expect.any(String),
      expect.any(AbortSignal),
    ),
  );
});

it("requires a cancellation reason and preserves delivered quantities in the cancelled view", async () => {
  const closed = {
    ...partial,
    status: "cancelled" as const,
    version: 4,
    cancellation_reason: "Supplier discontinued remaining stock",
    items: [
      { ...partial.items[0], quantity_outstanding: 0, quantity_cancelled: 15 },
    ],
  };
  vi.mocked(repo.get).mockResolvedValueOnce(partial).mockResolvedValue(closed);
  vi.mocked(repo.cancel).mockResolvedValue(closed);
  mount(<OrderDetail id="po1" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Cancel remaining order" }),
  );
  enter("Cancellation reason", closed.cancellation_reason);
  submit("Cancel remaining order", "Cancel remaining order");
  await waitFor(() =>
    expect(repo.cancel).toHaveBeenCalledWith(
      "po1",
      3,
      closed.cancellation_reason,
      expect.any(String),
      expect.any(AbortSignal),
    ),
  );
  await screen.findByText(`Cancellation reason: ${closed.cancellation_reason}`);
  expect(
    screen.queryByRole("button", { name: "Record delivery" }),
  ).not.toBeInTheDocument();
});

it("allows cashiers to read orders without purchasing controls", async () => {
  useAuthStore.setState({
    user: { ...useAuthStore.getState().user!, role: "cashier" },
  });
  mount(<OrderDetail id="po1" />);
  await screen.findByRole("heading", { name: "PO-QA-01" });
  expect(
    screen.queryByRole("button", {
      name: /Edit draft|Mark as ordered|Record delivery|Cancel remaining order/,
    }),
  ).not.toBeInTheDocument();
  expect(repo.history).not.toHaveBeenCalled();
});

it("reports a missing order with a retry instead of leaving it loading", async () => {
  vi.mocked(repo.get).mockRejectedValue({
    response: { status: 404, data: { detail: "Purchase order not found." } },
  });
  mount(<OrderDetail id="missing" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Purchase order not found.",
  );
  expect(screen.queryByText("Loading purchase order…")).not.toBeInTheDocument();
});

it("requires review confirmation and allocates original receipt quantities instead of current balances", async () => {
  vi.mocked(repo.reconcile).mockResolvedValue(partial);
  mount(
    <ReconcileReceipts
      order={{ ...po, receiving_reconciled: false }}
      saved={vi.fn()}
      close={vi.fn()}
    />,
  );
  await screen.findByText("OLD-LOT · received 12 units · currently on hand 4");
  expect(
    screen.getByRole("button", { name: "Confirm receipt allocations" }),
  ).toBeDisabled();
  enter("Review note", "Matched supplier delivery note");
  fireEvent.click(screen.getByRole("checkbox"));
  click("Confirm receipt allocations");
  await waitFor(() =>
    expect(repo.reconcile).toHaveBeenCalledWith(
      "po1",
      {
        version: 1,
        note: "Matched supplier delivery note",
        allocations: [{ batch_id: "b1", purchase_order_item_id: "i1" }],
      },
      expect.any(String),
      expect.any(AbortSignal),
    ),
  );
});

it("keeps historical orders with missing batch evidence flagged for review", async () => {
  vi.mocked(repo.legacyBatches).mockResolvedValue([]);
  mount(
    <ReconcileReceipts
      order={{ ...po, receiving_reconciled: false }}
      saved={vi.fn()}
      close={vi.fn()}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "no recorded delivery batches",
  );
  expect(
    screen.getByRole("button", { name: "Confirm receipt allocations" }),
  ).toBeDisabled();
});

it("shows delivery and order history errors with retry controls", async () => {
  vi.mocked(repo.history).mockRejectedValue(unavailable);
  vi.mocked(batchesRepo.page).mockRejectedValue(unavailable);
  mount(<OrderDetail id="po1" />);
  await screen.findByRole("heading", { name: "PO-QA-01" });
  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
  expect(
    screen.queryByText("No deliveries have been recorded for this order."),
  ).not.toBeInTheDocument();
});
