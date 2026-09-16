"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LoadError } from "@/components/inventory/operation-state";
import { salesRepo } from "@/lib/repositories/sales";
import { formatCents, formatDateTime } from "@/lib/utils";
import { CustomerName } from "./shared";
import { SaleAdjustments } from "./sale-adjustments";

export function SaleDetail({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["sales", id],
    queryFn: ({ signal }) => salesRepo.get(id, signal),
  });
  if (!query.data)
    return query.isError ? (
      <LoadError error={query.error} retry={() => void query.refetch()} />
    ) : (
      <p role="status">Loading receipt…</p>
    );
  const sale = query.data;
  return (
    <article className="space-y-5">
      <Link className="underline" href="/sales">
        Sales ledger
      </Link>
      <h1 className="text-2xl font-bold">Receipt {sale.sale_number}</h1>
      {query.isError && (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      )}
      <section className="space-y-2 rounded-xl border bg-white p-5">
        <p>
          Status: {sale.status} ·{" "}
          {formatDateTime(sale.completed_at || sale.created_at)}
        </p>
        <p>
          Customer: <CustomerName id={sale.customer_id} />
        </p>
        <p>
          Payment method: {sale.payment_method.replaceAll("_", " ")} ·
          Reference: {sale.payment_ref || "None recorded"}
        </p>
        {sale.notes && <p>Notes: {sale.notes}</p>}
        {sale.void_reason && <p>Void reason: {sale.void_reason}</p>}
        {sale.prescription_id && (
          <Link
            href={`/prescriptions/${sale.prescription_id}`}
            className="block underline"
          >
            View prescription
          </Link>
        )}
      </section>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Receipt items</caption>
          <thead>
            <tr>
              {[
                "Medicine / stock",
                "Original quantity",
                "Corrected quantity",
                "Unit price",
                "Original amount",
              ].map((h) => (
                <th className="p-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="p-3">
                  {item.drug_name_snapshot}
                  <Link
                    className="block underline"
                    href={`/batches?drug_id=${item.drug_id}`}
                  >
                    View stock history
                  </Link>
                  <span className="block break-all text-xs">
                    Batch record: {item.drug_batch_id}
                  </span>
                </td>
                <td className="p-3">{item.quantity}</td>
                <td className="p-3">{item.corrected_quantity || 0}</td>
                <td className="p-3">
                  {formatCents(item.unit_price_cents, sale.currency)}
                </td>
                <td className="p-3">
                  {formatCents(item.line_total_cents, sale.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Subtotal: {formatCents(sale.subtotal_cents, sale.currency)} · Discount:{" "}
        {formatCents(sale.discount_cents, sale.currency)} · Tax:{" "}
        {formatCents(sale.tax_cents, sale.currency)}
      </p>
      <p className="text-xl font-semibold">
        Total: {formatCents(sale.total_cents, sale.currency)}
      </p>
      <p className="text-sm">
        Payment details are recorded by pharmacy staff. This portal does not
        charge or refund payment instruments.
      </p>
      <SaleAdjustments
        sale={sale}
        refreshing={query.isFetching || query.isError}
      />
    </article>
  );
}
