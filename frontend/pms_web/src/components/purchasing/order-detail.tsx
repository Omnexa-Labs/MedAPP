"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/inventory/operation-state";
import { useAuthStore } from "@/lib/stores/auth.store";
import {
  PurchaseOrder,
  purchaseOrdersRepo,
  orderStatusLabel,
} from "@/lib/repositories/purchaseOrders";
import { formatCents } from "@/lib/utils";
import { OrderEditor } from "./order-editor";
import { DeliveryEditor } from "./delivery-editor";
import { OrderStatusAction, ReconcileReceipts } from "./order-actions";
import { OrderHistory, OrderReceipts } from "./order-records";

type Editor = {
  kind: "edit" | "ordered" | "cancel" | "receive" | "reconcile";
  order: PurchaseOrder;
};
export function OrderDetail({ id }: { id: string }) {
  const scope = useAuthStore((s) => s.scope),
    role = useAuthStore((s) => s.user?.role);
  const canEdit = role === "pharmacy_admin" || role === "pharmacist";
  const [editor, setEditor] = useState<Editor | null>(null),
    [notice, setNotice] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["purchase-orders", "detail", scope, id],
    queryFn: ({ signal }) => purchaseOrdersRepo.get(id, signal),
    enabled: !!scope,
  });
  function close() {
    setEditor(null);
    void query.refetch();
  }
  function saved() {
    setEditor(null);
    setNotice(
      "Order updated. The saved quantities and delivery records are refreshed below.",
    );
    for (const key of [
      "purchase-orders",
      "batches",
      "inventory",
      "drugs",
      "reports",
    ])
      void client.invalidateQueries({ queryKey: [key] });
  }
  const po = query.data;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link
        href="/purchase-orders"
        className="inline-flex min-h-11 items-center text-teal-800 underline"
      >
        Back to purchase orders
      </Link>
      {query.isPending ? (
        <p role="status">Loading purchase order…</p>
      ) : query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : (
        po && (
          <>
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="break-all text-2xl font-semibold">
                  {po.po_number}
                </h1>
                <p className="mt-2">{po.supplier_name}</p>
                <p className="mt-2 text-sm font-medium text-teal-800">
                  {orderStatusLabel[po.status]}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {canEdit && po.receiving_reconciled && (
                  <>
                    {po.status === "draft" && (
                      <>
                        <Button
                          className="min-h-11"
                          variant="outline"
                          disabled={!!editor}
                          onClick={() => setEditor({ kind: "edit", order: po })}
                        >
                          Edit draft
                        </Button>
                        <Button
                          className="min-h-11"
                          disabled={!!editor}
                          onClick={() =>
                            setEditor({ kind: "ordered", order: po })
                          }
                        >
                          Mark as ordered
                        </Button>
                      </>
                    )}
                    {["sent", "partially_received"].includes(po.status) && (
                      <Button
                        className="min-h-11"
                        disabled={!!editor}
                        onClick={() =>
                          setEditor({ kind: "receive", order: po })
                        }
                      >
                        Record delivery
                      </Button>
                    )}
                    {["draft", "sent", "partially_received"].includes(
                      po.status,
                    ) && (
                      <Button
                        className="min-h-11"
                        variant="outline"
                        disabled={!!editor}
                        onClick={() => setEditor({ kind: "cancel", order: po })}
                      >
                        Cancel remaining order
                      </Button>
                    )}
                  </>
                )}
                <Button
                  className="min-h-11"
                  variant="outline"
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  Refresh order
                </Button>
              </div>
            </header>
            {notice && (
              <p
                role="status"
                className="rounded-lg bg-teal-50 p-4 text-teal-900"
              >
                {notice}
              </p>
            )}
            {!po.receiving_reconciled && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-5">
                <p className="font-semibold">Earlier receipts need review</p>
                <p className="text-sm">
                  This order predates item-level receipt tracking. Its received
                  and outstanding quantities will be available after an
                  administrator matches the recorded batches to order lines.
                </p>
                {role === "pharmacy_admin" && (
                  <Button
                    className="min-h-11"
                    variant="outline"
                    disabled={!!editor}
                    onClick={() => setEditor({ kind: "reconcile", order: po })}
                  >
                    Review earlier receipts
                  </Button>
                )}
              </div>
            )}
            {editor &&
              canEdit &&
              (editor.kind === "edit" ? (
                <OrderEditor
                  key="edit"
                  order={editor.order}
                  currency={editor.order.currency}
                  saved={saved}
                  close={close}
                />
              ) : editor.kind === "receive" ? (
                <DeliveryEditor
                  key="receive"
                  order={editor.order}
                  saved={saved}
                  close={close}
                />
              ) : editor.kind === "reconcile" ? (
                role === "pharmacy_admin" && (
                  <ReconcileReceipts
                    key="reconcile"
                    order={editor.order}
                    saved={saved}
                    close={close}
                  />
                )
              ) : (
                <OrderStatusAction
                  key={editor.kind}
                  order={editor.order}
                  kind={editor.kind}
                  saved={saved}
                  close={close}
                />
              ))}
            <section
              aria-label="Order summary"
              className="grid gap-5 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div>
                <p className="text-sm text-slate-600">Ordered total</p>
                <p className="mt-1 font-semibold">
                  {formatCents(po.total_cents, po.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Expected date</p>
                <p>{po.expected_at || "Not set"}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Created</p>
                <p>{po.created_at.slice(0, 10)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Order notes</p>
                <p className="whitespace-pre-wrap">{po.notes || "None"}</p>
              </div>
              {po.cancellation_reason && (
                <p className="text-sm sm:col-span-2 lg:col-span-4">
                  Cancellation reason: {po.cancellation_reason}
                </p>
              )}
            </section>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Ordered items and remaining quantities
                </caption>
                <thead className="border-b bg-slate-50">
                  <tr>
                    {[
                      "Drug",
                      "Ordered",
                      "Received",
                      "Outstanding",
                      "Cancelled",
                      "Unit cost",
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
                  {po.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-4 font-medium">{item.drug_name}</td>
                      <td className="p-4">{item.quantity}</td>
                      <td className="p-4">
                        {item.quantity_received ?? "Needs review"}
                        {(item.quantity_received || 0) > item.quantity && (
                          <p className="text-amber-800">
                            Historical over-receipt:{" "}
                            {(item.quantity_received || 0) - item.quantity}
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        {item.quantity_outstanding ?? "Needs review"}
                      </td>
                      <td className="p-4">
                        {item.quantity_cancelled ?? "Needs review"}
                      </td>
                      <td className="whitespace-nowrap p-4">
                        {formatCents(item.unit_cost_cents, po.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <OrderReceipts id={id} />
            {canEdit && <OrderHistory id={id} />}
          </>
        )
      )}
    </div>
  );
}
