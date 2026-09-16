"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadError, Pagination } from "@/components/inventory/operation-state";
import { useAuthStore } from "@/lib/stores/auth.store";
import {
  purchaseOrdersRepo,
  orderStatusLabel,
} from "@/lib/repositories/purchaseOrders";
import { formatCents } from "@/lib/utils";
import { OrderEditor } from "./order-editor";

export function OrderList() {
  const scope = useAuthStore((s) => s.scope),
    role = useAuthStore((s) => s.user?.role);
  const canEdit = role === "pharmacy_admin" || role === "pharmacist";
  const [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [term, setTerm] = useState("");
  const [offset, setOffset] = useState(0),
    [editing, setEditing] = useState(false),
    [notice, setNotice] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["purchase-orders", "list", scope, status, term, offset],
    queryFn: ({ signal }) =>
      purchaseOrdersRepo.page(
        { status: status || undefined, search: term, limit: 25, offset },
        signal,
      ),
    enabled: !!scope,
  });
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Purchase orders</h1>
          <p className="mt-2 text-sm text-slate-600">
            Plan supplier orders and track each delivery and outstanding
            quantity.
          </p>
        </div>
        {canEdit && (
          <Button
            className="min-h-11"
            disabled={editing || !query.data?.currency}
            onClick={() => setEditing(true)}
          >
            New purchase order
          </Button>
        )}
      </header>
      {notice && (
        <p role="status" className="rounded-lg bg-teal-50 p-4 text-teal-900">
          {notice}
        </p>
      )}
      {editing && canEdit && (
        <OrderEditor
          currency={query.data?.currency || "GHS"}
          close={() => setEditing(false)}
          saved={(po) => {
            setEditing(false);
            setNotice(`${po.po_number} saved as a draft.`);
            void client.invalidateQueries({ queryKey: ["purchase-orders"] });
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
          Search order or supplier
          <Input
            className="min-h-11"
            maxLength={128}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Button type="submit" className="min-h-11">
          Search
        </Button>
        <label className="flex flex-col gap-2 text-sm">
          Order status
          <select
            className="min-h-11 rounded-md border bg-white px-3"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">All orders</option>
            {Object.entries(orderStatusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button
          className="min-h-11"
          variant="outline"
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh orders
        </Button>
      </form>
      {query.isPending ? (
        <p role="status">Loading purchase orders…</p>
      ) : query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Supplier purchase orders</caption>
              <thead className="border-b bg-slate-50">
                <tr>
                  {[
                    "Order / supplier",
                    "Status",
                    "Ordered total",
                    "Expected",
                    "Outstanding units",
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
                {query.data.items.map((po) => (
                  <tr key={po.id} className="border-b last:border-0">
                    <td className="p-4">
                      <Link
                        href={`/purchase-orders/${po.id}`}
                        className="inline-flex min-h-11 items-center font-semibold text-teal-800 underline"
                      >
                        {po.po_number}
                      </Link>
                      <p>{po.supplier_name}</p>
                    </td>
                    <td className="p-4">
                      {orderStatusLabel[po.status]}
                      {!po.receiving_reconciled && (
                        <p className="text-amber-800">Receipt review needed</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-4">
                      {formatCents(po.total_cents, po.currency)}
                    </td>
                    <td className="whitespace-nowrap p-4">
                      {po.expected_at || "Not set"}
                    </td>
                    <td className="p-4">
                      {po.receiving_reconciled
                        ? po.items.reduce(
                            (sum, item) =>
                              sum + (item.quantity_outstanding || 0),
                            0,
                          )
                        : "Not reconciled"}
                    </td>
                  </tr>
                ))}
                {!query.data.items.length && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-600">
                      No purchase orders match this view.
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
    </div>
  );
}
