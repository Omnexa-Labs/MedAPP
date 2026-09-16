"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LoadError, Pagination } from "@/components/inventory/operation-state";
import { batchesRepo } from "@/lib/repositories/batches";
import {
  PurchaseOrder,
  purchaseOrdersRepo,
  orderStatusLabel,
} from "@/lib/repositories/purchaseOrders";
import { formatCents, formatDateTime } from "@/lib/utils";

export function OrderReceipts({ id }: { id: string }) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ["batches", "purchase-order", id, offset],
    queryFn: ({ signal }) =>
      batchesRepo.page({ purchase_order_id: id, limit: 25, offset }, signal),
  });
  return (
    <section aria-label="Delivered batches" className="space-y-4">
      <h2 className="text-xl font-semibold">Delivered batches</h2>
      {query.isPending ? (
        <p role="status">Loading delivered batches…</p>
      ) : query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Purchase order deliveries</caption>
              <thead className="border-b bg-slate-50">
                <tr>
                  {[
                    "Drug / batch",
                    "Delivery",
                    "Received / on hand",
                    "Cost / selling price",
                    "Expiry",
                  ].map((label) => (
                    <th
                      key={label}
                      className="whitespace-nowrap p-4 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((batch) => (
                  <tr key={batch.id} className="border-b last:border-0">
                    <td className="p-4">
                      <p className="font-medium">{batch.drug_name}</p>
                      <p>{batch.batch_number}</p>
                      <Link
                        className="inline-flex min-h-11 items-center text-teal-800 underline"
                        href={`/batches?drug_id=${batch.drug_id}`}
                      >
                        View stock history
                      </Link>
                    </td>
                    <td className="p-4">
                      <p className="whitespace-nowrap">{batch.received_at}</p>
                      <p>
                        {batch.delivery_reference || "No reference recorded"}
                      </p>
                      {!batch.purchase_order_item_id && (
                        <p className="text-amber-800">
                          Historical allocation pending
                        </p>
                      )}
                    </td>
                    <td className="p-4">
                      {batch.quantity_received} received /{" "}
                      {batch.quantity_on_hand} on hand
                    </td>
                    <td className="whitespace-nowrap p-4">
                      <p>
                        {formatCents(batch.unit_cost_cents, batch.currency)}
                      </p>
                      <p>
                        {formatCents(batch.selling_price_cents, batch.currency)}
                      </p>
                    </td>
                    <td className="whitespace-nowrap p-4">
                      {batch.expiry_date}
                    </td>
                  </tr>
                ))}
                {!query.data.items.length && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-600">
                      No deliveries have been recorded for this order.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            offset={offset}
            count={query.data.items.length}
            total={query.data.total}
            busy={query.isFetching}
            onPage={setOffset}
          />
        </>
      )}
    </section>
  );
}

function SavedOrder({
  order,
  label,
}: {
  order?: PurchaseOrder;
  label: string;
}) {
  if (!order) return null;
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
      <h4 className="font-semibold">{label}</h4>
      <p>
        {order.supplier_name} · {orderStatusLabel[order.status]} ·{" "}
        {formatCents(order.total_cents, order.currency)}
      </p>
      <p>Expected: {order.expected_at || "Not set"}</p>
      <p>{order.notes}</p>
      <ul className="list-inside list-disc">
        {order.items.map((item) => (
          <li key={item.id}>
            {item.drug_name}: {item.quantity} ordered,{" "}
            {item.quantity_received ?? "unreconciled"} received ·{" "}
            {formatCents(item.unit_cost_cents, order.currency)} each
          </li>
        ))}
      </ul>
    </div>
  );
}
const labels: Record<string, string> = {
  "purchase_order.created": "Draft created",
  "purchase_order.updated": "Draft edited",
  "purchase_order.ordered": "Marked as ordered",
  "purchase_order.received": "Delivery recorded",
  "purchase_order.cancelled": "Remaining order cancelled",
  "purchase_order.reconciled": "Earlier receipts reconciled",
};
export function OrderHistory({ id }: { id: string }) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ["purchase-orders", "history", id, offset],
    queryFn: ({ signal }) => purchaseOrdersRepo.history(id, offset, signal),
  });
  return (
    <section
      aria-label="Order history"
      className="space-y-4 rounded-xl border bg-white p-5"
    >
      <h2 className="text-xl font-semibold">Order history</h2>
      {query.isPending ? (
        <p role="status">Loading order history…</p>
      ) : query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {!query.data.items.length && (
            <p className="text-sm text-slate-600">
              No tracked changes are available for this order.
            </p>
          )}
          <ol className="divide-y">
            {query.data.items.map((entry) => (
              <li key={entry.id} className="space-y-2 py-4">
                <h3 className="font-semibold">
                  {labels[entry.action] || "Order changed"}
                </h3>
                <p className="text-sm text-slate-600">
                  {entry.actor_name || "Earlier system entry"} ·{" "}
                  {formatDateTime(entry.created_at)}
                </p>
                {entry.details.note && (
                  <p className="text-sm">{entry.details.note}</p>
                )}
                {entry.details.received_at && (
                  <p className="text-sm">
                    Delivered {entry.details.received_at} ·{" "}
                    {entry.details.delivery_reference ||
                      "No delivery reference"}{" "}
                    · {entry.details.batch_ids?.length || 0} batches
                  </p>
                )}
                <details>
                  <summary className="min-h-11 cursor-pointer py-3 text-sm text-teal-800 underline">
                    View recorded order details
                  </summary>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SavedOrder label="Before" order={entry.details.before} />
                    <SavedOrder label="After" order={entry.details.after} />
                  </div>
                </details>
              </li>
            ))}
          </ol>
          <div className="flex gap-3">
            <Button
              className="min-h-11"
              variant="outline"
              disabled={!offset || query.isFetching}
              onClick={() => setOffset(offset - 50)}
            >
              Newer changes
            </Button>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={!query.data.has_more || query.isFetching}
              onClick={() => setOffset(offset + 50)}
            >
              Older changes
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
