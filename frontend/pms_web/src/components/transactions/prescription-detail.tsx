"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/inventory/operation-state";
import {
  prescriptionsRepo as repo,
  type DispenseRequest,
  type Prescription,
  type DispenseResult,
} from "@/lib/repositories/prescriptions";
import type { PaymentDetails } from "@/lib/repositories/transactions";
import { formatCents, formatDateTime } from "@/lib/utils";
import {
  CancelForm,
  CustomerName,
  PaymentFields,
  QuoteReview,
  useCanDispense,
  useRefreshTransactions,
} from "./shared";
import { SalesList } from "./transaction-lists";

function DispenseForm({
  rx,
  done,
  close,
}: {
  rx: Prescription;
  done: (result: DispenseResult) => void;
  close: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [payment, setPayment] = useState<PaymentDetails>({
    payment_method: "cash",
  });
  const [review, setReview] = useState<DispenseRequest | null>(null),
    [error, setError] = useState("");
  if (review)
    return (
      <QuoteReview
        title="Record dispense"
        details={review}
        quote={(signal) => repo.quote(rx.id, review, signal)}
        send={(total, key, signal) =>
          repo.dispense(
            rx.id,
            { ...review, expected_total_cents: total },
            key,
            signal,
          )
        }
        done={done}
        close={close}
      />
    );
  return (
    <form
      className="space-y-4 rounded-xl border bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const items = rx.items.map((item) => ({
          prescription_item_id: item.id,
          quantity: Number(quantities[item.id] || "0"),
        }));
        if (
          rx.items.some(
            (item, i) =>
              !/^\d+$/.test(quantities[item.id] || "0") ||
              items[i].quantity >
                item.quantity_prescribed - item.quantity_dispensed,
          ) ||
          !items.some((l) => l.quantity > 0)
        ) {
          setError(
            "Enter whole quantities within the remaining prescription, and choose at least one unit.",
          );
          return;
        }
        setReview({
          ...payment,
          version: rx.version,
          items: items.filter((l) => l.quantity > 0),
        });
      }}
    >
      <h2 className="text-xl font-semibold">Prepare dispense</h2>
      {rx.items
        .filter((item) => item.quantity_prescribed > item.quantity_dispensed)
        .map((item) => (
          <label className="block" key={item.id}>
            {item.drug_name_snapshot} ·{" "}
            {item.quantity_prescribed - item.quantity_dispensed} remaining
            <span className="block text-sm">
              {item.dosage_instructions || "No dosage instructions recorded"}
            </span>
            <Input
              aria-label={`Dispense quantity for ${item.drug_name_snapshot}`}
              type="number"
              min={0}
              max={item.quantity_prescribed - item.quantity_dispensed}
              step={1}
              value={quantities[item.id] || ""}
              placeholder="0"
              onChange={(e) =>
                setQuantities({ ...quantities, [item.id]: e.target.value })
              }
            />
          </label>
        ))}
      <PaymentFields value={payment} change={setPayment} />
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit">Review dispense</Button>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
export function PrescriptionDetail({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["prescriptions", id],
    queryFn: ({ signal }) => repo.get(id, signal),
  });
  const canDispense = useCanDispense(),
    refresh = useRefreshTransactions();
  const [mode, setMode] = useState<{
    action: "dispense" | "cancel";
    rx: Prescription;
  } | null>(null);
  const [receipt, setReceipt] = useState<DispenseResult | null>(null);
  if (!query.data)
    return query.isError ? (
      <LoadError error={query.error} retry={() => void query.refetch()} />
    ) : (
      <p role="status">Loading prescription…</p>
    );
  const rx = query.data;
  const close = () => {
    setMode(null);
    refresh();
  };
  return (
    <div className="space-y-5">
      <Link href="/prescriptions" className="underline">
        Prescriptions
      </Link>
      <h1 className="text-2xl font-bold">{rx.rx_number}</h1>
      {query.isError && (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      )}
      <section className="space-y-2 rounded-xl border bg-white p-5">
        <p>
          Status: {rx.status.replaceAll("_", " ")} ·{" "}
          {formatDateTime(rx.created_at)}
        </p>
        <p>
          Customer: <CustomerName id={rx.customer_id} />
        </p>
        <p>
          Prescriber: {rx.prescriber_name || "Not recorded"} · License:{" "}
          {rx.prescriber_license || "Not recorded"}
        </p>
        <p>
          Source: {rx.source.replaceAll("_", " ")}
          {rx.external_ref && ` · ${rx.external_ref}`}
        </p>
        {rx.notes && <p>Notes: {rx.notes}</p>}
        {rx.cancellation_reason && (
          <p>Cancellation reason: {rx.cancellation_reason}</p>
        )}
      </section>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Prescription quantities</caption>
          <thead>
            <tr>
              {[
                "Medicine",
                "Dosage",
                "Prescribed",
                "Dispensed",
                rx.status === "cancelled" ? "Cancelled units" : "Remaining",
              ].map((h) => (
                <th className="p-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rx.items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3">{item.drug_name_snapshot}</td>
                <td className="p-3">
                  {item.dosage_instructions || "Not recorded"}
                </td>
                <td className="p-3">{item.quantity_prescribed}</td>
                <td className="p-3">{item.quantity_dispensed}</td>
                <td className="p-3">
                  {Math.max(
                    0,
                    item.quantity_prescribed - item.quantity_dispensed,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {receipt && (
        <p role="status">
          Dispense recorded: {receipt.sale_number} ·{" "}
          {formatCents(receipt.sale_total_cents, receipt.currency)}.{" "}
          <Link className="underline" href={`/sales/${receipt.sale_id}`}>
            View saved receipt
          </Link>
        </p>
      )}
      {canDispense &&
        (mode ? (
          mode.action === "dispense" ? (
            <DispenseForm
              rx={mode.rx}
              done={(result) => {
                setReceipt(result);
                close();
              }}
              close={close}
            />
          ) : (
            <CancelForm
              version={mode.rx.version}
              title="Cancel remaining prescription"
              description="This stops further dispensing. Previously dispensed medicines and recorded sales stay on the record; no payment refund is issued."
              send={(body, key, signal) => repo.cancel(id, body, key, signal)}
              done={close}
              close={close}
            />
          )
        ) : (
          ["pending", "partially_dispensed"].includes(rx.status) && (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setMode({ action: "dispense", rx })}>
                Prepare dispense
              </Button>
              <Button
                variant="outline"
                onClick={() => setMode({ action: "cancel", rx })}
              >
                Cancel remaining prescription
              </Button>
            </div>
          )
        ))}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Dispense receipts</h2>
        <SalesList prescriptionId={id} />
      </section>
    </div>
  );
}
