"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadError } from "@/components/inventory/operation-state";
import { useInventoryAction } from "@/components/inventory/use-inventory-action";
import { ActionButtons } from "@/components/purchasing/action-buttons";
import { drugsRepo, type DrugWithStock } from "@/lib/repositories/drugs";
import { customersRepo, type Customer } from "@/lib/repositories/customers";
import type {
  CancelTransaction,
  PaymentDetails,
  PaymentMethod,
  TransactionQuote,
} from "@/lib/repositories/transactions";
import { useAuthStore } from "@/lib/stores/auth.store";
import { formatCents } from "@/lib/utils";

export function useCanDispense() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "pharmacy_admin" || role === "pharmacist";
}
export function useRefreshTransactions() {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      "sales",
      "prescriptions",
      "drugs",
      "batches",
      "dashboard",
      "reports",
    ])
      void qc.invalidateQueries({ queryKey: [key] });
  };
}
export function DrugPicker({
  add,
  walkIn = false,
}: {
  add: (drug: DrugWithStock) => void;
  walkIn?: boolean;
}) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["drugs", "transaction-search", search],
    queryFn: ({ signal }) =>
      drugsRepo.page({ search, active: true, limit: 25 }, signal),
    enabled: search.trim().length > 0,
  });
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Find medicine
        <Input
          value={search}
          maxLength={128}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, strength or SKU"
        />
      </label>
      {query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : query.isFetching ? (
        <p role="status">Searching medicines…</p>
      ) : (
        search &&
        query.data && (
          <>
            <ul className="space-y-2">
              {query.data.items.map((d) => (
                <li key={d.id}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-11 w-full justify-start whitespace-normal text-left"
                    disabled={walkIn && d.requires_prescription}
                    onClick={() => {
                      add(d);
                      setSearch("");
                    }}
                  >
                    {d.name} · {d.strength} · {d.quantity_on_hand} usable units
                    {d.requires_prescription && " · Prescription required"}
                  </Button>
                </li>
              ))}
            </ul>
            {!query.data.items.length && <p>No medicines found.</p>}
            {query.data.total > query.data.items.length && (
              <p className="text-sm">
                Refine your search to find more medicines.
              </p>
            )}
          </>
        )
      )}
    </div>
  );
}
export function CustomerPicker({
  value,
  onChange,
}: {
  value: Customer | null;
  onChange: (value: Customer | null) => void;
}) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["customers", "transaction-search", search],
    queryFn: ({ signal }) => customersRepo.list(search, signal),
    enabled: search.trim().length >= 2,
  });
  return (
    <div className="space-y-2">
      {value ? (
        <p>
          Customer: {value.full_name}{" "}
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(null)}
          >
            Clear customer
          </Button>
        </p>
      ) : (
        <p className="text-sm">Customer is optional. No customer selected.</p>
      )}
      <label className="block text-sm">
        Find customer
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={128}
          placeholder="Enter at least two characters"
        />
      </label>
      {query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : query.isFetching ? (
        <p role="status">Searching customers…</p>
      ) : (
        search.length >= 2 &&
        query.data && (
          <>
            <ul>
              {query.data.slice(0, 25).map((c) => (
                <li key={c.id}>
                  <Button
                    type="button"
                    variant="outline"
                    className="my-1 min-h-11"
                    onClick={() => {
                      onChange(c);
                      setSearch("");
                    }}
                  >
                    {c.full_name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </Button>
                </li>
              ))}
            </ul>
            {!query.data.length && (
              <p>
                No customer found.{" "}
                <Link href="/customers" className="underline">
                  Open customers
                </Link>
              </p>
            )}
            {query.data.length > 25 && (
              <p>Refine your search to find more customers.</p>
            )}
          </>
        )
      )}
    </div>
  );
}
export function CustomerName({ id }: { id?: string | null }) {
  const query = useQuery({
    queryKey: ["customers", id],
    queryFn: ({ signal }) => customersRepo.get(id!, signal),
    enabled: !!id,
  });
  if (!id) return <span>No customer recorded</span>;
  if (query.isError)
    return <LoadError error={query.error} retry={() => void query.refetch()} />;
  return <span>{query.data?.full_name || "Loading customer…"}</span>;
}
export function PaymentFields({
  value,
  change,
}: {
  value: PaymentDetails;
  change: (value: PaymentDetails) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        Payment method
        <Select
          value={value.payment_method || "cash"}
          onChange={(e) =>
            change({
              ...value,
              payment_method: e.target.value as PaymentMethod,
            })
          }
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="mobile_money">Mobile money</option>
          <option value="insurance">Insurance</option>
        </Select>
      </label>
      <label className="text-sm">
        Payment reference
        <Input
          value={value.payment_ref || ""}
          maxLength={128}
          onChange={(e) => change({ ...value, payment_ref: e.target.value })}
        />
      </label>
      <label className="text-sm sm:col-span-2">
        Transaction notes
        <Input
          value={value.notes || ""}
          maxLength={2000}
          onChange={(e) => change({ ...value, notes: e.target.value })}
        />
      </label>
    </div>
  );
}
export function QuoteReview<T>({
  title,
  details,
  quote,
  send,
  done,
  close,
}: {
  title: string;
  details: PaymentDetails;
  quote: (signal: AbortSignal) => Promise<TransactionQuote>;
  send: (total: number, key: string, signal: AbortSignal) => Promise<T>;
  done: (result: T) => void;
  close: () => void;
}) {
  const [reference] = useState(() => crypto.randomUUID());
  const query = useQuery({
    queryKey: ["transaction-quote", reference],
    queryFn: ({ signal }) => quote(signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const action = useInventoryAction(done, true);
  const q = query.data;
  return (
    <section
      className="space-y-4 rounded-xl border bg-white p-5"
      aria-label="Review transaction"
    >
      <h2 className="text-xl font-semibold">Review transaction</h2>
      <p>
        Payment method: {details.payment_method?.replaceAll("_", " ") || "cash"}
        . Reference: {details.payment_ref || "None recorded"}.
      </p>
      {details.notes && <p>Notes: {details.notes}</p>}
      {query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : !q ? (
        <p role="status">Checking current stock and batch prices…</p>
      ) : (
        <>
          <ul className="divide-y">
            {q.items.map((line, i) => (
              <li key={`${line.batch_id}-${i}`} className="py-3">
                {line.drug_name} · Batch {line.batch_number}
                <br />
                {line.quantity} ×{" "}
                {formatCents(line.unit_price_cents, q.currency)} ={" "}
                {formatCents(line.line_total_cents, q.currency)}
              </li>
            ))}
          </ul>
          <p>
            Subtotal: {formatCents(q.subtotal_cents, q.currency)} · Discount:{" "}
            {formatCents(q.discount_cents, q.currency)} · Tax:{" "}
            {formatCents(q.tax_cents, q.currency)}
          </p>
          <p className="text-lg font-semibold">
            Total: {formatCents(q.total_cents, q.currency)}
          </p>
        </>
      )}
      <p className="text-sm text-slate-600">
        This records payment details and deducts stock. Collect or arrange
        payment through your pharmacy’s payment process. Prices and stock are
        checked again when you save.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q)
            void action.run((signal, key) => send(q.total_cents, key, signal));
        }}
      >
        <ActionButtons
          action={action}
          label={title}
          close={close}
          disabled={!q || query.isFetching || query.isError}
        />
      </form>
    </section>
  );
}
export function CancelForm<T>({
  version,
  title,
  description,
  send,
  done,
  close,
}: {
  version: number;
  title: string;
  description: string;
  send: (
    body: CancelTransaction,
    key: string,
    signal: AbortSignal,
  ) => Promise<T>;
  done: (result: T) => void;
  close: () => void;
}) {
  const [reason, setReason] = useState("");
  const action = useInventoryAction(done, true);
  return (
    <form
      className="space-y-4 rounded-xl border bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim().length >= 3)
          void action.run((signal, key) =>
            send({ version, reason: reason.trim() }, key, signal),
          );
      }}
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      <p>{description}</p>
      <label className="block text-sm">
        Reason
        <Input
          required
          minLength={3}
          maxLength={255}
          value={reason}
          disabled={action.locked}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <ActionButtons
        action={action}
        label={title}
        close={close}
        disabled={reason.trim().length < 3}
      />
    </form>
  );
}
