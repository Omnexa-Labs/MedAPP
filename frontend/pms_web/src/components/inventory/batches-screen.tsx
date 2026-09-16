"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/stores/auth.store";
import { batchesRepo, Batch, BatchAdjust } from "@/lib/repositories/batches";
import { drugsRepo } from "@/lib/repositories/drugs";
import { suppliersRepo } from "@/lib/repositories/suppliers";
import { formatCents, formatDateTime } from "@/lib/utils";
import { LoadError, Pagination, WriteError } from "./operation-state";
import { moneyToCents, useInventoryAction } from "./use-inventory-action";

export function BatchesScreen() {
  const params = useSearchParams(),
    client = useQueryClient();
  const [drugId, setDrugId] = useState(params.get("drug_id") || "");
  const [state, setState] = useState(
    ["available", "expiring", "expired", "empty"].includes(
      params.get("state") || "",
    )
      ? params.get("state")!
      : "all",
  );
  const [offset, setOffset] = useState(0),
    [editor, setEditor] = useState<Batch | "new" | null>(null);
  const [history, setHistory] = useState<Batch | null>(null),
    [notice, setNotice] = useState("");
  const scope = useAuthStore((s) => s.scope),
    role = useAuthStore((s) => s.user?.role);
  const canEdit = role === "pharmacy_admin" || role === "pharmacist";
  const list = useQuery({
    queryKey: ["batches", "page", scope, drugId, state, offset],
    queryFn: ({ signal }) =>
      batchesRepo.page(
        { drug_id: drugId || undefined, state, offset, limit: 25 },
        signal,
      ),
    enabled: !!scope,
  });
  function saved() {
    setEditor(null);
    setHistory(null);
    setNotice(
      "Stock recorded. The batch balance and stock history have been updated.",
    );
    for (const key of ["batches", "drugs", "inventory", "reports"])
      void client.invalidateQueries({ queryKey: [key] });
  }
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Batches & stock</h1>
          <p className="mt-2 text-sm text-slate-600">
            Receive deliveries, record corrections and review each stock
            movement. Expired batches are excluded from available stock.
          </p>
        </div>
        {canEdit && (
          <Button
            className="min-h-11"
            disabled={!!editor}
            onClick={() => setEditor("new")}
          >
            Receive stock
          </Button>
        )}
      </header>
      {notice && (
        <p role="status" className="rounded-lg bg-teal-50 p-4 text-teal-900">
          {notice}
        </p>
      )}
      {editor &&
        canEdit &&
        (editor === "new" ? (
          <ReceiveEditor
            key="receive"
            initialDrug={drugId}
            saved={saved}
            close={() => setEditor(null)}
          />
        ) : (
          <AdjustmentEditor
            key={editor.id}
            batch={editor}
            saved={saved}
            close={() => {
              setEditor(null);
              void list.refetch();
            }}
          />
        ))}
      {history && canEdit && (
        <MovementHistory
          key={history.id}
          batch={history}
          close={() => setHistory(null)}
        />
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-2 text-sm">
          Stock status
          <select
            className="min-h-11 rounded-md border bg-white px-3"
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setOffset(0);
            }}
          >
            <option value="all">All batches</option>
            <option value="available">Non-expired stock</option>
            <option value="expiring">Expires within 90 days</option>
            <option value="expired">Expired stock</option>
            <option value="empty">Empty batches</option>
          </select>
        </label>
        {drugId && (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setDrugId("");
              setOffset(0);
            }}
          >
            Show all drugs
          </Button>
        )}
        <Link
          href="/inventory"
          className="inline-flex min-h-11 items-center text-teal-800 underline"
        >
          Find a drug in inventory
        </Link>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={list.isFetching}
          onClick={() => void list.refetch()}
        >
          Refresh batches
        </Button>
      </div>
      {list.isPending ? (
        <p role="status">Loading batches…</p>
      ) : list.isError ? (
        <LoadError error={list.error} retry={() => void list.refetch()} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Stock batches</caption>
              <thead className="border-b bg-slate-50">
                <tr>
                  {[
                    "Drug / batch",
                    "On hand",
                    "Received",
                    "Cost / selling price",
                    "Expiry",
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
                {list.data.items.map((batch) => (
                  <tr key={batch.id} className="border-b last:border-0">
                    <td className="min-w-44 p-4">
                      <p className="font-semibold">
                        {batch.drug_name || "Drug"}
                      </p>
                      <p>{batch.batch_number}</p>
                    </td>
                    <td className="p-4 font-medium">
                      {batch.quantity_on_hand}
                    </td>
                    <td className="p-4">
                      <p>{batch.quantity_received} units</p>
                      <p className="whitespace-nowrap text-slate-500">
                        {batch.received_at}
                      </p>
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
                      {batch.quantity_on_hand > 0 &&
                        batch.expiry_date < list.data.inventory_date && (
                          <p className="font-semibold text-red-700">
                            Expired — unavailable
                          </p>
                        )}
                    </td>
                    <td className="p-4">
                      {canEdit ? (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={!!editor}
                            onClick={() => setEditor(batch)}
                          >
                            Adjust {batch.batch_number}
                          </Button>
                          <Button
                            variant="outline"
                            className="min-h-11"
                            onClick={() => setHistory(batch)}
                          >
                            History {batch.batch_number}
                          </Button>
                        </div>
                      ) : (
                        "Read only"
                      )}
                    </td>
                  </tr>
                ))}
                {!list.data.items.length && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-600">
                      No batches match this view. Receive stock after adding the
                      drug to your catalog.
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

function ReceiveEditor({
  initialDrug,
  saved,
  close,
}: {
  initialDrug: string;
  saved: () => void;
  close: () => void;
}) {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    drugId: initialDrug,
    supplier: "",
    number: "",
    quantity: "",
    cost: "0.00",
    price: "",
    received: new Date().toISOString().slice(0, 10),
    expires: "",
  });
  const [validation, setValidation] = useState("");
  const action = useInventoryAction<Batch>(saved);
  const drugs = useQuery({
    queryKey: ["inventory", "picker", search],
    queryFn: ({ signal }) => drugsRepo.page({ search, limit: 50 }, signal),
  });
  const selected = useQuery({
    queryKey: ["inventory", "drug", form.drugId],
    queryFn: ({ signal }) => drugsRepo.get(form.drugId, signal),
    enabled: !!form.drugId,
  });
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersRepo.list(),
  });
  const currency = selected.data?.currency || drugs.data?.currency || "GHS";
  const options = [...(drugs.data?.items || [])];
  if (selected.data && !options.some((drug) => drug.id === selected.data.id))
    options.unshift(selected.data);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    setValidation("");
    try {
      if (!Number.isInteger(Number(form.quantity)) || Number(form.quantity) < 1)
        throw new Error("Enter a positive whole number of stock units.");
      const body = {
        drug_id: form.drugId,
        supplier_id: form.supplier || null,
        batch_number: form.number.trim(),
        quantity_received: Number(form.quantity),
        unit_cost_cents: moneyToCents(form.cost),
        selling_price_cents: form.price ? moneyToCents(form.price) : null,
        received_at: form.received,
        expiry_date: form.expires,
      };
      void action.run((signal, key) => batchesRepo.create(body, key, signal));
    } catch (error) {
      setValidation(
        error instanceof Error ? error.message : "Check the receipt details.",
      );
    }
  }
  return (
    <form
      aria-label="Receive stock"
      className="space-y-5 rounded-xl border-2 border-teal-700 bg-white p-5"
      onSubmit={submit}
    >
      <h2 className="text-xl font-semibold">Receive stock</h2>
      <p className="text-sm text-slate-600">
        Record a physical delivery once. Keep the supplier batch number and
        expiry date from the packaging.
      </p>
      <fieldset disabled={action.locked} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Receipt details</legend>
        <label className="space-y-2 text-sm">
          <span>Search catalog</span>
          <Input
            className="min-h-11"
            value={search}
            maxLength={128}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span>Drug</span>
          <select
            required
            className="min-h-11 w-full rounded-md border px-3"
            value={form.drugId}
            onChange={(event) =>
              setForm({ ...form, drugId: event.target.value, price: "" })
            }
          >
            <option value="">Choose drug</option>
            {options.map((drug) => (
              <option key={drug.id} value={drug.id} disabled={!drug.is_active}>
                {drug.name} · {drug.strength}
              </option>
            ))}
          </select>
        </label>
        {drugs.isError && (
          <LoadError error={drugs.error} retry={() => void drugs.refetch()} />
        )}
        {!!drugs.data && drugs.data.total > drugs.data.items.length && (
          <p className="text-sm text-slate-600">
            Showing the first 50 matches. Refine your search to find another
            drug.
          </p>
        )}
        {selected.isError && (
          <LoadError
            error={selected.error}
            retry={() => void selected.refetch()}
          />
        )}
        <label className="space-y-2 text-sm">
          <span>Supplier (optional)</span>
          <select
            className="min-h-11 w-full rounded-md border px-3"
            value={form.supplier}
            onChange={(event) =>
              setForm({ ...form, supplier: event.target.value })
            }
          >
            <option value="">No supplier recorded</option>
            {suppliers.data?.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        {suppliers.isError && (
          <LoadError
            error={suppliers.error}
            retry={() => void suppliers.refetch()}
          />
        )}
        {[
          { key: "number", label: "Batch number", type: "text" },
          { key: "quantity", label: "Units received", type: "number" },
          { key: "cost", label: `Unit cost (${currency})`, type: "number" },
          {
            key: "price",
            label: `Selling price (${currency}, optional)`,
            type: "number",
          },
          { key: "received", label: "Received date", type: "date" },
          { key: "expires", label: "Expiry date", type: "date" },
        ].map((field) => (
          <label key={field.key} className="space-y-2 text-sm">
            <span>{field.label}</span>
            <Input
              className="min-h-11"
              required={field.key !== "price"}
              value={form[field.key as keyof typeof form]}
              type={field.type}
              maxLength={field.key === "number" ? 64 : undefined}
              min={
                field.type === "number"
                  ? field.key === "quantity"
                    ? 1
                    : 0
                  : undefined
              }
              step={field.key === "quantity" ? "1" : "0.01"}
              onChange={(event) =>
                setForm({ ...form, [field.key]: event.target.value })
              }
            />
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-slate-500">
        Leave selling price blank to use the catalog price. Enter 0.00 only for
        stock supplied free of charge.
      </p>
      {validation && <p role="alert">{validation}</p>}
      <WriteError {...action} />
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          className="min-h-11"
          disabled={
            action.busy ||
            !form.drugId ||
            selected.isPending ||
            selected.isError ||
            !selected.data?.is_active
          }
        >
          {action.busy
            ? "Recording…"
            : action.uncertain
              ? "Retry same request"
              : "Record receipt"}
        </Button>
        <Button
          className="min-h-11"
          variant="outline"
          type="button"
          disabled={action.busy || action.uncertain}
          onClick={close}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AdjustmentEditor({
  batch,
  saved,
  close,
}: {
  batch: Batch;
  saved: () => void;
  close: () => void;
}) {
  const [delta, setDelta] = useState(""),
    [reason, setReason] = useState<BatchAdjust["reason"]>("adjust"),
    [note, setNote] = useState("");
  const [validation, setValidation] = useState("");
  const action = useInventoryAction<Batch>(saved, true);
  const after = batch.quantity_on_hand + Number(delta);
  return (
    <form
      aria-label="Adjust stock"
      className="space-y-5 rounded-xl border-2 border-teal-700 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setValidation("");
        if (
          !Number.isInteger(Number(delta)) ||
          Number(delta) === 0 ||
          after < 0
        ) {
          setValidation(
            "Enter a nonzero whole-number change that leaves stock at zero or above.",
          );
          return;
        }
        void action.run((signal, key) =>
          batchesRepo.adjust(
            batch.id,
            {
              version: batch.version,
              delta: Number(delta),
              reason,
              note: note.trim(),
            },
            key,
            signal,
          ),
        );
      }}
    >
      <h2 className="text-xl font-semibold">
        Adjust {batch.drug_name} · {batch.batch_number}
      </h2>
      <p className="text-sm">
        Current balance: <strong>{batch.quantity_on_hand} units</strong>. Every
        adjustment records your account and reason.
      </p>
      <fieldset disabled={action.locked} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Stock adjustment details</legend>
        <label className="space-y-2 text-sm">
          <span>Change in units</span>
          <Input
            className="min-h-11"
            type="number"
            min={-1000000}
            max={1000000}
            step="1"
            required
            value={delta}
            onChange={(event) => setDelta(event.target.value)}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span>Reason</span>
          <select
            className="min-h-11 w-full rounded-md border px-3"
            value={reason}
            onChange={(event) =>
              setReason(event.target.value as BatchAdjust["reason"])
            }
          >
            <option value="adjust">Stock count correction</option>
            <option value="expire">Expired stock removed</option>
            <option value="return">Stock returned</option>
          </select>
        </label>
        <label className="space-y-2 text-sm sm:col-span-2">
          <span>Adjustment note</span>
          <textarea
            className="w-full rounded-md border p-3"
            required
            minLength={5}
            maxLength={255}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </fieldset>
      {delta && Number.isFinite(after) && (
        <p className="rounded-lg bg-slate-50 p-4">
          New balance after this adjustment: <strong>{after} units</strong>
        </p>
      )}
      {validation && <p role="alert">{validation}</p>}
      <WriteError {...action} />
      <div className="flex flex-wrap gap-3">
        <Button
          className="min-h-11"
          type="submit"
          disabled={action.busy || action.conflict}
        >
          {action.busy
            ? "Recording…"
            : action.uncertain
              ? "Retry same request"
              : "Record adjustment"}
        </Button>
        <Button
          className="min-h-11"
          type="button"
          variant="outline"
          disabled={action.busy || action.uncertain}
          onClick={close}
        >
          {action.conflict ? "Close and reload" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}

function MovementHistory({
  batch,
  close,
}: {
  batch: Batch;
  close: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const history = useQuery({
    queryKey: ["batches", "history", batch.id, offset],
    queryFn: ({ signal }) => batchesRepo.movements(batch.id, offset, signal),
  });
  return (
    <section
      aria-label="Stock history"
      className="space-y-4 rounded-xl border bg-white p-5"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          History · {batch.batch_number}
        </h2>
        <Button className="min-h-11" variant="outline" onClick={close}>
          Close history
        </Button>
      </header>
      {history.isPending ? (
        <p role="status">Loading stock history…</p>
      ) : history.isError ? (
        <LoadError error={history.error} retry={() => void history.refetch()} />
      ) : (
        <>
          <ol className="divide-y">
            {history.data.items.map((movement) => (
              <li key={movement.id} className="space-y-1 py-4">
                <p className="font-medium">
                  {movement.delta > 0 ? "+" : ""}
                  {movement.delta} units · {movement.reason}
                </p>
                <p className="text-sm">{movement.note}</p>
                <p className="text-xs text-slate-500">
                  {movement.actor_name || "Earlier system entry"} ·{" "}
                  {formatDateTime(movement.created_at)}
                </p>
              </li>
            ))}
          </ol>
          {!history.data.items.length && (
            <p>No stock movements were recorded for this batch.</p>
          )}
          <div className="flex gap-3">
            <Button
              className="min-h-11"
              variant="outline"
              disabled={!offset || history.isFetching}
              onClick={() => setOffset(offset - 50)}
            >
              Newer movements
            </Button>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={!history.data.has_more || history.isFetching}
              onClick={() => setOffset(offset + 50)}
            >
              Older movements
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
