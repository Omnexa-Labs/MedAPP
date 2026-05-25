"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { purchaseOrdersRepo, type POCreate } from "@/lib/repositories/purchaseOrders";
import { drugsRepo } from "@/lib/repositories/drugs";
import { suppliersRepo } from "@/lib/repositories/suppliers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents, formatDate } from "@/lib/utils";

const statusVariant: Record<string, "default" | "success" | "warning" | "destructive"> = {
  draft: "default",
  sent: "warning",
  received: "success",
  cancelled: "destructive",
};

type DraftLine = { drug_id: string; quantity: number; unit_cost_cents: number };

export default function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => purchaseOrdersRepo.list(),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersRepo.list(),
  });
  const { data: drugs = [] } = useQuery({
    queryKey: ["drugs"],
    queryFn: drugsRepo.list,
  });
  const supplierName = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { drug_id: "", quantity: 0, unit_cost_cents: 0 },
  ]);

  const reset = () => {
    setSupplierId("");
    setExpectedAt("");
    setNotes("");
    setLines([{ drug_id: "", quantity: 0, unit_cost_cents: 0 }]);
  };

  const createMut = useMutation({
    mutationFn: (body: POCreate) => purchaseOrdersRepo.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      setOpen(false);
      reset();
    },
  });

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const validLines = lines.filter((l) => l.drug_id && l.quantity > 0);
  const total = validLines.reduce((s, l) => s + l.quantity * l.unit_cost_cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-sm text-slate-500">
            Order stock from suppliers and receive goods
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ New PO</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.po_number}</TableCell>
                  <TableCell>
                    {supplierName[o.supplier_id] || o.supplier_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[o.status]}>{o.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCents(o.total_cents, o.currency)}
                  </TableCell>
                  <TableCell>
                    {o.expected_at ? formatDate(o.expected_at) : "—"}
                  </TableCell>
                  <TableCell>{formatDate(o.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/purchase-orders/${o.id}`}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      Open →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500">
                    No purchase orders yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New purchase order</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm">Supplier</label>
              <Select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Select a supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm">Expected date</label>
              <Input
                type="date"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm">Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Items</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLines((p) => [
                    ...p,
                    { drug_id: "", quantity: 0, unit_cost_cents: 0 },
                  ])
                }
              >
                + Add line
              </Button>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <div className="col-span-6">
                  <Select
                    value={l.drug_id}
                    onChange={(e) => updateLine(i, { drug_id: e.target.value })}
                  >
                    <option value="">Select drug</option>
                    {drugs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {d.strength}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={l.quantity}
                    onChange={(e) =>
                      updateLine(i, { quantity: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    placeholder="Unit cost (cents)"
                    value={l.unit_cost_cents}
                    onChange={(e) =>
                      updateLine(i, { unit_cost_cents: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col-span-1 flex items-center">
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
                    onClick={() =>
                      setLines((p) => p.filter((_, idx) => idx !== i))
                    }
                    disabled={lines.length === 1}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-2 text-sm font-medium">
              Total: {formatCents(total)}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !supplierId || validLines.length === 0 || createMut.isPending
              }
              onClick={() =>
                createMut.mutate({
                  supplier_id: supplierId,
                  expected_at: expectedAt || undefined,
                  notes: notes || undefined,
                  items: validLines,
                })
              }
            >
              {createMut.isPending ? "Saving..." : "Create PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
