"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { moneyToCents } from "@/components/inventory/use-inventory-action";
import {
  salesRepo,
  type Sale,
  type WalkInSaleCreate,
} from "@/lib/repositories/sales";
import type { Customer } from "@/lib/repositories/customers";
import type { DrugWithStock } from "@/lib/repositories/drugs";
import type { PaymentDetails } from "@/lib/repositories/transactions";
import { formatCents } from "@/lib/utils";
import {
  CustomerPicker,
  DrugPicker,
  PaymentFields,
  QuoteReview,
  useRefreshTransactions,
} from "./shared";

function Cart({ done }: { done: (sale: Sale) => void }) {
  const [cart, setCart] = useState<{ drug: DrugWithStock; quantity: string }[]>(
    [],
  );
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [payment, setPayment] = useState<PaymentDetails>({
    payment_method: "cash",
  });
  const [discount, setDiscount] = useState("0"),
    [tax, setTax] = useState("0");
  const [error, setError] = useState("");
  const [review, setReview] = useState<WalkInSaleCreate | null>(null);
  if (review)
    return (
      <QuoteReview
        title="Record sale"
        details={review}
        quote={(signal) => salesRepo.quote(review, signal)}
        send={(total, key, signal) =>
          salesRepo.createWalkIn(
            { ...review, expected_total_cents: total },
            key,
            signal,
          )
        }
        done={done}
        close={() => setReview(null)}
      />
    );
  return (
    <form
      className="space-y-5 rounded-xl border bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        try {
          if (
            !cart.length ||
            cart.some(
              (l) =>
                !/^\d+$/.test(l.quantity) ||
                Number(l.quantity) < 1 ||
                Number(l.quantity) > 1000000,
            )
          )
            throw new Error(
              "Enter whole quantities from 1 to 1,000,000 for every item.",
            );
          setReview({
            ...payment,
            customer_id: customer?.id,
            discount_cents: moneyToCents(discount),
            tax_cents: moneyToCents(tax),
            items: cart.map((l) => ({
              drug_id: l.drug.id,
              quantity: Number(l.quantity),
            })),
          });
        } catch (error) {
          setError((error as Error).message);
        }
      }}
    >
      <DrugPicker
        walkIn
        add={(drug) =>
          setCart((current) =>
            current.some((l) => l.drug.id === drug.id)
              ? current
              : [...current, { drug, quantity: "1" }],
          )
        }
      />
      {!cart.length && <p>Add a medicine to start a sale.</p>}
      {cart.map((line) => (
        <div
          key={line.drug.id}
          className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
        >
          <label className="grow">
            {line.drug.name} · {line.drug.strength}
            <span className="block text-sm">Quantity</span>
            <Input
              aria-label={`Quantity for ${line.drug.name}`}
              type="number"
              step="1"
              min="1"
              max="1000000"
              required
              value={line.quantity}
              onChange={(e) =>
                setCart(
                  cart.map((l) =>
                    l === line ? { ...l, quantity: e.target.value } : l,
                  ),
                )
              }
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCart(cart.filter((l) => l !== line))}
          >
            Remove {line.drug.name}
          </Button>
        </div>
      ))}
      <CustomerPicker value={customer} onChange={setCustomer} />
      <PaymentFields value={payment} change={setPayment} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Discount amount
          <Input
            inputMode="decimal"
            required
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </label>
        <label>
          Tax amount
          <Input
            inputMode="decimal"
            required
            value={tax}
            onChange={(e) => setTax(e.target.value)}
          />
        </label>
      </div>
      <p className="text-sm text-slate-600">
        Amounts use the pharmacy currency. The next step shows the total using
        current batch prices.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Button disabled={!cart.length || cart.length > 100} type="submit">
        Review sale
      </Button>
    </form>
  );
}
export function PosScreen() {
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const refresh = useRefreshTransactions();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Point of sale</h1>
      <p>Sell medicines that do not require a prescription.</p>
      {receipt ? (
        <section
          className="space-y-3 rounded-xl border bg-white p-5"
          role="status"
        >
          <h2 className="text-lg font-semibold">Sale recorded</h2>
          <p>
            {receipt.sale_number} ·{" "}
            {formatCents(receipt.total_cents, receipt.currency)}
          </p>
          <Link className="block underline" href={`/sales/${receipt.id}`}>
            View saved receipt
          </Link>
          <Button onClick={() => setReceipt(null)}>Start new sale</Button>
        </section>
      ) : (
        <Cart
          done={(sale) => {
            setReceipt(sale);
            refresh();
          }}
        />
      )}
    </div>
  );
}
