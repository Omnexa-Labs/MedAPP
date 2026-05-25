"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  prescriptionsRepo,
  type RxCreate,
} from "@/lib/repositories/prescriptions";
import { drugsRepo } from "@/lib/repositories/drugs";
import { customersRepo } from "@/lib/repositories/customers";
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
import { formatDate } from "@/lib/utils";

const statusVariant: Record<string, "default" | "success" | "warning" | "destructive"> = {
  pending: "warning",
  partially_dispensed: "warning",
  dispensed: "success",
  cancelled: "destructive",
};

const sourceLabel: Record<string, string> = {
  walk_in: "Walk-in",
  medapp: "MedApp",
  internal: "Internal",
};

type DraftItem = {
  drug_id: string;
  quantity_prescribed: number;
  dosage_instructions: string;
};

export default function PrescriptionsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["prescriptions", statusFilter, sourceFilter],
    queryFn: () =>
      prescriptionsRepo.list({
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
      }),
  });
  const { data: drugs = [] } = useQuery({
    queryKey: ["drugs"],
    queryFn: drugsRepo.list,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersRepo.list(),
  });

  const customerName = Object.fromEntries(
    customers.map((c) => [c.id, c.full_name])
  );

  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [prescriber, setPrescriber] = useState("");
  const [items, setItems] = useState<DraftItem[]>([
    { drug_id: "", quantity_prescribed: 0, dosage_instructions: "" },
  ]);

  const reset = () => {
    setCustomerId("");
    setPrescriber("");
    setItems([{ drug_id: "", quantity_prescribed: 0, dosage_instructions: "" }]);
  };

  const createMut = useMutation({
    mutationFn: (body: RxCreate) => prescriptionsRepo.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      setOpen(false);
      reset();
    },
  });

  const validItems = items.filter(
    (i) => i.drug_id && i.quantity_prescribed > 0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prescriptions</h1>
          <p className="text-sm text-slate-500">
            Queue of prescriptions awaiting dispense
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ New Prescription</Button>
      </div>

      <div className="flex gap-3">
        <div className="w-48">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="partially_dispensed">Partial</option>
            <option value="dispensed">Dispensed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <div className="w-48">
          <Select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All sources</option>
            <option value="walk_in">Walk-in</option>
            <option value="medapp">MedApp</option>
            <option value="internal">Internal</option>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rx #</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Prescriber</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prescriptions.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.rx_number}</TableCell>
                  <TableCell>{sourceLabel[p.source] || p.source}</TableCell>
                  <TableCell>
                    {p.customer_id
                      ? customerName[p.customer_id] ||
                        p.customer_id.slice(0, 8)
                      : "—"}
                  </TableCell>
                  <TableCell>{p.prescriber_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[p.status]}>
                      {p.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(p.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/prescriptions/${p.id}`}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      Open →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {prescriptions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500">
                    No prescriptions found.
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
            <DialogTitle>New prescription</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Customer (optional)</label>
              <Select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">—</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm">Prescriber</label>
              <Input
                value={prescriber}
                onChange={(e) => setPrescriber(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Items</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems((p) => [
                    ...p,
                    {
                      drug_id: "",
                      quantity_prescribed: 0,
                      dosage_instructions: "",
                    },
                  ])
                }
              >
                + Add item
              </Button>
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <div className="col-span-5">
                  <Select
                    value={it.drug_id}
                    onChange={(e) =>
                      setItems((p) =>
                        p.map((x, idx) =>
                          idx === i ? { ...x, drug_id: e.target.value } : x
                        )
                      )
                    }
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
                    value={it.quantity_prescribed}
                    onChange={(e) =>
                      setItems((p) =>
                        p.map((x, idx) =>
                          idx === i
                            ? {
                                ...x,
                                quantity_prescribed: Number(e.target.value),
                              }
                            : x
                        )
                      )
                    }
                  />
                </div>
                <div className="col-span-4">
                  <Input
                    placeholder="Dosage"
                    value={it.dosage_instructions}
                    onChange={(e) =>
                      setItems((p) =>
                        p.map((x, idx) =>
                          idx === i
                            ? { ...x, dosage_instructions: e.target.value }
                            : x
                        )
                      )
                    }
                  />
                </div>
                <div className="col-span-1 flex items-center">
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
                    onClick={() =>
                      setItems((p) => p.filter((_, idx) => idx !== i))
                    }
                    disabled={items.length === 1}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={validItems.length === 0 || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  customer_id: customerId || undefined,
                  prescriber_name: prescriber || undefined,
                  source: "walk_in",
                  items: validItems.map((i) => ({
                    drug_id: i.drug_id,
                    quantity_prescribed: i.quantity_prescribed,
                    dosage_instructions:
                      i.dosage_instructions || undefined,
                  })),
                })
              }
            >
              {createMut.isPending ? "Saving..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
