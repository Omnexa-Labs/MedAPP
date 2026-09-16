"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LoadError, Pagination } from "@/components/inventory/operation-state";
import {
  correctionsRepo as repo,
  type Refund,
} from "@/lib/repositories/sale-corrections";
import type { Sale } from "@/lib/repositories/sales";
import {
  prescriptionsRepo,
  type Prescription,
} from "@/lib/repositories/prescriptions";
import { useAuthStore } from "@/lib/stores/auth.store";
import { formatCents, formatDateTime } from "@/lib/utils";
import { useCanDispense, useRefreshTransactions } from "./shared";
import {
  CorrectionEditor,
  ReconcileEditor,
  RefundEditor,
  RefundVoidEditor,
} from "./correction-editors";

type Mode =
  | { kind: "correct" | "refund" | "reconcile"; sale: Sale; rx?: Prescription }
  | { kind: "void-refund"; sale: Sale; refund: Refund };
export function SaleAdjustments({
  sale,
  refreshing = false,
}: {
  sale: Sale;
  refreshing?: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null),
    [notice, setNotice] = useState("");
  const [correctionOffset, setCorrectionOffset] = useState(0),
    [refundOffset, setRefundOffset] = useState(0);
  const canEdit = useCanDispense(),
    admin = useAuthStore((s) => s.user?.role === "pharmacy_admin");
  const refresh = useRefreshTransactions();
  const rxQuery = useQuery({
    queryKey: ["prescriptions", sale.prescription_id],
    queryFn: ({ signal }) =>
      prescriptionsRepo.get(sale.prescription_id!, signal),
    enabled: !!sale.prescription_id && canEdit,
  });
  const history = useQuery({
    queryKey: ["sales", "corrections", sale.id, correctionOffset],
    queryFn: ({ signal }) => repo.list(sale.id, correctionOffset, signal),
  });
  const refunds = useQuery({
    queryKey: ["sales", "refunds", sale.id, refundOffset],
    queryFn: ({ signal }) => repo.refunds(sale.id, refundOffset, signal),
  });
  const close = () => {
    setMode(null);
    refresh();
  };
  const done = (result: { number?: string; sale_number?: string }) => {
    setNotice(`${result.number || result.sale_number} saved.`);
    setCorrectionOffset(0);
    setRefundOffset(0);
    close();
  };
  const legacy =
    sale.prescription_id &&
    sale.items.some((item) => !item.prescription_item_id);
  return (
    <section aria-label="Corrections and refunds" className="space-y-5">
      <h2 className="text-xl font-semibold">Corrections and refunds</h2>
      <div className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-3">
        <p>
          Credited:{" "}
          <strong>
            {formatCents(sale.credited_cents || 0, sale.currency)}
          </strong>
        </p>
        <p>
          Refunds recorded:{" "}
          <strong>
            {formatCents(sale.refunded_cents || 0, sale.currency)}
          </strong>
        </p>
        <p>
          Credit awaiting refund:{" "}
          <strong>
            {formatCents(sale.refundable_cents || 0, sale.currency)}
          </strong>
        </p>
      </div>
      {notice && <p role="status">{notice}</p>}
      {canEdit && sale.prescription_id && rxQuery.isError && (
        <LoadError error={rxQuery.error} retry={() => void rxQuery.refetch()} />
      )}
      {canEdit &&
        (mode ? (
          <div className="rounded-xl border bg-white p-5">
            {mode.kind === "correct" && (
              <CorrectionEditor
                sale={mode.sale}
                rx={mode.rx}
                done={done}
                close={close}
              />
            )}
            {mode.kind === "refund" && (
              <RefundEditor sale={mode.sale} done={done} close={close} />
            )}
            {mode.kind === "reconcile" && mode.rx && (
              <ReconcileEditor
                sale={mode.sale}
                rx={mode.rx}
                done={done}
                close={close}
              />
            )}
            {mode.kind === "void-refund" && (
              <RefundVoidEditor
                sale={mode.sale}
                refund={mode.refund}
                done={done}
                close={close}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {sale.status === "completed" &&
              sale.items.some(
                (item) => item.quantity > (item.corrected_quantity || 0),
              ) && (
                <Button
                  variant="outline"
                  disabled={
                    refreshing ||
                    (!!sale.prescription_id &&
                      (!rxQuery.data || rxQuery.isFetching || rxQuery.isError))
                  }
                  onClick={() =>
                    setMode({ kind: "correct", sale, rx: rxQuery.data })
                  }
                >
                  Correct receipt quantities
                </Button>
              )}
            {(sale.refundable_cents || 0) > 0 && (
              <Button
                disabled={refreshing}
                onClick={() => setMode({ kind: "refund", sale })}
              >
                Record completed refund
              </Button>
            )}
            {admin && legacy && sale.status === "completed" && (
              <Button
                variant="outline"
                disabled={
                  refreshing ||
                  !rxQuery.data ||
                  rxQuery.isFetching ||
                  rxQuery.isError
                }
                onClick={() =>
                  setMode({ kind: "reconcile", sale, rx: rxQuery.data })
                }
              >
                Verify older prescription links
              </Button>
            )}
          </div>
        ))}
      <section aria-label="Correction history" className="space-y-3">
        <h3 className="text-lg font-semibold">Correction history</h3>
        {history.isPending ? (
          <p role="status">Loading corrections…</p>
        ) : history.isError ? (
          <LoadError
            error={history.error}
            retry={() => void history.refetch()}
          />
        ) : (
          <>
            <ul className="divide-y rounded-xl border bg-white">
              {history.data.items.map((entry) => (
                <li key={entry.id} className="space-y-2 p-4">
                  <p className="font-semibold">
                    {entry.number} ·{" "}
                    {formatCents(entry.credit_cents, sale.currency)}
                  </p>
                  <p>
                    {entry.kind === "not_collected"
                      ? "Never collected — restored to original batches"
                      : "Customer return — kept outside usable stock"}
                  </p>
                  <p>{entry.reason}</p>
                  <ul>
                    {entry.items.map((item) => (
                      <li key={item.sale_item_id}>
                        {sale.items.find(
                          (line) => line.id === item.sale_item_id,
                        )?.drug_name_snapshot || "Recorded medicine"}
                        : {item.quantity} units ·{" "}
                        {formatCents(item.credit_cents, sale.currency)}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-slate-600">
                    {formatDateTime(entry.created_at)} ·{" "}
                    {entry.actor_name || "Staff record unavailable"}
                  </p>
                </li>
              ))}
            </ul>
            {!history.data.items.length && <p>No corrections recorded.</p>}
            <Pagination
              offset={correctionOffset}
              count={history.data.items.length}
              total={history.data.total}
              busy={history.isFetching}
              onPage={setCorrectionOffset}
            />
          </>
        )}
      </section>
      <section aria-label="Refund history" className="space-y-3">
        <h3 className="text-lg font-semibold">Refund history</h3>
        {refunds.isPending ? (
          <p role="status">Loading refunds…</p>
        ) : refunds.isError ? (
          <LoadError
            error={refunds.error}
            retry={() => void refunds.refetch()}
          />
        ) : (
          <>
            <ul className="divide-y rounded-xl border bg-white">
              {refunds.data.items.map((entry) => (
                <li className="space-y-2 p-4" key={entry.id}>
                  <p className="font-semibold">
                    {entry.number} ·{" "}
                    {formatCents(entry.amount_cents, sale.currency)} ·{" "}
                    {entry.status === "voided"
                      ? "Marked incorrect"
                      : "Recorded"}
                  </p>
                  <p>
                    {entry.payment_method.replaceAll("_", " ")} ·{" "}
                    {entry.payment_ref}
                  </p>
                  <p>{entry.reason}</p>
                  {entry.void_reason && (
                    <p>
                      Entry correction: {entry.void_reason} ·{" "}
                      {entry.voided_at && formatDateTime(entry.voided_at)}
                    </p>
                  )}
                  <p className="text-sm text-slate-600">
                    {formatDateTime(entry.created_at)} ·{" "}
                    {entry.actor_name || "Staff record unavailable"}
                  </p>
                  {admin && entry.status === "recorded" && !mode && (
                    <Button
                      variant="outline"
                      disabled={refreshing}
                      onClick={() =>
                        setMode({ kind: "void-refund", sale, refund: entry })
                      }
                    >
                      Correct refund entry {entry.number}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {!refunds.data.items.length && <p>No refunds recorded.</p>}
            <Pagination
              offset={refundOffset}
              count={refunds.data.items.length}
              total={refunds.data.total}
              busy={refunds.isFetching}
              onPage={setRefundOffset}
            />
          </>
        )}
      </section>
    </section>
  );
}
