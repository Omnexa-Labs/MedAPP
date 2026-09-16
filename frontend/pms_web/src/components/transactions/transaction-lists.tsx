"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadError, Pagination } from "@/components/inventory/operation-state";
import { salesRepo } from "@/lib/repositories/sales";
import { prescriptionsRepo } from "@/lib/repositories/prescriptions";
import { formatCents, formatDateTime } from "@/lib/utils";
import { PrescriptionEditor } from "./prescription-editor";
import { useCanDispense, useRefreshTransactions } from "./shared";

export function SalesList({ prescriptionId }: { prescriptionId?: string }) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [payment, setPayment] = useState(""),
    [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: [
      "sales",
      "list",
      prescriptionId,
      search,
      status,
      payment,
      offset,
    ],
    queryFn: ({ signal }) =>
      salesRepo.page(
        {
          prescription_id: prescriptionId,
          search: search || undefined,
          status: status || undefined,
          payment_method: payment || undefined,
          offset,
          limit: 25,
        },
        signal,
      ),
  });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          Sale number
          <Input
            value={search}
            maxLength={128}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Sale status
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="voided">Voided</option>
          </Select>
        </label>
        <label>
          Payment filter
          <Select
            value={payment}
            onChange={(e) => {
              setPayment(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All payments</option>
            {["cash", "card", "mobile_money", "insurance"].map((p) => (
              <option value={p} key={p}>
                {p.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {query.isPending ? (
        <p role="status">Loading sales…</p>
      ) : query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <ul className="divide-y rounded-xl border bg-white">
            {query.data.items.map((sale) => (
              <li className="p-4" key={sale.id}>
                <Link
                  className="font-semibold underline"
                  href={`/sales/${sale.id}`}
                >
                  {sale.sale_number}
                </Link>
                <p>
                  {sale.status} · {formatCents(sale.total_cents, sale.currency)}{" "}
                  · {sale.payment_method.replaceAll("_", " ")} ·{" "}
                  {formatDateTime(sale.created_at)}
                </p>
                {!!sale.credited_cents && (
                  <p className="text-sm">
                    Credited: {formatCents(sale.credited_cents, sale.currency)}{" "}
                    · Refunds recorded:{" "}
                    {formatCents(sale.refunded_cents || 0, sale.currency)}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {!query.data.items.length && <p>No sales found.</p>}
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
export function PrescriptionList() {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [source, setSource] = useState(""),
    [offset, setOffset] = useState(0),
    [creating, setCreating] = useState(false),
    [created, setCreated] = useState<{ id: string; rx_number: string } | null>(
      null,
    );
  const canEdit = useCanDispense(),
    refresh = useRefreshTransactions();
  const query = useQuery({
    queryKey: ["prescriptions", "list", search, status, source, offset],
    queryFn: ({ signal }) =>
      prescriptionsRepo.page(
        {
          search: search || undefined,
          status: status || undefined,
          source: source || undefined,
          offset,
          limit: 25,
        },
        signal,
      ),
  });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Prescriptions</h1>
      <p>
        Record prescriptions, dispense available quantities and retain each sale
        receipt.
      </p>
      {canEdit &&
        (creating ? (
          <PrescriptionEditor
            close={() => setCreating(false)}
            done={(rx) => {
              setCreating(false);
              setCreated(rx);
              refresh();
            }}
          />
        ) : (
          <Button onClick={() => setCreating(true)}>New prescription</Button>
        ))}
      {created && (
        <p role="status">
          Prescription saved.{" "}
          <Link className="underline" href={`/prescriptions/${created.id}`}>
            Open {created.rx_number}
          </Link>
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          Prescription number
          <Input
            value={search}
            maxLength={128}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Prescription status
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All statuses</option>
            {["pending", "partially_dispensed", "dispensed", "cancelled"].map(
              (s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ),
            )}
          </Select>
        </label>
        <label>
          Prescription source
          <Select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All sources</option>
            <option value="walk_in">Walk-in</option>
            <option value="internal">Internal</option>
            <option value="medapp">MedApp</option>
          </Select>
        </label>
      </div>
      {query.isPending ? (
        <p role="status">Loading prescriptions…</p>
      ) : query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <ul className="divide-y rounded-xl border bg-white">
            {query.data.items.map((rx) => (
              <li key={rx.id} className="p-4">
                <Link
                  className="font-semibold underline"
                  href={`/prescriptions/${rx.id}`}
                >
                  {rx.rx_number}
                </Link>
                <p>
                  {rx.status.replaceAll("_", " ")} ·{" "}
                  {rx.source.replaceAll("_", " ")} · Prescriber:{" "}
                  {rx.prescriber_name || "Not recorded"} ·{" "}
                  {formatDateTime(rx.created_at)}
                </p>
              </li>
            ))}
          </ul>
          {!query.data.items.length && <p>No prescriptions found.</p>}
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
