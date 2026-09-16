"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/inventory/operation-state";
import { reportsRepo } from "@/lib/repositories/reports";
import { formatCents } from "@/lib/utils";

export function ReportsScreen() {
  const [start, setStart] = useState(() =>
    new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
  );
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const valid = !!start && !!end && start <= end;
  const query = useQuery({
    queryKey: ["reports", "financial", start, end],
    enabled: valid,
    queryFn: async ({ signal }) => {
      const [summary, daily, top] = await Promise.all([
        reportsRepo.salesSummary(start, end, signal),
        reportsRepo.salesDaily(start, end, signal),
        reportsRepo.topDrugs(start, end, 10, signal),
      ]);
      return { summary, daily, top };
    },
  });
  const data = query.data;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Sales and refund reports</h1>
      <div className="flex flex-wrap gap-3">
        <label>
          Start date
          <Input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          End date
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <p className="text-sm text-slate-600">
        UTC dates. Sales exclude voided receipts. Credits and completed refund
        entries appear on the date recorded. Refunds settle credits and are not
        subtracted from sales a second time.
      </p>
      {!valid ? (
        <p role="alert">Choose an end date on or after the start date.</p>
      ) : query.isError ? (
        <LoadError error={query.error} retry={() => void query.refetch()} />
      ) : !data ? (
        <p role="status">Loading financial activity…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Recorded sales", data.summary.gross_total_cents],
              ["Credits recorded", data.summary.credit_total_cents],
              ["Sales after credits", data.summary.net_sales_cents],
              ["Refunds recorded", data.summary.refund_total_cents],
            ].map(([label, cents]) => (
              <section
                className="space-y-2 rounded-xl border bg-white p-5"
                key={label}
              >
                <h2 className="text-sm text-slate-600">{label}</h2>
                <p className="text-2xl font-semibold">
                  {formatCents(Number(cents), data.summary.currency)}
                </p>
              </section>
            ))}
          </div>
          <p>
            {data.summary.sale_count} completed receipts · Discounts:{" "}
            {formatCents(data.summary.discount_cents, data.summary.currency)}
          </p>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Daily activity</h2>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Sales, credits and recorded refunds by day
                </caption>
                <thead>
                  <tr>
                    {[
                      "Date",
                      "Receipts",
                      "Sales",
                      "Credits",
                      "Sales after credits",
                      "Refunds",
                    ].map((h) => (
                      <th className="p-3" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((day) => (
                    <tr key={day.day} className="border-t">
                      <td className="p-3">{day.day}</td>
                      <td className="p-3">{day.sale_count}</td>
                      {[
                        day.total_cents,
                        day.credit_cents,
                        day.net_sales_cents,
                        day.refund_cents,
                      ].map((value, i) => (
                        <td className="p-3" key={i}>
                          {formatCents(value, data.summary.currency)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.daily.length && <p>No recorded activity in this period.</p>}
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">
              Medicines on receipts in this period
            </h2>
            <p className="text-sm text-slate-600">
              Quantities exclude all corrections recorded against these
              receipts. Item value is before tax and receipt discounts.
            </p>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Medicines after quantity corrections
                </caption>
                <thead>
                  <tr>
                    <th className="p-3">Medicine</th>
                    <th className="p-3">Units after corrections</th>
                    <th className="p-3">Item value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top.map((drug, i) => (
                    <tr className="border-t" key={`${drug.drug_id}-${i}`}>
                      <td className="p-3">{drug.drug_name}</td>
                      <td className="p-3">{drug.units_sold}</td>
                      <td className="p-3">
                        {formatCents(drug.revenue_cents, data.summary.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.top.length && (
              <p>No remaining units on completed receipts in this period.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
