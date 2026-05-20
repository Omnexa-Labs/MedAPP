"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pharmacyRepository } from "@/lib/repositories/pharmacy.repository";
import { formatDate, formatCurrency } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";

export default function PharmacyPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [expandedDrugId, setExpandedDrugId] = useState<string | null>(null);
  const [addDrugOpen, setAddDrugOpen] = useState(false);
  const [addBatchDrugId, setAddBatchDrugId] = useState<string | null>(null);

  // --- Drug form state ---
  const [drugForm, setDrugForm] = useState({
    name: "",
    brand_name: "",
    category: "other",
    form: "tablet",
    strength: "",
    unit: "",
    reorder_level: 0,
  });

  // --- Batch form state ---
  const [batchForm, setBatchForm] = useState({
    batch_number: "",
    quantity: 0,
    expiry_date: "",
    cost_price_cents: 0,
    selling_price_cents: 0,
  });

  // --- Queries ---
  const { data: drugsData, isLoading } = useQuery({
    queryKey: ["pharmacy-drugs", search],
    queryFn: () =>
      pharmacyRepository
        .listDrugs({ search: search || undefined, limit: 50 })
        .then((r) => r.data),
  });

  const { data: alertsData } = useQuery({
    queryKey: ["stock-alerts"],
    queryFn: () =>
      pharmacyRepository.listStockAlerts({ limit: 100 }).then((r) => r.data),
  });

  const { data: batchesData } = useQuery({
    queryKey: ["drug-batches", expandedDrugId],
    queryFn: () =>
      pharmacyRepository.listBatches(expandedDrugId!).then((r) => r.data),
    enabled: !!expandedDrugId,
  });

  // --- Mutations ---
  const createDrugMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      pharmacyRepository.createDrug(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharmacy-drugs"] });
      setAddDrugOpen(false);
      setDrugForm({
        name: "",
        brand_name: "",
        category: "other",
        form: "tablet",
        strength: "",
        unit: "",
        reorder_level: 0,
      });
    },
  });

  const createBatchMutation = useMutation({
    mutationFn: ({
      drugId,
      data,
    }: {
      drugId: string;
      data: Record<string, unknown>;
    }) => pharmacyRepository.createBatch(drugId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["drug-batches", expandedDrugId],
      });
      queryClient.invalidateQueries({ queryKey: ["pharmacy-drugs"] });
      setAddBatchDrugId(null);
      setBatchForm({
        batch_number: "",
        quantity: 0,
        expiry_date: "",
        cost_price_cents: 0,
        selling_price_cents: 0,
      });
    },
  });

  const handleCreateDrug = (e: React.FormEvent) => {
    e.preventDefault();
    createDrugMutation.mutate(drugForm);
  };

  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addBatchDrugId) return;
    createBatchMutation.mutate({ drugId: addBatchDrugId, data: batchForm });
  };

  const alertCount = alertsData?.items?.length ?? alertsData?.total ?? 0;
  const drugs: Record<string, unknown>[] = drugsData?.items ?? [];
  const batches: Record<string, unknown>[] =
    batchesData?.items ?? (Array.isArray(batchesData) ? batchesData : []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Drug Inventory</h1>
        <div className="flex items-center gap-3">
          {alertCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
              Stock Alerts: {alertCount}
            </span>
          )}
          <Button onClick={() => setAddDrugOpen(true)}>Add Drug</Button>
        </div>
      </div>

      {/* Search */}
      <Input
        type="text"
        placeholder="Search drugs by name, brand, or category..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {/* Drug table */}
      {isLoading ? (
        <LoadingSkeleton lines={8} />
      ) : drugs.length === 0 ? (
        <EmptyState
          title="No drugs found"
          description="Add a drug to get started or adjust your search."
          action={
            <Button onClick={() => setAddDrugOpen(true)}>Add Drug</Button>
          }
        />
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Strength</TableHead>
                <TableHead>Reorder Level</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drugs.map((drug) => {
                const drugId = drug.drug_id as string;
                const isExpanded = expandedDrugId === drugId;

                return (
                  <TableRow key={drugId}>
                    <TableCell colSpan={7} className="p-0">
                      {/* Drug row */}
                      <div className="grid grid-cols-7 items-center">
                        <button
                          type="button"
                          className="p-4 text-left font-medium text-blue-600 hover:underline"
                          onClick={() =>
                            setExpandedDrugId(isExpanded ? null : drugId)
                          }
                        >
                          {drug.name as string}
                        </button>
                        <span className="p-4">
                          {(drug.brand_name as string) || "-"}
                        </span>
                        <span className="p-4 capitalize">
                          {(drug.category as string) || "-"}
                        </span>
                        <span className="p-4 capitalize">
                          {(drug.form as string) || "-"}
                        </span>
                        <span className="p-4">
                          {(drug.strength as string) || "-"}
                        </span>
                        <span className="p-4">
                          {drug.reorder_level != null
                            ? String(drug.reorder_level)
                            : "-"}
                        </span>
                        <span className="p-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setExpandedDrugId(isExpanded ? null : drugId)
                            }
                          >
                            {isExpanded ? "Hide Batches" : "View Batches"}
                          </Button>
                        </span>
                      </div>

                      {/* Expanded batches section */}
                      {isExpanded && (
                        <div className="border-t bg-slate-50 px-6 py-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-slate-700">
                              Batches
                            </h4>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setAddBatchDrugId(drugId)}
                            >
                              Add Batch
                            </Button>
                          </div>

                          {batches.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No batches found for this drug.
                            </p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left text-slate-500">
                                  <th className="pb-2 font-medium">
                                    Batch Number
                                  </th>
                                  <th className="pb-2 font-medium">
                                    Qty Remaining
                                  </th>
                                  <th className="pb-2 font-medium">
                                    Expiry Date
                                  </th>
                                  <th className="pb-2 font-medium">
                                    Selling Price
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {batches.map(
                                  (batch: Record<string, unknown>) => (
                                    <tr
                                      key={batch.batch_id as string}
                                      className="border-b last:border-0"
                                    >
                                      <td className="py-2">
                                        {batch.batch_number as string}
                                      </td>
                                      <td className="py-2">
                                        {String(
                                          batch.quantity_remaining ??
                                            batch.quantity ??
                                            "-"
                                        )}
                                      </td>
                                      <td className="py-2">
                                        {formatDate(
                                          batch.expiry_date as string
                                        )}
                                      </td>
                                      <td className="py-2">
                                        {batch.selling_price_cents != null
                                          ? formatCurrency(
                                              batch.selling_price_cents as number
                                            )
                                          : "-"}
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

      {/* Add Drug Dialog */}
      <Dialog open={addDrugOpen} onOpenChange={setAddDrugOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Drug</DialogTitle>
            <DialogDescription>
              Fill in the drug details below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateDrug} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Name
                </label>
                <Input
                  required
                  value={drugForm.name}
                  onChange={(e) =>
                    setDrugForm({ ...drugForm, name: e.target.value })
                  }
                  placeholder="e.g. Amoxicillin"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Brand Name
                </label>
                <Input
                  value={drugForm.brand_name}
                  onChange={(e) =>
                    setDrugForm({ ...drugForm, brand_name: e.target.value })
                  }
                  placeholder="e.g. Amoxil"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Category
                </label>
                <Select
                  value={drugForm.category}
                  onChange={(e) =>
                    setDrugForm({ ...drugForm, category: e.target.value })
                  }
                >
                  <option value="antibiotic">Antibiotic</option>
                  <option value="analgesic">Analgesic</option>
                  <option value="antiviral">Antiviral</option>
                  <option value="supplement">Supplement</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Form
                </label>
                <Select
                  value={drugForm.form}
                  onChange={(e) =>
                    setDrugForm({ ...drugForm, form: e.target.value })
                  }
                >
                  <option value="tablet">Tablet</option>
                  <option value="capsule">Capsule</option>
                  <option value="syrup">Syrup</option>
                  <option value="injection">Injection</option>
                  <option value="cream">Cream</option>
                  <option value="drops">Drops</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Strength
                </label>
                <Input
                  value={drugForm.strength}
                  onChange={(e) =>
                    setDrugForm({ ...drugForm, strength: e.target.value })
                  }
                  placeholder="e.g. 500mg"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Unit
                </label>
                <Input
                  value={drugForm.unit}
                  onChange={(e) =>
                    setDrugForm({ ...drugForm, unit: e.target.value })
                  }
                  placeholder="e.g. mg, ml"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Reorder Level
                </label>
                <Input
                  type="number"
                  min={0}
                  value={drugForm.reorder_level}
                  onChange={(e) =>
                    setDrugForm({
                      ...drugForm,
                      reorder_level: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddDrugOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createDrugMutation.isPending}>
                {createDrugMutation.isPending ? "Adding..." : "Add Drug"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Batch Dialog */}
      <Dialog
        open={!!addBatchDrugId}
        onOpenChange={(open) => {
          if (!open) setAddBatchDrugId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Batch</DialogTitle>
            <DialogDescription>
              Add a new batch for this drug.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateBatch} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Batch Number
              </label>
              <Input
                required
                value={batchForm.batch_number}
                onChange={(e) =>
                  setBatchForm({ ...batchForm, batch_number: e.target.value })
                }
                placeholder="e.g. BATCH-001"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Quantity
                </label>
                <Input
                  type="number"
                  required
                  min={1}
                  value={batchForm.quantity}
                  onChange={(e) =>
                    setBatchForm({
                      ...batchForm,
                      quantity: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Expiry Date
                </label>
                <Input
                  type="date"
                  required
                  value={batchForm.expiry_date}
                  onChange={(e) =>
                    setBatchForm({ ...batchForm, expiry_date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Cost Price (cents)
                </label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={batchForm.cost_price_cents}
                  onChange={(e) =>
                    setBatchForm({
                      ...batchForm,
                      cost_price_cents: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Selling Price (cents)
                </label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={batchForm.selling_price_cents}
                  onChange={(e) =>
                    setBatchForm({
                      ...batchForm,
                      selling_price_cents: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddBatchDrugId(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createBatchMutation.isPending}>
                {createBatchMutation.isPending ? "Adding..." : "Add Batch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
