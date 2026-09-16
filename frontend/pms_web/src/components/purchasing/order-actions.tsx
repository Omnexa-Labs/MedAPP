"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoadError } from "@/components/inventory/operation-state";
import { useInventoryAction } from "@/components/inventory/use-inventory-action";
import {
  PurchaseOrder,
  purchaseOrdersRepo,
} from "@/lib/repositories/purchaseOrders";
import { ActionButtons } from "./action-buttons";

export function OrderStatusAction({
  order,
  kind,
  saved,
  close,
}: {
  order: PurchaseOrder;
  kind: "ordered" | "cancel";
  saved: (order: PurchaseOrder) => void;
  close: () => void;
}) {
  const [reason, setReason] = useState("");
  const action = useInventoryAction(saved, true);
  const label =
    kind === "ordered" ? "Mark as ordered" : "Cancel remaining order";
  return (
    <form
      aria-label={label}
      className="space-y-5 rounded-xl border-2 border-teal-700 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run((signal, key) =>
          kind === "ordered"
            ? purchaseOrdersRepo.send(order.id, order.version, key, signal)
            : purchaseOrdersRepo.cancel(
                order.id,
                order.version,
                reason.trim(),
                key,
                signal,
              ),
        );
      }}
    >
      <h2 className="text-xl font-semibold">{label}</h2>
      <p className="text-sm text-slate-600">
        {kind === "ordered"
          ? "Record that you have placed this order with your supplier. Contact the supplier through your usual channel before marking it here."
          : "Close the unreceived quantities on this order. Received stock and its history remain recorded."}
      </p>
      {kind === "cancel" && (
        <fieldset disabled={action.locked}>
          <label className="block space-y-2 text-sm">
            Cancellation reason
            <textarea
              className="w-full rounded-md border p-3"
              required
              minLength={5}
              maxLength={255}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </fieldset>
      )}
      <ActionButtons action={action} label={label} close={close} />
    </form>
  );
}

export function ReconcileReceipts({
  order,
  saved,
  close,
}: {
  order: PurchaseOrder;
  saved: (order: PurchaseOrder) => void;
  close: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({}),
    [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const action = useInventoryAction(saved, true);
  const batches = useQuery({
    queryKey: ["purchase-orders", "legacy-batches", order.id],
    queryFn: ({ signal }) => purchaseOrdersRepo.legacyBatches(order.id, signal),
  });
  function chosen(id: string, drugId: string) {
    const matches = order.items.filter((item) => item.drug_id === drugId);
    return choices[id] ?? (matches.length === 1 ? matches[0].id : "");
  }
  return (
    <form
      aria-label="Reconcile earlier receipts"
      className="space-y-5 rounded-xl border-2 border-amber-600 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirmed || !batches.data?.length) return;
        void action.run((signal, key) =>
          purchaseOrdersRepo.reconcile(
            order.id,
            {
              version: order.version,
              note: note.trim(),
              allocations: batches.data!.map((batch) => ({
                batch_id: batch.id,
                purchase_order_item_id: chosen(batch.id, batch.drug_id),
              })),
            },
            key,
            signal,
          ),
        );
      }}
    >
      <h2 className="text-xl font-semibold">Reconcile earlier receipts</h2>
      <p className="text-sm text-slate-600">
        Match historical delivery batches to the correct order lines using your
        receipt records. This records the original received quantities and
        preserves the current stock balance.
      </p>
      {batches.isPending ? (
        <p role="status">Loading earlier receipts…</p>
      ) : batches.isError ? (
        <LoadError error={batches.error} retry={() => void batches.refetch()} />
      ) : !batches.data.length ? (
        <p role="alert">
          This order has no recorded delivery batches. Review the original
          receipt evidence before reopening it for stock receipt.
        </p>
      ) : (
        <fieldset disabled={action.locked} className="space-y-4">
          <legend className="sr-only">Historical batch allocations</legend>
          {batches.data.map((batch) => (
            <label
              key={batch.id}
              className="block space-y-2 rounded-lg border p-4 text-sm"
            >
              <span>
                {batch.batch_number} · received {batch.quantity_received} units
                · currently on hand {batch.quantity_on_hand}
              </span>
              <select
                aria-label={`Order line for ${batch.batch_number}`}
                required
                className="min-h-11 w-full rounded-md border bg-white px-3"
                value={chosen(batch.id, batch.drug_id)}
                onChange={(event) =>
                  setChoices((current) => ({
                    ...current,
                    [batch.id]: event.target.value,
                  }))
                }
              >
                <option value="">Choose matching order line</option>
                {order.items
                  .filter((item) => item.drug_id === batch.drug_id)
                  .map((item, index) => (
                    <option key={item.id} value={item.id}>
                      {item.drug_name} · ordered {item.quantity} · matching line{" "}
                      {index + 1}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <label className="block space-y-2 text-sm">
            Review note
            <textarea
              required
              minLength={5}
              maxLength={1000}
              className="w-full rounded-md border p-3"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I checked these allocations against the delivery records.
          </label>
        </fieldset>
      )}
      <ActionButtons
        action={action}
        label="Confirm receipt allocations"
        close={close}
        disabled={!confirmed || !batches.data?.length}
      />
    </form>
  );
}
