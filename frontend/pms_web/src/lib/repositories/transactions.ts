export interface TransactionQuote {
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  items: {
    drug_id: string;
    drug_name: string;
    batch_id: string;
    batch_number: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
  }[];
}
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export interface CancelTransaction {
  version: number;
  reason: string;
}
export type PaymentMethod = "cash" | "card" | "mobile_money" | "insurance";
export interface PaymentDetails {
  payment_method?: PaymentMethod;
  payment_ref?: string;
  notes?: string;
  expected_total_cents?: number;
}
