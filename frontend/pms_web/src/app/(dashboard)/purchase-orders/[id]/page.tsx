"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  purchaseOrdersRepo,
  type ReceiveLine,
} from "@/lib/repositories/purchaseOrders";
import { drugsRepo } from "@/lib/repositories/drugs";
import { suppliersRepo } from "@/lib/repositories/suppliers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

type LineForm = Omit<ReceiveLine, "purchase_order_item_id">;

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id;

  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-orders", id],
    queryFn: () => purchaseOrdersRepo.get(id),
  });
  const { data: drugs = [] } = useQuery({
    queryKey: ["drugs"],
    queryFn: drugsRepo.list,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersRepo.list(),
  });

  const drugById = useMemo(
    () => Object.fromEntries(drugs.map((d) => [d.id, d])),
    [drugs]
  );
  const supplierName = useMemo(
    () => Object.fromEntries(suppliers.map((s) => [s.id, s.name])),
    [suppliers]
  );

  const today = new Date().toISOString().slice(0, 10);
  const defaultExpiry = new Date(Date.now() + 365 * 86400e3)
    .toISOString()
    .slice(0, 10);

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveLines, setReceiveLines] = useState<
    Record<string, LineForm>
  >({});

  const sendMut = useMutation({
    mutationFn: () => purchaseOrdersRepo.send(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
  const cancelMut = useMutation({
    mutationFn: () => purchaseOrdersRepo.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
  const receiveMut = useMutation({
    mutationFn: (lines: ReceiveLine[]) => purchaseOrdersRepo.receive(id, lines),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["drugs"] });
      setReceiveOpen(false);
    },
  });

  if (isLoading || !po) {
    return <div className="text-slate-500">Loading...</div>;
  }

  const openReceive = () => {
    const initial: Record<string, LineForm> = {};
    for (const it of po.items) {
      initial[it.id] = {
        batch_number: "",
        quantity_received: it.quantity,
        unit_cost_cents: it.unit_cost_cents,
        selling_price_cents:
          drugById[it.drug_id]?.default_selling_price_cents ??
          it.unit_cost_cents,
        received_at: today,
        expiry_date: defaultExpiry,
      };
    }
    setReceiveLines(initial);
    setReceiveOpen(true);
  };

  const updateLine = (itemId: string, patch: Partial<LineForm>) =>
    setReceiveLines((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));

  const submitReceive = () => {
    const payload: ReceiveLine[] = po.items.map((it) => ({
      purchase_order_item_id: it.id,
      ...receiveLines[it.id],
    }));
    receiveMut.mutate(payload);
  };

  const ready = po.items.every(
    (it) =>
      receiveLines[it.id]?.batch_number &&
      receiveLines[it.id]?.quantity_received > 0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/purchase-orders"
            className="text-sm text-slate-500 hover:underline"
          >
            ← Purchase orders
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{po.po_number}</h1>
          <p className="text-sm text-slate-500">
            {supplierName[po.supplier_id] || po.supplier_id.slice(0, 8)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[po.status]}>{po.status}</Badge>
          {po.status === "draft" && (
            <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
              Send to supplier
            </Button>
          )}
          {(po.status === "draft" || po.status === "sent") && (
            <Button
              variant="outline"
              onClick={() => cancelMut.mutate()}
              disabled={cancelMut.isPending}
            >
              Cancel
            </Button>
          )}
          {po.status === "sent" && <Button onClick={openReceive}>Receive goods</Button>}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <div className="text-slate-500">Total</div>
            <div className="font-medium">{formatCents(po.total_cents, po.currency)}</div>
          </div>
          <div>
            <div className="text-slate-500">Expected</div>
            <div className="font-medium">
              {po.expected_at ? formatDate(po.expected_at) : "—"}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Created</div>
            <div className="font-medium">{formatDate(po.created_at)}</div>
          </div>
          <div>
            <div className="text-slate-500">Notes</div>
            <div className="font-medium">{po.notes || "—"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Drug</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    {drugById[it.drug_id]?.name || it.drug_id.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-right">{it.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatCents(it.unit_cost_cents)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCents(it.quantity * it.unit_cost_cents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {receiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Receive goods</h2>
              <button
                className="text-slate-500 hover:text-slate-700"
                onClick={() => setReceiveOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              {po.items.map((it) => {
                const line = receiveLines[it.id];
                if (!line) return null;
                return (
                  <div key={it.id} className="rounded border p-3">
                    <div className="mb-2 text-sm font-medium">
                      {drugById[it.drug_id]?.name || it.drug_id.slice(0, 8)} ·
                      ordered {it.quantity}
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      <div className="col-span-2">
                        <label className="text-xs text-slate-500">Batch #</label>
                        <Input
                          value={line.batch_number}
                          onChange={(e) =>
                            updateLine(it.id, { batch_number: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Qty</label>
                        <Input
                          type="number"
                          value={line.quantity_received}
                          onChange={(e) =>
                            updateLine(it.id, {
                              quantity_received: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Cost</label>
                        <Input
                          type="number"
                          value={line.unit_cost_cents}
                          onChange={(e) =>
                            updateLine(it.id, {
                              unit_cost_cents: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Sell</label>
                        <Input
                          type="number"
                          value={line.selling_price_cents}
                          onChange={(e) =>
                            updateLine(it.id, {
                              selling_price_cents: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Expiry</label>
                        <Input
                          type="date"
                          value={line.expiry_date}
                          onChange={(e) =>
                            updateLine(it.id, { expiry_date: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReceiveOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!ready || receiveMut.isPending}
                onClick={submitReceive}
              >
                {receiveMut.isPending ? "Receiving..." : "Receive"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
