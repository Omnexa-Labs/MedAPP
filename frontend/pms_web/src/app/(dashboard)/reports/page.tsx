"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsRepo } from "@/lib/repositories/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatCents } from "@/lib/utils";

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400e3)
    .toISOString()
    .slice(0, 10);
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);

  const { data: summary } = useQuery({
    queryKey: ["reports", "summary", start, end],
    queryFn: () => reportsRepo.salesSummary(start, end),
  });
  const { data: daily = [] } = useQuery({
    queryKey: ["reports", "daily", start, end],
    queryFn: () => reportsRepo.salesDaily(start, end),
  });
  const { data: top = [] } = useQuery({
    queryKey: ["reports", "top", start, end],
    queryFn: () => reportsRepo.topDrugs(start, end, 10),
  });

  const chartData = daily.map((d) => ({
    day: d.day.slice(5),
    total: d.total_cents / 100,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Sales, top sellers, trends</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <span className="text-slate-400">to</span>
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCents(summary.gross_total_cents)}
              </div>
              <p className="text-xs text-slate-500">
                {summary.sale_count} sales
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                Discounts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCents(summary.discount_cents)}
              </div>
              <p className="text-xs text-slate-500">
                Across {summary.sale_count} sales
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                Avg sale
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.sale_count > 0
                  ? formatCents(
                      Math.round(summary.gross_total_cents / summary.sale_count)
                    )
                  : formatCents(0)}
              </div>
              <p className="text-xs text-slate-500">Per ticket</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Daily sales</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-500">No sales in this period.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#0F766E"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top selling drugs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Drug</TableHead>
                <TableHead className="text-right">Units sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((d) => (
                <TableRow key={d.drug_id}>
                  <TableCell className="font-medium">{d.drug_name}</TableCell>
                  <TableCell className="text-right">{d.units_sold}</TableCell>
                  <TableCell className="text-right">
                    {formatCents(d.revenue_cents)}
                  </TableCell>
                </TableRow>
              ))}
              {top.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-slate-500">
                    No data.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
