import { beforeEach, expect, it, vi } from "vitest";
import api from "../src/lib/api/client";
import { purchaseOrdersRepo } from "../src/lib/repositories/purchaseOrders";
vi.mock("../src/lib/api/client", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
const key = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.post).mockResolvedValue({ data: { id: "po1" } });
  vi.mocked(api.patch).mockResolvedValue({ data: { id: "po1" } });
});
it("sends complete partial delivery data with its version, replay key and cancellation signal", async () => {
  const signal = new AbortController().signal;
  const body = {
    version: 3,
    received_at: "2026-09-15",
    delivery_reference: "DEL-01",
    lines: [
      {
        purchase_order_item_id: "i1",
        quantity_received: 5,
        batch_number: "LOT",
        unit_cost_cents: null,
        selling_price_cents: 0,
        expiry_date: "2027-01-01",
      },
    ],
  };
  await purchaseOrdersRepo.receive("po1", body, key, signal);
  expect(api.post).toHaveBeenCalledWith(
    "/v1/purchase-orders/po1/receive",
    body,
    { signal, headers: { "Idempotency-Key": key } },
  );
});
it("keeps a draft replacement version and passes the idempotency key on PATCH", async () => {
  const body = {
    supplier_id: "s1",
    version: 2,
    expected_at: null,
    notes: null,
    items: [{ drug_id: "d1", quantity: 5, unit_cost_cents: 250 }],
  };
  await purchaseOrdersRepo.update("po1", body, key);
  expect(api.patch).toHaveBeenCalledWith(
    "/v1/purchase-orders/po1",
    body,
    expect.objectContaining({ headers: { "Idempotency-Key": key } }),
  );
});
it("loads every page of legacy batches and scopes the lookup to its purchase order", async () => {
  vi.mocked(api.get)
    .mockResolvedValueOnce({
      data: {
        items: Array.from({ length: 200 }, (_, id) => ({ id: String(id) })),
        total: 201,
      },
    })
    .mockResolvedValueOnce({ data: { items: [{ id: "last" }], total: 201 } });
  const rows = await purchaseOrdersRepo.legacyBatches("po1");
  expect(rows).toHaveLength(201);
  expect(api.get).toHaveBeenLastCalledWith("/v1/batches", {
    params: { purchase_order_id: "po1", offset: 200, limit: 200 },
    signal: undefined,
  });
});
it("does not submit a silently truncated historical allocation set", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 501 } });
  await expect(purchaseOrdersRepo.legacyBatches("po1")).rejects.toMatchObject({
    response: { status: 422 },
  });
});
