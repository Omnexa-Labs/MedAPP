"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/stores/auth.store";
import { dashboardRepo } from "@/lib/repositories/dashboard";
import { formatCents, formatDateTime } from "@/lib/utils";
import { LoadError } from "./operation-state";

const actionLink =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50";

export function DashboardScreen() {
  const [period, setPeriod] = useState<"today" | "week">("today");
  const scope = useAuthStore((s) => s.scope),
    user = useAuthStore((s) => s.user);
  const dashboard = useQuery({
    queryKey: ["reports", "dashboard", scope, period],
    queryFn: ({ signal }) => dashboardRepo.get(period, signal),
    enabled: !!scope,
    refetchInterval: 30000,
  });
  const data = dashboard.data;
  const volume =
    data?.period === "today"
      ? Array.from({ length: 6 }, (_, index) => ({
          label: `${String(index * 4).padStart(2, "0")}:00–${String((index + 1) * 4).padStart(2, "0")}:00`,
          count: data.volume
            .slice(index * 4, (index + 1) * 4)
            .reduce((sum, row) => sum + row.count, 0),
        }))
      : data?.volume || [];
  const max = Math.max(1, ...volume.map((point) => point.count));
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-teal-800">
            Pharmacy workspace
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Hello{user?.fullName ? `, ${user.fullName}` : ""}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Your pharmacy overview and stock tasks.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/prescriptions" className={actionLink}>
            Review prescriptions
          </Link>
          <Link href="/inventory" className={actionLink}>
            Manage inventory
          </Link>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div aria-label="Activity period" className="flex gap-2">
          {(["today", "week"] as const).map((value) => (
            <Button
              key={value}
              className="min-h-11"
              variant={period === value ? "default" : "outline"}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {value === "today" ? "Today" : "Last 7 days"}
            </Button>
          ))}
        </div>
        <Button
          className="min-h-11"
          variant="outline"
          disabled={dashboard.isFetching}
          onClick={() => void dashboard.refetch()}
        >
          Refresh overview
        </Button>
      </div>
      {dashboard.isPending ? (
        <p role="status">Loading pharmacy overview…</p>
      ) : dashboard.isError ? (
        <LoadError
          error={dashboard.error}
          retry={() => void dashboard.refetch()}
        />
      ) : (
        data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  title: "Pending prescriptions",
                  value: data.pending_prescriptions,
                  detail: "Pending or partly dispensed",
                  href: "/prescriptions",
                },
                {
                  title: "Low-stock drugs",
                  value: data.low_stock_count,
                  detail: "At or below the reorder level",
                  href: "/inventory?filter=low",
                },
                {
                  title: "Expiring batches",
                  value: data.expiring_batch_count,
                  detail: "Non-empty stock expiring within 90 days",
                  href: "/batches?state=expiring",
                },
                {
                  title: "Active catalog",
                  value: data.active_drugs,
                  detail: "Drugs available for new receipts",
                  href: "/inventory",
                },
              ].map((card) => (
                <Link
                  key={card.title}
                  href={card.href}
                  className="space-y-3 rounded-xl border bg-white p-5 shadow-sm hover:border-teal-600"
                >
                  <h2 className="text-sm text-slate-600">{card.title}</h2>
                  <p className="text-4xl font-semibold">{card.value}</p>
                  <p className="text-xs text-slate-500">{card.detail}</p>
                </Link>
              ))}
            </div>
            <div className="grid items-start gap-6 xl:grid-cols-2">
              <section
                aria-label="Stock tasks"
                className="space-y-4 rounded-xl border bg-white p-5"
              >
                <h2 className="text-xl font-semibold">Stock tasks</h2>
                {data.expired_batch_count > 0 && (
                  <Link
                    href="/batches?state=expired"
                    className="block rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"
                  >
                    <strong>
                      {data.expired_batch_count} expired batches still hold
                      stock
                    </strong>
                    <p className="mt-1 text-sm underline">
                      Review and record removal
                    </p>
                  </Link>
                )}
                {data.low_stock.map((item) => (
                  <div
                    key={item.drug_id}
                    className="rounded-lg border bg-amber-50 p-4"
                  >
                    <p className="font-medium">Low stock: {item.drug_name}</p>
                    <p className="text-sm">
                      {item.quantity_on_hand} units available · reorder at{" "}
                      {item.reorder_level}
                    </p>
                    <Link
                      className="mt-2 inline-flex min-h-11 items-center text-sm text-teal-800 underline"
                      href={`/batches?drug_id=${item.drug_id}`}
                    >
                      Review stock and receipts
                    </Link>
                  </div>
                ))}
                {data.expiring_batches.map((item) => (
                  <div key={item.batch_id} className="rounded-lg border p-4">
                    <p className="font-medium">
                      {item.drug_name} · {item.batch_number}
                    </p>
                    <p className="text-sm">
                      {item.quantity_on_hand} units expire on {item.expiry_date}
                    </p>
                    <Link
                      className="mt-2 inline-flex min-h-11 items-center text-sm text-teal-800 underline"
                      href={`/batches?drug_id=${item.drug_id}&state=expiring`}
                    >
                      Review expiring stock
                    </Link>
                  </div>
                ))}
                {!data.low_stock_count &&
                  !data.expiring_batch_count &&
                  !data.expired_batch_count && (
                    <p className="text-sm text-slate-600">
                      No stock tasks need attention in the current inventory.
                    </p>
                  )}
                {(data.low_stock_count > 5 ||
                  data.expiring_batch_count > 5) && (
                  <p className="text-xs text-slate-500">
                    Showing the first five of each task type. Open the inventory
                    cards above for the full list.
                  </p>
                )}
              </section>
              <div className="space-y-6">
                <section
                  aria-label="Prescription queue"
                  className="space-y-4 rounded-xl border bg-white p-5"
                >
                  <h2 className="text-xl font-semibold">
                    Prescriptions to review
                  </h2>
                  {data.pending_queue.length ? (
                    <ul className="divide-y">
                      {data.pending_queue.map((rx) => (
                        <li key={rx.id}>
                          <Link
                            href={`/prescriptions/${rx.id}`}
                            className="flex min-h-16 flex-wrap items-center justify-between gap-2 py-3 text-sm text-teal-800"
                          >
                            <span className="break-all font-medium">
                              {rx.number}
                            </span>
                            <span className="capitalize">
                              {rx.status.replaceAll("_", " ")}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-600">
                      No prescriptions are waiting to be dispensed.
                    </p>
                  )}
                  <Link href="/prescriptions" className={actionLink}>
                    Open prescription queue
                  </Link>
                </section>
                <section
                  aria-label="Sales activity"
                  className="space-y-4 rounded-xl border bg-white p-5"
                >
                  <div>
                    <h2 className="text-xl font-semibold">Sales activity</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {data.start_date}–{data.end_date} · {data.timezone}.
                      Completed sales; voided sales excluded.
                    </p>
                  </div>
                  <p className="text-lg font-semibold">
                    {formatCents(
                      data.sales.gross_total_cents,
                      data.sales.currency,
                    )}{" "}
                    recorded · {data.sales.sale_count} sales
                  </p>
                  <p className="text-sm text-slate-600">
                    Credits recorded:{" "}
                    {formatCents(
                      data.sales.credit_total_cents || 0,
                      data.sales.currency,
                    )}{" "}
                    · Sales after credits:{" "}
                    {formatCents(
                      data.sales.net_sales_cents ??
                        data.sales.gross_total_cents,
                      data.sales.currency,
                    )}{" "}
                    · Refunds recorded:{" "}
                    {formatCents(
                      data.sales.refund_total_cents || 0,
                      data.sales.currency,
                    )}
                  </p>
                  {volume.some((point) => point.count > 0) ? (
                    <figure>
                      <figcaption className="mb-3 text-sm text-slate-600">
                        Completed sales{" "}
                        {data.period === "today"
                          ? "per four-hour interval"
                          : "per day"}
                      </figcaption>
                      <div
                        className="flex h-48 items-end gap-2"
                        aria-hidden="true"
                      >
                        {volume.map((point) => (
                          <div
                            key={point.label}
                            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                          >
                            <span className="text-xs">{point.count}</span>
                            <div
                              className="w-full rounded-t bg-teal-700"
                              style={{ height: `${(point.count / max) * 75}%` }}
                            />
                            <span
                              className="w-full truncate text-center text-xs"
                              title={point.label}
                            >
                              {data.period === "today"
                                ? point.label.slice(0, 5)
                                : point.label.slice(5)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <table className="sr-only">
                        <caption>Sales volume</caption>
                        <thead>
                          <tr>
                            <th>Period</th>
                            <th>Completed sales</th>
                          </tr>
                        </thead>
                        <tbody>
                          {volume.map((point) => (
                            <tr key={point.label}>
                              <td>{point.label}</td>
                              <td>{point.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </figure>
                  ) : (
                    <p className="text-sm text-slate-600">
                      No completed sales in this period.
                    </p>
                  )}
                  <Link href="/sales" className={actionLink}>
                    View recorded sales
                  </Link>
                </section>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Updated {formatDateTime(data.as_of)}. Expiry checks use{" "}
              {data.inventory_date} ({data.timezone}).
            </p>
          </>
        )
      )}
    </div>
  );
}
