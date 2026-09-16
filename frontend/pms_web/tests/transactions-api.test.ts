import { beforeEach, expect, it, vi } from "vitest";
import api from "../src/lib/api/client";
import { salesRepo } from "../src/lib/repositories/sales";
import { prescriptionsRepo } from "../src/lib/repositories/prescriptions";
vi.mock("../src/lib/api/client", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
const key = "11111111-1111-4111-8111-111111111111";
const signal = new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.post).mockResolvedValue({ data: {} });
  vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 51 } });
});
it("passes complete payment details, reviewed total and replay key", async () => {
  const body = {
    items: [{ drug_id: "d1", quantity: 2 }],
    expected_total_cents: 350,
    payment_ref: "PAY",
    notes: "Collected",
  };
  await salesRepo.createWalkIn(body, key, signal);
  expect(api.post).toHaveBeenCalledWith("/v1/sales", body, {
    signal,
    headers: { "Idempotency-Key": key },
  });
  await salesRepo.quote(body, signal);
  expect(api.post).toHaveBeenLastCalledWith("/v1/sales/quote", body, {
    signal,
  });
});
it("passes the saved prescription revision for dispensing and cancellation", async () => {
  const body = {
    version: 3,
    items: [{ prescription_item_id: "i1", quantity: 1 }],
    expected_total_cents: 0,
  };
  await prescriptionsRepo.dispense("rx1", body, key, signal);
  expect(api.post).toHaveBeenCalledWith(
    "/v1/prescriptions/rx1/dispense",
    body,
    { signal, headers: { "Idempotency-Key": key } },
  );
  await prescriptionsRepo.cancel(
    "rx1",
    { version: 4, reason: "Patient declined" },
    key,
    signal,
  );
  expect(api.post).toHaveBeenLastCalledWith(
    "/v1/prescriptions/rx1/cancel",
    { version: 4, reason: "Patient declined" },
    { signal, headers: { "Idempotency-Key": key } },
  );
});
it("forwards a void reason and fetches only the requested ledger page", async () => {
  await salesRepo.voidSale(
    "sale1",
    { version: 1, reason: "Retained goods" },
    key,
    signal,
  );
  expect(api.post).toHaveBeenCalledWith(
    "/v1/sales/sale1/void",
    { version: 1, reason: "Retained goods" },
    { signal, headers: { "Idempotency-Key": key } },
  );
  expect(
    await salesRepo.page(
      { prescription_id: "rx1", offset: 25, limit: 25 },
      signal,
    ),
  ).toEqual({ items: [], total: 51 });
  expect(api.get).toHaveBeenCalledWith("/v1/sales", {
    params: { prescription_id: "rx1", offset: 25, limit: 25 },
    signal,
  });
});
