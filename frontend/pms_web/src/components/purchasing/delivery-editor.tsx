"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  moneyToCents,
  useInventoryAction,
} from "@/components/inventory/use-inventory-action";
import {
  PurchaseOrder,
  purchaseOrdersRepo,
} from "@/lib/repositories/purchaseOrders";
import { ActionButtons } from "./action-buttons";

export function DeliveryEditor({
  order,
  saved,
  close,
}: {
  order: PurchaseOrder;
  saved: (order: PurchaseOrder) => void;
  close: () => void;
}) {
  const available = order.items.filter(
    (item) => (item.quantity_outstanding || 0) > 0,
  );
  const newRow = () => ({
    id: crypto.randomUUID(),
    item: available[0]?.id || "",
    batch: "",
    quantity: "",
    cost: "",
    price: "",
    expiry: "",
  });
  const [rows, setRows] = useState(() => [newRow()]);
  const [received, setReceived] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [reference, setReference] = useState(""),
    [validation, setValidation] = useState("");
  const action = useInventoryAction(saved, true);
  function update(id: string, values: Partial<(typeof rows)[number]>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...values } : row)),
    );
  }
  return (
    <form
      aria-label="Record delivery"
      className="space-y-5 rounded-xl border-2 border-teal-700 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setValidation("");
        try {
          const totals = new Map<string, number>();
          const lines = rows.map((row) => {
            const quantity = Number(row.quantity);
            if (
              !Number.isInteger(quantity) ||
              quantity <= 0 ||
              quantity > 1000000
            )
              throw new Error(
                "Enter a positive whole quantity for each batch.",
              );
            totals.set(row.item, (totals.get(row.item) || 0) + quantity);
            return {
              purchase_order_item_id: row.item,
              batch_number: row.batch.trim(),
              quantity_received: quantity,
              unit_cost_cents: row.cost === "" ? null : moneyToCents(row.cost),
              selling_price_cents:
                row.price === "" ? null : moneyToCents(row.price),
              expiry_date: row.expiry,
            };
          });
          for (const [id, quantity] of totals) {
            if (
              quantity >
              (available.find((item) => item.id === id)?.quantity_outstanding ||
                0)
            )
              throw new Error(
                "The combined batch quantity exceeds the outstanding order line.",
              );
          }
          void action.run((signal, key) =>
            purchaseOrdersRepo.receive(
              order.id,
              {
                version: order.version,
                received_at: received,
                delivery_reference: reference.trim() || null,
                lines,
              },
              key,
              signal,
            ),
          );
        } catch (error) {
          setValidation(
            error instanceof Error
              ? error.message
              : "Check the delivery details.",
          );
        }
      }}
    >
      <h2 className="text-xl font-semibold">Record delivery</h2>
      <p className="text-sm text-slate-600">
        Enter the stock delivered today. You can receive part of an order and
        split a drug across supplier batches. Read expiry dates from the
        packaging.
      </p>
      <fieldset disabled={action.locked} className="space-y-5">
        <legend className="sr-only">Delivery details</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            Received date
            <Input
              className="min-h-11"
              required
              type="date"
              value={received}
              onChange={(event) => setReceived(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            Delivery reference (optional)
            <Input
              className="min-h-11"
              maxLength={64}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
        </div>
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <label className="space-y-2 text-sm">
              Order line {index + 1}
              <select
                required
                className="min-h-11 w-full rounded-md border bg-white px-3"
                value={row.item}
                onChange={(event) =>
                  update(row.id, { item: event.target.value })
                }
              >
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.drug_name} · {item.quantity_outstanding} outstanding
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm">
              Batch number {index + 1}
              <Input
                className="min-h-11"
                required
                maxLength={64}
                value={row.batch}
                onChange={(event) =>
                  update(row.id, { batch: event.target.value })
                }
              />
            </label>
            <label className="space-y-2 text-sm">
              Units received {index + 1}
              <Input
                className="min-h-11"
                required
                type="number"
                min={1}
                step="1"
                max={
                  available.find((item) => item.id === row.item)
                    ?.quantity_outstanding || 0
                }
                value={row.quantity}
                onChange={(event) =>
                  update(row.id, { quantity: event.target.value })
                }
              />
            </label>
            <label className="space-y-2 text-sm">
              Unit cost ({order.currency}, optional) {index + 1}
              <Input
                className="min-h-11"
                type="number"
                min={0}
                step="0.01"
                placeholder={(
                  (available.find((item) => item.id === row.item)
                    ?.unit_cost_cents || 0) / 100
                ).toFixed(2)}
                value={row.cost}
                onChange={(event) =>
                  update(row.id, { cost: event.target.value })
                }
              />
            </label>
            <label className="space-y-2 text-sm">
              Selling price ({order.currency}, optional) {index + 1}
              <Input
                className="min-h-11"
                type="number"
                min={0}
                step="0.01"
                placeholder="Catalog price"
                value={row.price}
                onChange={(event) =>
                  update(row.id, { price: event.target.value })
                }
              />
            </label>
            <label className="space-y-2 text-sm">
              Expiry date {index + 1}
              <Input
                className="min-h-11"
                required
                type="date"
                value={row.expiry}
                onChange={(event) =>
                  update(row.id, { expiry: event.target.value })
                }
              />
            </label>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={rows.length === 1}
              onClick={() =>
                setRows((current) =>
                  current.filter((item) => item.id !== row.id),
                )
              }
            >
              Remove batch {index + 1}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={rows.length >= 200}
          onClick={() => setRows((current) => [...current, newRow()])}
        >
          Add delivered batch
        </Button>
      </fieldset>
      <p className="text-sm text-slate-600">
        A blank unit cost uses the order price; a blank selling price uses the
        catalog price. Enter 0.00 explicitly for free stock.
      </p>
      {validation && (
        <p role="alert" className="text-red-800">
          {validation}
        </p>
      )}
      <ActionButtons
        action={action}
        label="Save delivery"
        close={close}
        disabled={!available.length}
      />
    </form>
  );
}
