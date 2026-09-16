"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/inventory/operation-state";
import {
  moneyToCents,
  useInventoryAction,
} from "@/components/inventory/use-inventory-action";
import { drugsRepo } from "@/lib/repositories/drugs";
import { suppliersRepo } from "@/lib/repositories/suppliers";
import {
  POCreate,
  PurchaseOrder,
  purchaseOrdersRepo,
} from "@/lib/repositories/purchaseOrders";
import { formatCents } from "@/lib/utils";
import { ActionButtons } from "./action-buttons";

const emptyLine = () => ({
  id: crypto.randomUUID(),
  drug: "",
  quantity: "",
  cost: "0.00",
});
export function OrderEditor({
  order,
  currency,
  saved,
  close,
}: {
  order?: PurchaseOrder;
  currency: string;
  saved: (order: PurchaseOrder) => void;
  close: () => void;
}) {
  const [supplier, setSupplier] = useState(order?.supplier_id || ""),
    [expected, setExpected] = useState(order?.expected_at || "");
  const [notes, setNotes] = useState(order?.notes || ""),
    [search, setSearch] = useState("");
  const [lines, setLines] = useState(
    () =>
      order?.items.map((item) => ({
        id: item.id,
        drug: item.drug_id,
        quantity: String(item.quantity),
        cost: (item.unit_cost_cents / 100).toFixed(2),
      })) || [emptyLine()],
  );
  const [validation, setValidation] = useState("");
  const action = useInventoryAction(saved, !!order);
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersRepo.list(),
  });
  const catalog = useQuery({
    queryKey: ["inventory", "order-picker", search],
    queryFn: ({ signal }) => drugsRepo.page({ search, limit: 50 }, signal),
  });
  const choices = new Map(
    order?.items.map((item) => [item.drug_id, item.drug_name]) || [],
  );
  for (const drug of catalog.data?.items || [])
    choices.set(drug.id, `${drug.name} · ${drug.strength}`);
  const [selectedNames, setSelectedNames] = useState(() => new Map(choices));
  // Preserve chosen labels when the next catalog search changes the options.
  const options = new Map([...selectedNames, ...choices]);
  let total: number | null = 0;
  try {
    for (const line of lines) {
      if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1)
        throw new Error();
      total += Number(line.quantity) * moneyToCents(line.cost);
    }
    if (total > 2147483647) total = null;
  } catch {
    total = null;
  }
  function update(id: string, values: Partial<(typeof lines)[number]>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...values } : line)),
    );
  }
  return (
    <form
      aria-label={order ? "Edit purchase order" : "New purchase order"}
      className="space-y-5 rounded-xl border-2 border-teal-700 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setValidation("");
        try {
          if (
            total === null ||
            lines.some((line) => !line.drug || Number(line.quantity) > 1000000)
          )
            throw new Error(
              "Choose a drug and valid whole quantity for every line, and check the order total.",
            );
          if (new Set(lines.map((line) => line.drug)).size !== lines.length)
            throw new Error(
              "Use one order line per drug. Deliveries can be split into multiple batches.",
            );
          const body: POCreate = {
            supplier_id: supplier,
            expected_at: expected || null,
            notes: notes.trim() || null,
            items: lines.map((line) => ({
              drug_id: line.drug,
              quantity: Number(line.quantity),
              unit_cost_cents: moneyToCents(line.cost),
            })),
          };
          void action.run((signal, key) =>
            order
              ? purchaseOrdersRepo.update(
                  order.id,
                  { ...body, version: order.version },
                  key,
                  signal,
                )
              : purchaseOrdersRepo.create(body, key, signal),
          );
        } catch (error) {
          setValidation(
            error instanceof Error ? error.message : "Check the order details.",
          );
        }
      }}
    >
      <h2 className="text-xl font-semibold">
        {order ? "Edit purchase order" : "New purchase order"}
      </h2>
      <p className="text-sm text-slate-600">
        Save a draft, place the order with your supplier, then mark it as
        ordered here.
      </p>
      <fieldset disabled={action.locked} className="space-y-5">
        <legend className="sr-only">Purchase order details</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            Supplier
            <select
              required
              className="min-h-11 w-full rounded-md border bg-white px-3"
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
            >
              <option value="">Choose supplier</option>
              {order &&
                !suppliers.data?.some(
                  (item) => item.id === order.supplier_id,
                ) && (
                  <option value={order.supplier_id}>
                    {order.supplier_name} (check availability)
                  </option>
                )}
              {suppliers.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            Expected date (optional)
            <Input
              className="min-h-11"
              type="date"
              value={expected}
              onChange={(event) => setExpected(event.target.value)}
            />
          </label>
        </div>
        {suppliers.isError && (
          <LoadError
            error={suppliers.error}
            retry={() => void suppliers.refetch()}
          />
        )}
        {suppliers.data?.length === 0 && (
          <p className="text-sm">
            Add a supplier before creating an order.{" "}
            <Link className="text-teal-800 underline" href="/suppliers">
              Manage suppliers
            </Link>
          </p>
        )}
        <label className="block space-y-2 text-sm">
          Search catalog
          <Input
            className="min-h-11"
            maxLength={128}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {catalog.isError && (
          <LoadError
            error={catalog.error}
            retry={() => void catalog.refetch()}
          />
        )}
        {!!catalog.data && catalog.data.total > 50 && (
          <p className="text-sm text-slate-600">
            Showing the first 50 matches. Refine your search to find another
            drug.
          </p>
        )}
        <div className="space-y-4">
          {lines.map((line, index) => (
            <div
              key={line.id}
              className="grid items-end gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <label className="space-y-2 text-sm">
                Drug {index + 1}
                <select
                  required
                  className="min-h-11 w-full rounded-md border bg-white px-3"
                  value={line.drug}
                  onChange={(event) => {
                    const id = event.target.value;
                    setSelectedNames((current) =>
                      new Map(current).set(
                        id,
                        options.get(id) || "Selected drug",
                      ),
                    );
                    update(line.id, { drug: id });
                  }}
                >
                  <option value="">Choose drug</option>
                  {[...options].map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                Quantity {index + 1}
                <Input
                  className="min-h-11"
                  type="number"
                  min={1}
                  max={1000000}
                  step="1"
                  required
                  value={line.quantity}
                  onChange={(event) =>
                    update(line.id, { quantity: event.target.value })
                  }
                />
              </label>
              <label className="space-y-2 text-sm">
                Unit cost ({currency}) {index + 1}
                <Input
                  className="min-h-11"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={line.cost}
                  onChange={(event) =>
                    update(line.id, { cost: event.target.value })
                  }
                />
              </label>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={lines.length === 1}
                onClick={() =>
                  setLines((current) =>
                    current.filter((item) => item.id !== line.id),
                  )
                }
              >
                Remove line {index + 1}
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          className="min-h-11"
          variant="outline"
          disabled={lines.length >= 100}
          onClick={() => setLines((current) => [...current, emptyLine()])}
        >
          Add order line
        </Button>
        <label className="block space-y-2 text-sm">
          Order notes
          <textarea
            className="w-full rounded-md border p-3"
            maxLength={4000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </fieldset>
      <p className="font-semibold">
        Ordered total:{" "}
        {total === null
          ? "Check quantities and prices"
          : formatCents(total, currency)}
      </p>
      {validation && (
        <p role="alert" className="text-red-800">
          {validation}
        </p>
      )}
      <ActionButtons
        action={action}
        label="Save order draft"
        close={close}
        disabled={!supplier || suppliers.isPending}
      />
    </form>
  );
}
