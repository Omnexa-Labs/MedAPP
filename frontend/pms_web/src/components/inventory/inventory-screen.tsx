"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/stores/auth.store";
import {
  drugsRepo,
  Drug,
  DrugCreate,
  DrugWithStock,
} from "@/lib/repositories/drugs";
import { formatCents } from "@/lib/utils";
import { LoadError, Pagination, WriteError } from "./operation-state";
import { moneyToCents, useInventoryAction } from "./use-inventory-action";

export function InventoryScreen() {
  const params = useSearchParams();
  const [search, setSearch] = useState(""),
    [term, setTerm] = useState("");
  const [filter, setFilter] = useState(
    params.get("filter") === "low" ? "low" : "active",
  );
  const [offset, setOffset] = useState(0),
    [editing, setEditing] = useState<DrugWithStock | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const scope = useAuthStore((s) => s.scope),
    role = useAuthStore((s) => s.user?.role);
  const canEdit = role === "pharmacy_admin" || role === "pharmacist";
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ["inventory", "drugs", scope, term, filter, offset],
    queryFn: ({ signal }) =>
      drugsRepo.page(
        {
          search: term,
          active: filter !== "archived",
          low_stock_only: filter === "low",
          limit: 25,
          offset,
        },
        signal,
      ),
    enabled: !!scope,
  });
  function saved(drug: Drug) {
    setEditing(null);
    setNotice(`${drug.name} saved.`);
    for (const key of ["inventory", "drugs", "reports"])
      void client.invalidateQueries({ queryKey: [key] });
  }
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Inventory</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage your drug catalog and non-expired stock. Receive and adjust
            units in Batches.
          </p>
        </div>
        {canEdit && (
          <Button
            className="min-h-11"
            disabled={!!editing || !list.data?.currency}
            onClick={() => setEditing("new")}
          >
            Add drug
          </Button>
        )}
      </header>
      {notice && (
        <p role="status" className="rounded-lg bg-teal-50 p-4 text-teal-900">
          {notice}
        </p>
      )}
      {editing && canEdit && (
        <DrugEditor
          key={editing === "new" ? "new" : editing.id}
          drug={editing === "new" ? null : editing}
          currency={
            editing === "new" ? list.data?.currency || "GHS" : editing.currency
          }
          onSaved={saved}
          close={() => {
            setEditing(null);
            void list.refetch();
          }}
        />
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setOffset(0);
          setTerm(search.trim());
        }}
      >
        <label className="flex min-w-48 flex-1 flex-col gap-2 text-sm">
          Search by drug, brand or SKU
          <Input
            className="min-h-11"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={128}
          />
        </label>
        <Button className="min-h-11" type="submit">
          Search
        </Button>
        <label className="flex flex-col gap-2 text-sm">
          Show
          <select
            className="min-h-11 rounded-md border bg-white px-3"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setOffset(0);
            }}
          >
            <option value="active">Active drugs</option>
            <option value="low">Low stock</option>
            <option value="archived">Archived drugs</option>
          </select>
        </label>
        <Button
          className="min-h-11"
          variant="outline"
          type="button"
          disabled={list.isFetching}
          onClick={() => void list.refetch()}
        >
          Refresh inventory
        </Button>
      </form>
      {list.isPending ? (
        <p role="status">Loading inventory…</p>
      ) : list.isError ? (
        <LoadError error={list.error} retry={() => void list.refetch()} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Drug catalog and available stock
              </caption>
              <thead className="border-b bg-slate-50">
                <tr>
                  {[
                    "Drug",
                    "Stock",
                    "Reorder level",
                    "Price",
                    "Status",
                    "Actions",
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
                {list.data.items.map((drug) => (
                  <tr key={drug.id} className="border-b last:border-0">
                    <td className="min-w-48 p-4">
                      <p className="font-semibold">{drug.name}</p>
                      <p className="text-slate-500">
                        {[drug.brand_name, drug.strength, drug.form]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {drug.sku && <p className="text-xs">SKU: {drug.sku}</p>}
                      {drug.requires_prescription && (
                        <p className="text-xs text-teal-800">
                          Prescription required
                        </p>
                      )}
                    </td>
                    <td className="p-4">
                      {drug.quantity_on_hand} {drug.unit}
                    </td>
                    <td className="p-4">{drug.reorder_level}</td>
                    <td className="whitespace-nowrap p-4">
                      {formatCents(
                        drug.default_selling_price_cents,
                        drug.currency,
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`rounded-full px-3 py-1 ${!drug.is_active ? "bg-slate-100" : drug.is_low_stock ? "bg-amber-100 text-amber-900" : "bg-teal-50 text-teal-900"}`}
                      >
                        {!drug.is_active
                          ? "Archived"
                          : drug.is_low_stock
                            ? "Low stock"
                            : "In stock"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-3">
                        <Link
                          className="inline-flex min-h-11 items-center text-teal-800 underline"
                          href={`/batches?drug_id=${drug.id}`}
                        >
                          View batches
                        </Link>
                        {canEdit && (
                          <Button
                            className="min-h-11"
                            variant="outline"
                            disabled={!!editing}
                            onClick={() => setEditing(drug)}
                          >
                            Edit {drug.name}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!list.data.items.length && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-600">
                      {term || filter !== "active"
                        ? "No drugs match these filters."
                        : "Your catalog is empty. Add your first drug to begin receiving stock."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            offset={offset}
            count={list.data.items.length}
            total={list.data.total}
            busy={list.isFetching}
            onPage={setOffset}
          />
        </>
      )}
    </div>
  );
}

function DrugEditor({
  drug,
  currency,
  onSaved,
  close,
}: {
  drug: DrugWithStock | null;
  currency: string;
  onSaved: (drug: Drug) => void;
  close: () => void;
}) {
  const [form, setForm] = useState({
    name: drug?.name || "",
    brand: drug?.brand_name || "",
    sku: drug?.sku || "",
    category: drug?.category || "general",
    form: drug?.form || "tablet",
    strength: drug?.strength || "",
    unit: drug?.unit || "tablet",
    reorder: String(drug?.reorder_level ?? 10),
    price: ((drug?.default_selling_price_cents || 0) / 100).toFixed(2),
    notes: drug?.notes || "",
    rx: drug?.requires_prescription || false,
    active: drug?.is_active ?? true,
  });
  const [validation, setValidation] = useState("");
  const action = useInventoryAction(onSaved, !!drug);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    setValidation("");
    try {
      const body: DrugCreate = {
        name: form.name.trim(),
        brand_name: form.brand.trim() || null,
        sku: form.sku.trim() || null,
        category: form.category.trim(),
        form: form.form.trim(),
        strength: form.strength.trim(),
        unit: form.unit.trim(),
        reorder_level: Number(form.reorder),
        default_selling_price_cents: moneyToCents(form.price),
        notes: form.notes.trim() || null,
        requires_prescription: form.rx,
      };
      void action.run((signal, key) =>
        drug
          ? drugsRepo.update(
              drug.id,
              { ...body, version: drug.version, is_active: form.active },
              signal,
            )
          : drugsRepo.create(body, key, signal),
      );
    } catch (error) {
      setValidation(
        error instanceof Error ? error.message : "Check the entered values.",
      );
    }
  }
  const entries = [
    { key: "name", label: "Drug name", max: 255, required: true },
    { key: "brand", label: "Brand", max: 255 },
    { key: "sku", label: "SKU", max: 64 },
    { key: "category", label: "Category", max: 64, required: true },
    { key: "form", label: "Dosage form", max: 64, required: true },
    { key: "strength", label: "Strength", max: 64, required: true },
    { key: "unit", label: "Stock unit", max: 32, required: true },
    { key: "reorder", label: "Reorder level", type: "number", required: true },
    {
      key: "price",
      label: `Selling price (${currency})`,
      type: "number",
      required: true,
    },
  ] as const;
  return (
    <form
      aria-label={drug ? "Edit drug" : "Add drug"}
      onSubmit={submit}
      className="space-y-5 rounded-xl border-2 border-teal-700 bg-white p-5"
    >
      <h2 className="text-xl font-semibold">
        {drug ? `Edit ${drug.name}` : "Add drug"}
      </h2>
      <p className="text-sm text-slate-600">
        Catalog changes do not add stock. Receive actual quantities in Batches.
      </p>
      <fieldset disabled={action.locked} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Drug details</legend>
        {entries.map((field) => (
          <label key={field.key} className="space-y-2 text-sm">
            <span>{field.label}</span>
            <Input
              className="min-h-11"
              value={form[field.key]}
              required={"required" in field && field.required}
              type={"type" in field ? field.type : "text"}
              min={0}
              step={field.key === "price" ? "0.01" : "1"}
              max={field.key === "reorder" ? 1000000 : undefined}
              maxLength={"max" in field ? field.max : undefined}
              onChange={(event) =>
                setForm({ ...form, [field.key]: event.target.value })
              }
            />
          </label>
        ))}
        <label className="space-y-2 text-sm sm:col-span-2">
          <span>Notes</span>
          <textarea
            className="w-full rounded-md border p-3"
            value={form.notes}
            maxLength={4000}
            onChange={(event) =>
              setForm({ ...form, notes: event.target.value })
            }
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.rx}
            onChange={(event) => setForm({ ...form, rx: event.target.checked })}
          />
          Requires prescription
        </label>
        {drug && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm({ ...form, active: event.target.checked })
              }
            />
            Active in catalog
          </label>
        )}
      </fieldset>
      {drug && !form.active && (
        <p className="text-sm text-amber-800">
          Archiving hides this drug from new sales and receipts. Existing
          batches and history are retained.
        </p>
      )}
      {validation && <p role="alert">{validation}</p>}
      <WriteError {...action} />
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          className="min-h-11"
          disabled={action.busy || action.conflict}
        >
          {action.busy
            ? "Saving…"
            : action.uncertain
              ? "Retry same request"
              : "Save drug"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={action.busy || action.uncertain}
          onClick={close}
        >
          {action.conflict ? "Close and reload" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}
