// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InventoryScreen } from "../src/components/inventory/inventory-screen";
import { BatchesScreen } from "../src/components/inventory/batches-screen";
import { DashboardScreen } from "../src/components/inventory/dashboard-screen";
import {
  moneyToCents,
  useInventoryAction,
} from "../src/components/inventory/use-inventory-action";
import { drugsRepo, DrugWithStock } from "../src/lib/repositories/drugs";
import { batchesRepo, Batch } from "../src/lib/repositories/batches";
import {
  dashboardRepo,
  PharmacyDashboard,
} from "../src/lib/repositories/dashboard";
import { suppliersRepo } from "../src/lib/repositories/suppliers";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { identity, user } from "./session-fixture";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../src/lib/repositories/drugs", () => ({
  drugsRepo: { page: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("../src/lib/repositories/batches", () => ({
  batchesRepo: {
    page: vi.fn(),
    create: vi.fn(),
    adjust: vi.fn(),
    movements: vi.fn(),
  },
}));
vi.mock("../src/lib/repositories/dashboard", () => ({
  dashboardRepo: { get: vi.fn() },
}));
vi.mock("../src/lib/repositories/suppliers", () => ({
  suppliersRepo: { list: vi.fn() },
}));
const drug: DrugWithStock = {
  id: "d1",
  version: 3,
  name: "Paracetamol",
  category: "analgesic",
  form: "tablet",
  strength: "500 mg",
  unit: "tablet",
  reorder_level: 10,
  default_selling_price_cents: 1250,
  currency: "GHS",
  requires_prescription: false,
  is_active: true,
  quantity_on_hand: 20,
  is_low_stock: false,
};
const batch: Batch = {
  id: "b1",
  version: 7,
  drug_id: drug.id,
  drug_name: drug.name,
  batch_number: "LOT-1",
  quantity_received: 30,
  quantity_on_hand: 20,
  unit_cost_cents: 900,
  selling_price_cents: 1250,
  currency: "GHS",
  received_at: "2026-08-01",
  expiry_date: "2026-09-01",
};
const overview: PharmacyDashboard = {
  as_of: "2026-09-15T12:00:00Z",
  inventory_date: "2026-09-15",
  timezone: "UTC",
  currency: "GHS",
  period: "today",
  start_date: "2026-09-15",
  end_date: "2026-09-15",
  active_drugs: 1,
  pending_prescriptions: 1,
  low_stock_count: 1,
  expiring_batch_count: 0,
  expired_batch_count: 1,
  pending_queue: [{ id: "rx1", number: "RX-01", status: "pending" }],
  low_stock: [
    {
      drug_id: drug.id,
      drug_name: drug.name,
      quantity_on_hand: 4,
      reorder_level: 10,
    },
  ],
  expiring_batches: [],
  volume: Array.from({ length: 24 }, (_, i) => ({
    label: `${i}:00`,
    count: i === 10 ? 2 : 0,
  })),
  sales: { currency: "GHS", sale_count: 2, gross_total_cents: 2500 },
};
let clients: QueryClient[] = [];
function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return {
    ...render(
      <QueryClientProvider client={client}>{element}</QueryClientProvider>,
    ),
    client,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({
    scope: "inventory-session",
    identity,
    user: {
      id: user.id,
      email: user.email,
      fullName: "QA Pharmacist",
      role: "pharmacy_admin",
    },
  });
  vi.mocked(drugsRepo.page).mockResolvedValue({
    items: [drug],
    total: 1,
    limit: 25,
    offset: 0,
    currency: "GHS",
  });
  vi.mocked(drugsRepo.get).mockResolvedValue(drug);
  vi.mocked(batchesRepo.page).mockResolvedValue({
    items: [batch],
    total: 1,
    limit: 25,
    offset: 0,
    inventory_date: "2026-09-15",
  });
  vi.mocked(suppliersRepo.list).mockResolvedValue([]);
  vi.mocked(dashboardRepo.get).mockResolvedValue(overview);
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients = [];
});
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const enter = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });

it("loads the catalog with server paging and applies search and archived filters", async () => {
  vi.mocked(drugsRepo.page).mockResolvedValue({
    items: [drug],
    total: 26,
    limit: 25,
    offset: 0,
    currency: "GHS",
  });
  mount(<InventoryScreen />);
  await screen.findByText("Paracetamol");
  click("Next");
  await waitFor(() =>
    expect(drugsRepo.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 25 }),
      expect.any(AbortSignal),
    ),
  );
  enter("Search by drug, brand or SKU", "Care brand");
  click("Search");
  await waitFor(() =>
    expect(drugsRepo.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 0, search: "Care brand" }),
      expect.any(AbortSignal),
    ),
  );
  enter("Show", "archived");
  await waitFor(() =>
    expect(drugsRepo.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: false }),
      expect.any(AbortSignal),
    ),
  );
});

it("shows a load failure with retry instead of an empty inventory", async () => {
  vi.mocked(drugsRepo.page).mockRejectedValueOnce({
    response: { status: 503, data: { detail: "Inventory unavailable" } },
  });
  mount(<InventoryScreen />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Inventory unavailable",
  );
  expect(screen.queryByText(/No drugs/)).not.toBeInTheDocument();
  click("Retry loading");
  await screen.findByText("Paracetamol");
});

it("saves decimal currency as cents, preserves the revision and archives without changing stock", async () => {
  vi.mocked(drugsRepo.update).mockResolvedValue({
    ...drug,
    is_active: false,
    version: 4,
  });
  mount(<InventoryScreen />);
  click(
    (await screen.findByRole("button", { name: "Edit Paracetamol" }))
      .textContent!,
  );
  enter("Selling price (GHS)", "12.35");
  fireEvent.click(screen.getByLabelText("Active in catalog"));
  click("Save drug");
  await waitFor(() =>
    expect(drugsRepo.update).toHaveBeenCalledWith(
      drug.id,
      expect.objectContaining({
        version: 3,
        is_active: false,
        default_selling_price_cents: 1235,
      }),
      expect.any(AbortSignal),
    ),
  );
  expect(vi.mocked(drugsRepo.update).mock.calls[0][1]).not.toHaveProperty(
    "quantity_on_hand",
  );
  await screen.findByText("Paracetamol saved.");
});

it("keeps a stale stock adjustment visible and requires reloading before another edit", async () => {
  vi.mocked(batchesRepo.adjust).mockRejectedValue({
    response: { status: 409, data: { detail: "This batch changed." } },
  });
  mount(<BatchesScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "Adjust LOT-1" }));
  enter("Change in units", "-3");
  enter("Adjustment note", "Damaged packaging");
  expect(screen.getByText("17 units")).toBeInTheDocument();
  click("Record adjustment");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This batch changed.",
  );
  expect(
    screen.getByRole("button", { name: "Record adjustment" }),
  ).toBeDisabled();
  expect(batchesRepo.adjust).toHaveBeenCalledWith(
    "b1",
    { version: 7, delta: -3, reason: "adjust", note: "Damaged packaging" },
    expect.any(String),
    expect.any(AbortSignal),
  );
  click("Close and reload");
  expect(
    screen.queryByRole("form", { name: "Adjust stock" }),
  ).not.toBeInTheDocument();
});

it("retries an uncertain receipt with the same values and request key", async () => {
  vi.mocked(batchesRepo.create)
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockResolvedValue(batch);
  mount(<BatchesScreen />);
  click("Receive stock");
  await screen.findByRole("option", { name: /Paracetamol/ });
  enter("Drug", "d1");
  enter("Batch number", "LOT-NEW");
  enter("Units received", "12");
  enter("Unit cost (GHS)", "2.50");
  enter("Selling price (GHS, optional)", "0.00");
  enter("Expiry date", "2027-01-01");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Record receipt" }),
    ).toBeEnabled(),
  );
  click("Record receipt");
  await screen.findByRole("button", { name: "Retry same request" });
  expect(screen.getByLabelText("Units received")).toBeDisabled();
  click("Retry same request");
  await screen.findByText(/Stock recorded/);
  const calls = vi.mocked(batchesRepo.create).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][0]).toEqual(
    expect.objectContaining({
      quantity_received: 12,
      unit_cost_cents: 250,
      selling_price_cents: 0,
    }),
  );
  expect(calls[1][0]).toEqual(calls[0][0]);
  expect(calls[1][1]).toBe(calls[0][1]);
});

it("labels expired stock using the server date and loads paged movement history", async () => {
  vi.mocked(batchesRepo.movements).mockResolvedValue({
    items: [
      {
        id: "m1",
        delta: -10,
        reason: "sale",
        note: "Sale QA-01",
        actor_name: "QA Pharmacist",
        created_at: overview.as_of,
      },
    ],
    has_more: true,
  });
  mount(<BatchesScreen />);
  await screen.findByText("Expired — unavailable");
  click("History LOT-1");
  const history = await screen.findByRole("region", { name: "Stock history" });
  await within(history).findByText("Sale QA-01");
  click("Older movements");
  await waitFor(() =>
    expect(batchesRepo.movements).toHaveBeenLastCalledWith(
      "b1",
      50,
      expect.any(AbortSignal),
    ),
  );
});

it.each(["catalog", "batches"])(
  "keeps %s actions read-only for cashiers",
  async (section) => {
    useAuthStore.setState({
      user: { ...useAuthStore.getState().user!, role: "cashier" },
    });
    mount(section === "catalog" ? <InventoryScreen /> : <BatchesScreen />);
    await screen.findByText("Paracetamol");
    expect(
      screen.queryByRole("button", {
        name: /Add drug|Receive stock|Edit Paracetamol|Adjust LOT-1|History LOT-1/,
      }),
    ).not.toBeInTheDocument();
  },
);

it("connects dashboard stock tasks and prescription queue, and switches to weekly activity", async () => {
  vi.mocked(dashboardRepo.get).mockImplementation(async (period) =>
    period === "today"
      ? overview
      : {
          ...overview,
          period,
          volume: [],
          sales: { ...overview.sales, sale_count: 0, gross_total_cents: 0 },
        },
  );
  mount(<DashboardScreen />);
  expect(await screen.findByText("Low stock: Paracetamol")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /expired batches/ })).toHaveAttribute(
    "href",
    "/batches?state=expired",
  );
  expect(screen.getByRole("link", { name: /RX-01/ })).toHaveAttribute(
    "href",
    "/prescriptions/rx1",
  );
  expect(
    within(screen.getByRole("table", { name: "Sales volume" })).getByText("2"),
  ).toBeInTheDocument();
  click("Last 7 days");
  await screen.findByText("No completed sales in this period.");
  expect(screen.getByRole("button", { name: "Last 7 days" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(dashboardRepo.get).toHaveBeenLastCalledWith(
    "week",
    expect.any(AbortSignal),
  );
});

it("does not publish a late write result after the pharmacy session changes", async () => {
  let resolve!: (value: string) => void;
  const pending = new Promise<string>((done) => {
    resolve = done;
  });
  const success = vi.fn();
  const send = vi.fn(() => pending);
  function Harness() {
    const action = useInventoryAction(success);
    return <button onClick={() => void action.run(send)}>Write</button>;
  }
  const view = mount(<Harness />);
  click("Write");
  click("Write");
  expect(send).toHaveBeenCalledTimes(1);
  act(() => useAuthStore.setState({ scope: "another-pharmacy" }));
  view.unmount();
  await act(async () => resolve("saved"));
  expect(success).not.toHaveBeenCalled();
});

it.each(["-1", "1.001", "Infinity", "21474836.48"])(
  "rejects unsupported money input %s",
  (value) => {
    expect(() => moneyToCents(value)).toThrow();
  },
);
