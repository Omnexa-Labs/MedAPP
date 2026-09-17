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
import { PosScreen } from "../src/components/transactions/pos-screen";
import { PrescriptionDetail } from "../src/components/transactions/prescription-detail";
import {
  PrescriptionList,
  SalesList,
} from "../src/components/transactions/transaction-lists";
import { SaleDetail } from "../src/components/transactions/sale-detail";
import { PrescriptionEditor } from "../src/components/transactions/prescription-editor";
import { QuoteReview } from "../src/components/transactions/shared";
import { salesRepo, type Sale } from "../src/lib/repositories/sales";
import {
  prescriptionsRepo,
  type Prescription,
} from "../src/lib/repositories/prescriptions";
import { drugsRepo, type DrugWithStock } from "../src/lib/repositories/drugs";
import { customersRepo } from "../src/lib/repositories/customers";
import { useAuthStore } from "../src/lib/stores/auth.store";
import { identity, user } from "./session-fixture";

vi.mock("../src/lib/repositories/sales", () => ({
  salesRepo: {
    page: vi.fn(),
    get: vi.fn(),
    quote: vi.fn(),
    createWalkIn: vi.fn(),
    voidSale: vi.fn(),
  },
}));
vi.mock("../src/lib/repositories/sale-corrections", () => ({
  correctionsRepo: {
    list: vi.fn(async () => ({ items: [], total: 0, limit: 25, offset: 0 })),
    refunds: vi.fn(async () => ({ items: [], total: 0, limit: 25, offset: 0 })),
  },
}));
vi.mock("../src/lib/repositories/prescriptions", () => ({
  prescriptionsRepo: {
    page: vi.fn(),
    get: vi.fn(),
    quote: vi.fn(),
    create: vi.fn(),
    dispense: vi.fn(),
    cancel: vi.fn(),
  },
}));
vi.mock("../src/lib/repositories/drugs", () => ({
  drugsRepo: { page: vi.fn() },
}));
vi.mock("../src/lib/repositories/customers", () => ({
  customersRepo: { list: vi.fn(), get: vi.fn() },
}));
const drug: DrugWithStock = {
  id: "d1",
  version: 1,
  name: "QA medicine",
  strength: "500 mg",
  category: "other",
  form: "tablet",
  unit: "tablet",
  reorder_level: 2,
  default_selling_price_cents: 999,
  currency: "GHS",
  requires_prescription: false,
  is_active: true,
  quantity_on_hand: 20,
  is_low_stock: false,
};
const quote = {
  subtotal_cents: 250,
  total_cents: 250,
  discount_cents: 0,
  tax_cents: 0,
  currency: "GHS",
  items: [
    {
      drug_id: "d1",
      drug_name: drug.name,
      batch_id: "b1",
      batch_number: "LOT-QA",
      quantity: 1,
      unit_price_cents: 250,
      line_total_cents: 250,
    },
  ],
};
const sale: Sale = {
  id: "sale1",
  version: 1,
  sale_number: "SL-QA",
  subtotal_cents: 250,
  total_cents: 250,
  discount_cents: 0,
  tax_cents: 0,
  currency: "GHS",
  payment_method: "cash",
  status: "completed",
  created_at: "2026-09-15T10:00:00Z",
  items: [],
};
const rx: Prescription = {
  id: "rx1",
  version: 4,
  rx_number: "RX-QA",
  status: "partially_dispensed",
  source: "walk_in",
  prescriber_name: "Dr QA",
  created_at: sale.created_at,
  items: [
    {
      id: "i1",
      prescription_id: "rx1",
      drug_id: "d1",
      drug_name_snapshot: drug.name,
      quantity_prescribed: 10,
      quantity_dispensed: 2,
      dosage_instructions: "As prescribed",
    },
  ],
};
const failure = (status: number, detail: string) => ({
  response: { status, data: { detail } },
});
const clients: QueryClient[] = [];
function mount(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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
  vi.mocked(drugsRepo.page).mockResolvedValue({
    items: [drug],
    total: 1,
    limit: 25,
    offset: 0,
    currency: "GHS",
  });
  vi.mocked(customersRepo.list).mockResolvedValue([]);
  vi.mocked(salesRepo.quote).mockResolvedValue(quote);
  vi.mocked(salesRepo.createWalkIn).mockResolvedValue(sale);
  vi.mocked(salesRepo.page).mockResolvedValue({
    items: [],
    total: 0,
    limit: 25,
    offset: 0,
  });
  vi.mocked(salesRepo.get).mockResolvedValue(sale);
  vi.mocked(prescriptionsRepo.get).mockResolvedValue(rx);
  vi.mocked(prescriptionsRepo.page).mockResolvedValue({
    items: [],
    total: 0,
    limit: 25,
    offset: 0,
  });
  vi.mocked(prescriptionsRepo.quote).mockResolvedValue(quote);
  vi.mocked(prescriptionsRepo.dispense).mockResolvedValue({
    prescription_id: rx.id,
    rx_status: "partially_dispensed",
    rx_version: 5,
    sale_id: sale.id,
    sale_number: sale.sale_number,
    sale_total_cents: 250,
    currency: "GHS",
    lines: [],
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((qc) => qc.clear());
});
async function reviewSale() {
  fireEvent.change(screen.getByLabelText("Find medicine"), {
    target: { value: "QA" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: /QA medicine.*20 usable units/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review sale" }));
  await screen.findByText(/Batch LOT-QA/);
}
it("reviews batch prices without silently overriding them with catalog prices", async () => {
  mount(<PosScreen />);
  await reviewSale();
  expect(vi.mocked(salesRepo.quote).mock.calls[0][0].items).toEqual([
    { drug_id: "d1", quantity: 1 },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
  expect(await screen.findByText("Sale recorded")).toBeInTheDocument();
  expect(
    vi.mocked(salesRepo.createWalkIn).mock.calls[0][0].expected_total_cents,
  ).toBe(250);
  expect(
    screen.getByRole("link", { name: "View saved receipt" }),
  ).toHaveAttribute("href", "/sales/sale1");
});
it("retries a lost sale response with exactly the same request and opens its receipt", async () => {
  vi.mocked(salesRepo.createWalkIn)
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValue(sale);
  mount(<PosScreen />);
  await reviewSale();
  fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry same request" }),
  );
  await screen.findByText("Sale recorded");
  const calls = vi.mocked(salesRepo.createWalkIn).mock.calls;
  expect(calls[0][0]).toEqual(calls[1][0]);
  expect(calls[0][1]).toBe(calls[1][1]);
});
it("requires another review after a price conflict", async () => {
  vi.mocked(salesRepo.createWalkIn).mockRejectedValue(
    failure(409, "Batch prices changed"),
  );
  mount(<PosScreen />);
  await reviewSale();
  fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
  await screen.findByText("Batch prices changed");
  expect(screen.getByRole("button", { name: "Record sale" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Close and reload" }));
  expect(screen.getByRole("button", { name: "Review sale" })).toBeEnabled();
});
it("shows a quote load failure without recording any sale", async () => {
  vi.mocked(salesRepo.quote).mockRejectedValue(
    failure(400, "Insufficient usable stock"),
  );
  mount(<PosScreen />);
  fireEvent.change(screen.getByLabelText("Find medicine"), {
    target: { value: "QA" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: /QA medicine.*20 usable units/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review sale" }));
  await screen.findByText("Insufficient usable stock");
  expect(screen.getByRole("button", { name: "Record sale" })).toBeDisabled();
  expect(salesRepo.createWalkIn).not.toHaveBeenCalled();
});
it("does not accept a late write response after the session changes", async () => {
  let finish!: (value: Sale) => void;
  const send = vi.fn(
      () =>
        new Promise<Sale>((resolve) => {
          finish = resolve;
        }),
    ),
    done = vi.fn();
  mount(
    <QuoteReview
      title="Record sale"
      details={{}}
      quote={async () => quote}
      send={send}
      done={done}
      close={() => {}}
    />,
  );
  await screen.findByText(/Batch LOT-QA/);
  fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  useAuthStore.setState({ scope: "other-session" });
  finish(sale);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Record sale" })).toBeEnabled(),
  );
  expect(done).not.toHaveBeenCalled();
});
it("dispenses selected quantities with the saved revision and shows the sale link", async () => {
  mount(<PrescriptionDetail id="rx1" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Prepare dispense" }),
  );
  fireEvent.change(screen.getByLabelText("Dispense quantity for QA medicine"), {
    target: { value: "1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review dispense" }));
  await screen.findByText(/Batch LOT-QA/);
  fireEvent.click(screen.getByRole("button", { name: "Record dispense" }));
  await screen.findByRole("link", { name: "View saved receipt" });
  expect(vi.mocked(prescriptionsRepo.dispense).mock.calls[0][1]).toMatchObject({
    version: 4,
    items: [{ prescription_item_id: "i1", quantity: 1 }],
    expected_total_cents: 250,
  });
});
it("shows the dispensing expiry and prevents starting an expired prescription", async () => {
  vi.mocked(prescriptionsRepo.get).mockResolvedValue({ ...rx, valid_until: "2020-01-01" });
  mount(<PrescriptionDetail id="rx1" />);
  expect(await screen.findByRole("button", { name: "Prepare dispense" })).toBeDisabled();
  expect(screen.getByText(/Expired — dispensing is unavailable/)).toBeInTheDocument();
});
it("cancels remaining units with a reason and retains its request on network failure", async () => {
  vi.mocked(prescriptionsRepo.cancel)
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue({ ...rx, version: 5, status: "cancelled" });
  mount(<PrescriptionDetail id="rx1" />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Cancel remaining prescription",
    }),
  );
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: { value: "Patient declined" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Cancel remaining prescription" }),
  );
  await screen.findByRole("button", { name: "Retry same request" });
  expect(screen.getByLabelText("Reason")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
  await waitFor(() =>
    expect(prescriptionsRepo.cancel).toHaveBeenCalledTimes(2),
  );
  const calls = vi.mocked(prescriptionsRepo.cancel).mock.calls;
  expect(calls[0][1]).toEqual({ version: 4, reason: "Patient declined" });
  expect(calls[0][2]).toBe(calls[1][2]);
});
it("cashiers can read prescriptions but cannot dispense, cancel or create one", async () => {
  useAuthStore.setState({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: "cashier",
    },
  });
  mount(
    <>
      <PrescriptionDetail id="rx1" />
      <PrescriptionList />
    </>,
  );
  await screen.findByText("RX-QA");
  expect(
    screen.queryByRole("button", { name: "Prepare dispense" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Cancel remaining prescription" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "New prescription" }),
  ).not.toBeInTheDocument();
});
it("keeps failed ledger loads distinct from an empty ledger", async () => {
  vi.mocked(salesRepo.page).mockRejectedValue(
    failure(503, "Ledger unavailable"),
  );
  mount(<SalesList />);
  await screen.findByText("Ledger unavailable");
  expect(screen.queryByText("No sales found.")).not.toBeInTheDocument();
});
it("excludes prescription sales from the walk-in void action", async () => {
  vi.mocked(salesRepo.get).mockResolvedValue({
    ...sale,
    prescription_id: "rx1",
  });
  mount(<SaleDetail id="sale1" />);
  await screen.findByText("Receipt SL-QA");
  expect(
    screen.queryByRole("button", { name: "Void sale" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "View prescription" }),
  ).toHaveAttribute("href", "/prescriptions/rx1");
});

it("retains supplied prescription instructions when creation loses its response", async () => {
  const done = vi.fn();
  vi.mocked(prescriptionsRepo.create)
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValue(rx);
  mount(<PrescriptionEditor done={done} close={() => {}} />);
  fireEvent.change(screen.getByLabelText("Prescriber"), {
    target: { value: "Dr QA" },
  });
  fireEvent.change(screen.getByLabelText("Prescriber license"), {
    target: { value: "QA-LICENSE" },
  });
  fireEvent.change(screen.getByLabelText("Find medicine"), {
    target: { value: "QA" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: /QA medicine.*20 usable units/ }),
  );
  fireEvent.change(
    screen.getByLabelText("Prescribed quantity for QA medicine"),
    { target: { value: "6" } },
  );
  fireEvent.change(screen.getByLabelText("Dosage for QA medicine"), {
    target: { value: "As written on supplied prescription" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save prescription" }));
  await screen.findByRole("button", { name: "Retry same request" });
  expect(screen.getByLabelText("Prescriber")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(rx));
  const calls = vi.mocked(prescriptionsRepo.create).mock.calls;
  expect(calls[0][0]).toEqual(calls[1][0]);
  expect(calls[0][1]).toBe(calls[1][1]);
  expect(calls[0][0]).toMatchObject({
    prescriber_name: "Dr QA",
    prescriber_license: "QA-LICENSE",
    items: [
      {
        drug_id: "d1",
        quantity_prescribed: 6,
        dosage_instructions: "As written on supplied prescription",
      },
    ],
  });
});
