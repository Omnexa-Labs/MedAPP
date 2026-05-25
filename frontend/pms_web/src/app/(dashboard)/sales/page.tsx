"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { salesRepo } from "@/lib/repositories/sales";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents, formatDateTime } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth.store";

export default function SalesPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canVoid = role === "pharmacy_admin" || role === "pharmacist";

  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["sales", status, method],
    queryFn: () =>
      salesRepo.list({
        status: status || undefined,
        payment_method: method || undefined,
      }),
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => salesRepo.voidSale(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["drugs"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
        <p className="text-sm text-slate-500">All completed and voided sales</p>
      </div>

      <div className="flex gap-3">
        <div className="w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="voided">Voided</option>
          </Select>
        </div>
        <div className="w-48">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">All methods</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile_money">Mobile money</option>
            <option value="insurance">Insurance</option>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sale #</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.sale_number}</TableCell>
                  <TableCell>{formatDateTime(s.created_at)}</TableCell>
                  <TableCell>{s.items.length}</TableCell>
                  <TableCell className="capitalize">
                    {s.payment_method.replace("_", " ")}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCents(s.total_cents, s.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={s.status === "voided" ? "destructive" : "success"}
                    >
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canVoid && s.status === "completed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Void sale ${s.sale_number}?`)) {
                            voidMut.mutate(s.id);
                          }
                        }}
                      >
                        Void
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500">
                    No sales yet.
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
