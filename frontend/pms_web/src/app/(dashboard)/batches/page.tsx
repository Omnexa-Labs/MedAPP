"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { batchesRepo, type BatchCreate } from "@/lib/repositories/batches";
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

export default function BatchesPage() {
  const qc = useQueryClient();
  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: () => batchesRepo.list(),
  });
  const { data: drugs = [] } = useQuery({
    queryKey: ["drugs"],
    queryFn: drugsRepo.list,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersRepo.list(),
  });

  const drugById = Object.fromEntries(drugs.map((d) => [d.id, d.name]));

  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const oneYear = new Date(Date.now() + 365 * 86400e3).toISOString().slice(0, 10);

  const [form, setForm] = useState<BatchCreate>({
    drug_id: "",
    supplier_id: undefined,
    batch_number: "",
    quantity_received: 0,
    unit_cost_cents: 0,
    selling_price_cents: 0,
    received_at: today,
    expiry_date: oneYear,
  });

  const createMut = useMutation({
    mutationFn: batchesRepo.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["drugs"] });
      setOpen(false);
    },
  });

  const isExpiring = (d: string) =>
    new Date(d).getTime() - Date.now() < 90 * 86400e3;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Batches</h1>
          <p className="text-sm text-slate-500">
            FEFO consumption · oldest expiry first
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Receive Batch</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Drug</TableHead>
                <TableHead>Batch #</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Sell</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Expiry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{drugById[b.drug_id] || b.drug_id.slice(0, 8)}</TableCell>
                  <TableCell>{b.batch_number}</TableCell>
                  <TableCell className="text-right">{b.quantity_on_hand}</TableCell>
                  <TableCell className="text-right">{b.quantity_received}</TableCell>
                  <TableCell className="text-right">
                    {formatCents(b.unit_cost_cents)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCents(b.selling_price_cents)}
                  </TableCell>
                  <TableCell>{formatDate(b.received_at)}</TableCell>
                  <TableCell>
                    {formatDate(b.expiry_date)}{" "}
                    {isExpiring(b.expiry_date) && (
                      <Badge variant="warning">Soon</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-500">
                    No batches yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Receive a new batch</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm">Drug</label>
              <Select
                value={form.drug_id}
                onChange={(e) => setForm({ ...form, drug_id: e.target.value })}
              >
                <option value="">Select a drug</option>
                {drugs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.strength}
                  </option>
                ))}
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-sm">Supplier (optional)</label>
              <Select
                value={form.supplier_id ?? ""}
                onChange={(e) =>
                  setForm({ ...form, supplier_id: e.target.value || undefined })
                }
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm">Batch number</label>
              <Input
                value={form.batch_number}
                onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Quantity</label>
              <Input
                type="number"
                value={form.quantity_received}
                onChange={(e) =>
                  setForm({ ...form, quantity_received: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="text-sm">Unit cost (cents)</label>
              <Input
                type="number"
                value={form.unit_cost_cents}
                onChange={(e) =>
                  setForm({ ...form, unit_cost_cents: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="text-sm">Selling price (cents)</label>
              <Input
                type="number"
                value={form.selling_price_cents}
                onChange={(e) =>
                  setForm({ ...form, selling_price_cents: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="text-sm">Received on</label>
              <Input
                type="date"
                value={form.received_at}
                onChange={(e) => setForm({ ...form, received_at: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Expiry</label>
              <Input
                type="date"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.drug_id || !form.batch_number || createMut.isPending}
              onClick={() => createMut.mutate(form)}
            >
              {createMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
