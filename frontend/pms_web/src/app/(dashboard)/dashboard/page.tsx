"use client";

import { useQuery } from "@tanstack/react-query";
import { reportsRepo } from "@/lib/repositories/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "overview"],
    queryFn: reportsRepo.overview,
  });

  if (isLoading || !data) {
    return <div className="text-slate-500">Loading dashboard...</div>;
  }

  const tiles = [
    {
      label: "Sales (last 30 days)",
      value: formatCents(data.sales_summary.gross_total_cents),
      sub: `${data.sales_summary.sale_count} sales`,
    },
    {
      label: "Stock value (at sell)",
      value: formatCents(data.stock_valuation.sell_value_cents),
      sub: `${data.stock_valuation.total_units} units on hand`,
    },
    {
      label: "Pending prescriptions",
      value: String(data.pending_prescriptions),
      sub: "Awaiting dispense",
    },
    {
      label: "Low stock items",
      value: String(data.low_stock_count),
      sub: `${data.expiring_soon_count} expiring soon`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500">Today's snapshot of pharmacy operations</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {t.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{t.value}</div>
              <p className="text-xs text-slate-500">{t.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payments breakdown (last 30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.sales_summary.by_payment_method.length === 0 ? (
              <p className="text-sm text-slate-500">No sales yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.sales_summary.by_payment_method.map((m) => (
                  <li key={m.method} className="flex items-center justify-between">
                    <span className="capitalize">{m.method.replace("_", " ")}</span>
                    <span className="text-sm">
                      {m.count} · {formatCents(m.total_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock valuation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>At-cost value</span>
              <span>{formatCents(data.stock_valuation.cost_value_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>At-sell value</span>
              <span>{formatCents(data.stock_valuation.sell_value_cents)}</span>
            </div>
            <div className="flex justify-between text-sm font-medium">
              <span>Potential gross margin</span>
              <span>
                {formatCents(
                  data.stock_valuation.sell_value_cents -
                    data.stock_valuation.cost_value_cents
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
