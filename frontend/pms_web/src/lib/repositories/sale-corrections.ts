import api from "@/lib/api/client";
import type { Sale } from "./sales";
import type { CancelTransaction, Page, PaymentMethod } from "./transactions";

export interface CorrectionCreate extends CancelTransaction {
  prescription_version?: number;
  kind: "not_collected" | "customer_return";
  stock_confirmed: true;
  items: { sale_item_id: string; quantity: number }[];
}
export interface CorrectionQuote {
  credit_cents: number;
  currency: string;
  items: { sale_item_id: string; quantity: number; credit_cents: number }[];
}
export interface Correction extends Omit<CorrectionQuote, "currency"> {
  id: string;
  sale_id: string;
  number: string;
  kind: CorrectionCreate["kind"];
  reason: string;
  actor_staff_id: string;
  actor_name?: string | null;
  created_at: string;
}
export interface RefundCreate extends CancelTransaction {
  amount_cents: number;
  payment_method: PaymentMethod;
  payment_ref: string;
  payment_confirmed: true;
}
export interface Refund {
  id: string;
  sale_id: string;
  number: string;
  amount_cents: number;
  payment_method: string;
  payment_ref: string;
  reason: string;
  actor_staff_id: string;
  actor_name?: string | null;
  created_at: string;
  status: "recorded" | "voided";
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
}
export interface ReconcilePrescription extends CancelTransaction {
  prescription_version: number;
  allocations: { sale_item_id: string; prescription_item_id: string }[];
}
const options = (key: string, signal?: AbortSignal) => ({
  signal,
  headers: { "Idempotency-Key": key },
});
export const correctionsRepo = {
  list: async (
    id: string,
    offset = 0,
    signal?: AbortSignal,
  ): Promise<Page<Correction>> =>
    (
      await api.get(`/v1/sales/${id}/corrections`, {
        params: { offset, limit: 25 },
        signal,
      })
    ).data,
  refunds: async (
    id: string,
    offset = 0,
    signal?: AbortSignal,
  ): Promise<Page<Refund>> =>
    (
      await api.get(`/v1/sales/${id}/refunds`, {
        params: { offset, limit: 25 },
        signal,
      })
    ).data,
  quote: async (
    id: string,
    body: CorrectionCreate,
    signal?: AbortSignal,
  ): Promise<CorrectionQuote> =>
    (await api.post(`/v1/sales/${id}/corrections/quote`, body, { signal }))
      .data,
  correct: async (
    id: string,
    body: CorrectionCreate,
    key: string,
    signal?: AbortSignal,
  ): Promise<Correction> =>
    (await api.post(`/v1/sales/${id}/corrections`, body, options(key, signal)))
      .data,
  refund: async (
    id: string,
    body: RefundCreate,
    key: string,
    signal?: AbortSignal,
  ): Promise<Refund> =>
    (await api.post(`/v1/sales/${id}/refunds`, body, options(key, signal)))
      .data,
  voidRefund: async (
    id: string,
    refundId: string,
    body: CancelTransaction & { entry_was_incorrect: true },
    key: string,
    signal?: AbortSignal,
  ): Promise<Refund> =>
    (
      await api.post(
        `/v1/sales/${id}/refunds/${refundId}/void`,
        body,
        options(key, signal),
      )
    ).data,
  reconcile: async (
    id: string,
    body: ReconcilePrescription,
    key: string,
    signal?: AbortSignal,
  ): Promise<Sale> =>
    (
      await api.post(
        `/v1/sales/${id}/reconcile-prescription`,
        body,
        options(key, signal),
      )
    ).data,
};
