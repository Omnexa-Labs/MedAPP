"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardRepository } from "@/lib/repositories/dashboard.repository";
import { formatCurrency } from "@/lib/utils/format";

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => dashboardRepository.getSummary().then((r) => r.data),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border bg-white" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Patients Today"
          value={data?.patients_registered_today ?? 0}
          description={`${data?.total_patients ?? 0} total`}
        />
        <StatCard
          title="Appointments Today"
          value={data?.appointments_today ?? 0}
          description={`${data?.appointments_completed_today ?? 0} completed`}
        />
        <StatCard
          title="Queue"
          value={data?.queue_waiting ?? 0}
          description={`${data?.queue_serving ?? 0} being served`}
        />
        <StatCard
          title="Revenue Today"
          value={formatCurrency(data?.revenue_today_cents ?? 0, data?.currency)}
          description={`${formatCurrency(data?.revenue_this_month_cents ?? 0, data?.currency)} this month`}
        />
      </div>

      {(data?.low_stock_count ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-medium text-amber-800">Low Stock Alerts ({data?.low_stock_count})</h3>
          <div className="mt-2 space-y-1">
            {data?.stock_alerts?.slice(0, 5).map((alert: Record<string, unknown>, i: number) => (
              <p key={i} className="text-sm text-amber-700">
                {alert.drug_name as string} - {alert.quantity_remaining as number} remaining
                (reorder at {alert.reorder_level as number})
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, description }: { title: string; value: string | number; description?: string }) {
  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    </div>
  );
}
