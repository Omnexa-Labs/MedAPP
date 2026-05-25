"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  prescriptionsRepo,
  type DispenseLine,
} from "@/lib/repositories/prescriptions";
import { drugsRepo } from "@/lib/repositories/drugs";
import { customersRepo } from "@/lib/repositories/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDate } from "@/lib/utils";

const statusVariant: Record<string, "default" | "success" | "warning" | "destructive"> = {
  pending: "warning",
  partially_dispensed: "warning",
  dispensed: "success",
  cancelled: "destructive",
};

export default function PrescriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const id = params.id;

  const { data: rx, isLoading } = useQuery({
    queryKey: ["prescriptions", id],
    queryFn: () => prescriptionsRepo.get(id),
  });
  const { data: drugs = [] } = useQuery({
    queryKey: ["drugs"],
    queryFn: drugsRepo.list,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersRepo.list(),
  });

  const drugById = useMemo(
    () => Object.fromEntries(drugs.map((d) => [d.id, d])),
    [drugs]
  );
  const customer = customers.find((c) => c.id === rx?.customer_id);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentRef, setPaymentRef] = useState("");

  const dispenseMut = useMutation({
    mutationFn: (lines: DispenseLine[]) =>
      prescriptionsRepo.dispense(id, {
        items: lines,
        payment_method: paymentMethod,
        payment_ref: paymentRef || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["drugs"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      setQuantities({});
    },
  });

  const cancelMut = useMutation({
    mutationFn: () => prescriptionsRepo.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescriptions"] }),
  });

  if (isLoading || !rx) {
    return <div className="text-slate-500">Loading...</div>;
  }

  const dispensable = rx.status === "pending" || rx.status === "partially_dispensed";

  const submit = () => {
    const lines: DispenseLine[] = rx.items
      .map((it) => ({
        prescription_item_id: it.id,
        quantity: quantities[it.id] ?? 0,
      }))
      .filter((l) => l.quantity > 0);
    if (lines.length > 0) dispenseMut.mutate(lines);
  };

  const hasAny = rx.items.some((it) => (quantities[it.id] ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/prescriptions"
            className="text-sm text-slate-500 hover:underline"
          >
            ← Prescriptions
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{rx.rx_number}</h1>
          <p className="text-sm text-slate-500">
            {rx.source.replace("_", " ")} ·{" "}
            {customer ? customer.full_name : "No customer"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[rx.status]}>
            {rx.status.replace("_", " ")}
          </Badge>
          {dispensable && (
            <Button
              variant="outline"
              onClick={() => cancelMut.mutate()}
              disabled={cancelMut.isPending}
            >
              Cancel Rx
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <div className="text-slate-500">Prescriber</div>
            <div className="font-medium">{rx.prescriber_name || "—"}</div>
          </div>
          <div>
            <div className="text-slate-500">License</div>
            <div className="font-medium">{rx.prescriber_license || "—"}</div>
          </div>
          <div>
            <div className="text-slate-500">External ref</div>
            <div className="font-medium">{rx.external_ref || "—"}</div>
          </div>
          <div>
            <div className="text-slate-500">Created</div>
            <div className="font-medium">{formatDate(rx.created_at)}</div>
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
                <TableHead>Dosage</TableHead>
                <TableHead className="text-right">Prescribed</TableHead>
                <TableHead className="text-right">Dispensed</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                {dispensable && (
                  <TableHead className="text-right">Dispense now</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rx.items.map((it) => {
                const remaining = it.quantity_prescribed - it.quantity_dispensed;
                return (
                  <TableRow key={it.id}>
                    <TableCell>
                      {drugById[it.drug_id]?.name || it.drug_name_snapshot}
                    </TableCell>
                    <TableCell>{it.dosage_instructions || "—"}</TableCell>
                    <TableCell className="text-right">
                      {it.quantity_prescribed}
                    </TableCell>
                    <TableCell className="text-right">
                      {it.quantity_dispensed}
                    </TableCell>
                    <TableCell className="text-right">{remaining}</TableCell>
                    {dispensable && (
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="ml-auto w-24"
                          value={quantities[it.id] ?? ""}
                          max={remaining}
                          min={0}
                          onChange={(e) =>
                            setQuantities((p) => ({
                              ...p,
                              [it.id]: Math.min(
                                Number(e.target.value),
                                remaining
                              ),
                            }))
                          }
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dispensable && (
        <Card>
          <CardHeader>
            <CardTitle>Dispense</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Payment method</label>
                <Select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="insurance">Insurance</option>
                </Select>
              </div>
              <div>
                <label className="text-sm">Payment reference</label>
                <Input
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                disabled={!hasAny || dispenseMut.isPending}
                onClick={submit}
              >
                {dispenseMut.isPending ? "Dispensing..." : "Dispense"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
