"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pharmacyRepository } from "@/lib/repositories/pharmacy.repository";
import { formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";

export default function PrescriptionsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dispenseId, setDispenseId] = useState<string | null>(null);
  const [dispenseNotes, setDispenseNotes] = useState("");

  // --- Queries ---
  const { data, isLoading } = useQuery({
    queryKey: ["prescriptions", statusFilter],
    queryFn: () =>
      pharmacyRepository
        .listPrescriptions({
          status: statusFilter || undefined,
          limit: 50,
        })
        .then((r) => r.data),
  });

  const { data: prescriptionDetail } = useQuery({
    queryKey: ["prescription-detail", expandedId],
    queryFn: () =>
      pharmacyRepository.getPrescription(expandedId!).then((r) => r.data),
    enabled: !!expandedId,
  });

  // --- Dispense mutation ---
  const dispenseMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      pharmacyRepository.dispensePrescription(id, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      queryClient.invalidateQueries({
        queryKey: ["prescription-detail", dispenseId],
      });
      setDispenseId(null);
      setDispenseNotes("");
    },
  });

  const handleDispense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispenseId) return;
    dispenseMutation.mutate({ id: dispenseId, notes: dispenseNotes });
  };

  const prescriptions: Record<string, unknown>[] = data?.items ?? [];
  const detailItems: Record<string, unknown>[] =
    prescriptionDetail?.items ??
    prescriptionDetail?.prescription_items ??
    [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Prescriptions</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-48"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="dispensed">Dispensed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      {/* Prescriptions table */}
      {isLoading ? (
        <LoadingSkeleton lines={8} />
      ) : prescriptions.length === 0 ? (
        <EmptyState
          title="No prescriptions found"
          description="Adjust the status filter or check back later."
        />
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prescription ID</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Prescribed By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prescriptions.map((rx) => {
                const rxId = (rx.prescription_id ?? rx.id) as string;
                const isExpanded = expandedId === rxId;
                const status = (rx.status as string) || "pending";

                return (
                  <TableRow key={rxId}>
                    <TableCell colSpan={6} className="p-0">
                      {/* Prescription row */}
                      <div className="grid grid-cols-6 items-center">
                        <span className="p-4 font-mono text-sm">
                          {rxId.slice(0, 8)}...
                        </span>
                        <span className="p-4">
                          {(rx.patient_name as string) ||
                            (rx.patient_id as string) ||
                            "-"}
                        </span>
                        <span className="p-4">
                          {(rx.prescribed_by_name as string) ||
                            (rx.prescribed_by as string) ||
                            "-"}
                        </span>
                        <span className="p-4">
                          <StatusBadge status={status} />
                        </span>
                        <span className="p-4">
                          {formatDate(rx.created_at as string)}
                        </span>
                        <span className="flex gap-2 p-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : rxId)
                            }
                          >
                            {isExpanded ? "Hide" : "View"}
                          </Button>
                          {status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDispenseId(rxId)}
                            >
                              Dispense
                            </Button>
                          )}
                        </span>
                      </div>

                      {/* Expanded items */}
                      {isExpanded && (
                        <div className="border-t bg-slate-50 px-6 py-4">
                          <h4 className="mb-3 text-sm font-semibold text-slate-700">
                            Prescription Items
                          </h4>
                          {detailItems.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No items found for this prescription.
                            </p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left text-slate-500">
                                  <th className="pb-2 font-medium">
                                    Drug Name
                                  </th>
                                  <th className="pb-2 font-medium">Dosage</th>
                                  <th className="pb-2 font-medium">
                                    Qty Prescribed
                                  </th>
                                  <th className="pb-2 font-medium">
                                    Qty Dispensed
                                  </th>
                                  <th className="pb-2 font-medium">
                                    Duration (days)
                                  </th>
                                  <th className="pb-2 font-medium">
                                    Instructions
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {detailItems.map(
                                  (
                                    item: Record<string, unknown>,
                                    idx: number
                                  ) => (
                                    <tr
                                      key={
                                        (item.item_id as string) ?? String(idx)
                                      }
                                      className="border-b last:border-0"
                                    >
                                      <td className="py-2">
                                        {(item.drug_name as string) || "-"}
                                      </td>
                                      <td className="py-2">
                                        {(item.dosage as string) || "-"}
                                      </td>
                                      <td className="py-2">
                                        {String(
                                          item.quantity_prescribed ?? "-"
                                        )}
                                      </td>
                                      <td className="py-2">
                                        {String(
                                          item.quantity_dispensed ?? "-"
                                        )}
                                      </td>
                                      <td className="py-2">
                                        {String(item.duration_days ?? "-")}
                                      </td>
                                      <td className="py-2">
                                        {(item.instructions as string) || "-"}
                                      </td>
                                    </tr>
                                  )
                                )}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dispense Dialog */}
      <Dialog
        open={!!dispenseId}
        onOpenChange={(open) => {
          if (!open) {
            setDispenseId(null);
            setDispenseNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispense Prescription</DialogTitle>
            <DialogDescription>
              Confirm that this prescription has been dispensed. Add any notes
              below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDispense} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Notes (optional)
              </label>
              <Textarea
                value={dispenseNotes}
                onChange={(e) => setDispenseNotes(e.target.value)}
                placeholder="Add dispensing notes..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDispenseId(null);
                  setDispenseNotes("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={dispenseMutation.isPending}>
                {dispenseMutation.isPending
                  ? "Dispensing..."
                  : "Confirm Dispense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
