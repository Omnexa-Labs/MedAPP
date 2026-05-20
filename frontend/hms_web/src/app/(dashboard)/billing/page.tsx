"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingRepository } from "@/lib/repositories/billing.repository";
import { formatCurrency, formatDate } from "@/lib/utils/format";
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
import { StatusBadge } from "@/components/shared/status-badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(
    null
  );
  const [paymentDialogInvoiceId, setPaymentDialogInvoiceId] = useState<
    string | null
  >(null);

  // --- Payment form state ---
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "cash",
    reference: "",
  });

  // --- Queries ---
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => billingRepository.getSummary().then((r) => r.data),
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ["invoices", statusFilter],
    queryFn: () =>
      billingRepository
        .listInvoices({ status: statusFilter || undefined, limit: 50 })
        .then((r) => r.data),
  });

  const { data: invoiceItemsData } = useQuery({
    queryKey: ["invoice-items", expandedInvoiceId],
    queryFn: () =>
      billingRepository.listItems(expandedInvoiceId!).then((r) => r.data),
    enabled: !!expandedInvoiceId,
  });

  const { data: invoicePaymentsData } = useQuery({
    queryKey: ["invoice-payments", expandedInvoiceId],
    queryFn: () =>
      billingRepository.listPayments(expandedInvoiceId!).then((r) => r.data),
    enabled: !!expandedInvoiceId,
  });

  // --- Add payment mutation ---
  const addPaymentMutation = useMutation({
    mutationFn: ({
      invoiceId,
      data,
    }: {
      invoiceId: string;
      data: Record<string, unknown>;
    }) => billingRepository.addPayment(invoiceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({
        queryKey: ["invoice-payments", expandedInvoiceId],
      });
      queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      setPaymentDialogInvoiceId(null);
      setPaymentForm({ amount: "", method: "cash", reference: "" });
    },
  });

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentDialogInvoiceId) return;
    const amountCents = Math.round(parseFloat(paymentForm.amount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) return;
    addPaymentMutation.mutate({
      invoiceId: paymentDialogInvoiceId,
      data: {
        amount_cents: amountCents,
        method: paymentForm.method,
        reference: paymentForm.reference || undefined,
      },
    });
  };

  const invoices: Record<string, unknown>[] = invoicesData?.items ?? [];
  const lineItems: Record<string, unknown>[] =
    invoiceItemsData?.items ??
    (Array.isArray(invoiceItemsData) ? invoiceItemsData : []);
  const payments: Record<string, unknown>[] =
    invoicePaymentsData?.items ??
    (Array.isArray(invoicePaymentsData) ? invoicePaymentsData : []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
        <Link href="/billing/invoices/new">
          <Button>New Invoice</Button>
        </Link>
      </div>

      {/* Revenue Summary */}
      {summaryLoading ? (
        <LoadingSkeleton lines={2} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Revenue"
            value={formatCurrency(summaryData?.total_revenue_cents ?? 0)}
          />
          <StatCard
            title="Outstanding"
            value={formatCurrency(summaryData?.outstanding_cents ?? 0)}
          />
          <StatCard
            title="Paid Today"
            value={formatCurrency(summaryData?.paid_today_cents ?? 0)}
          />
          <StatCard
            title="Invoices This Month"
            value={summaryData?.invoices_this_month ?? 0}
          />
        </div>
      )}

      {/* Invoice Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-48"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="partial">Partial</option>
        </Select>
      </div>

      {/* Invoices table */}
      {invoicesLoading ? (
        <LoadingSkeleton lines={8} />
      ) : invoices.length === 0 ? (
        <EmptyState
          title="No invoices found"
          description="Create a new invoice or adjust the status filter."
          action={
            <Link href="/billing/invoices/new">
              <Button>New Invoice</Button>
            </Link>
          }
        />
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const invId = (inv.invoice_id ?? inv.id) as string;
                const isExpanded = expandedInvoiceId === invId;
                const status = (inv.status as string) || "draft";

                return (
                  <TableRow key={invId}>
                    <TableCell colSpan={7} className="p-0">
                      {/* Invoice row */}
                      <div className="grid grid-cols-7 items-center">
                        <button
                          type="button"
                          className="p-4 text-left font-medium text-blue-600 hover:underline"
                          onClick={() =>
                            setExpandedInvoiceId(isExpanded ? null : invId)
                          }
                        >
                          {(inv.invoice_number as string) ??
                            invId.slice(0, 8)}
                        </button>
                        <span className="p-4">
                          {(inv.patient_name as string) ||
                            (inv.patient_id as string) ||
                            "-"}
                        </span>
                        <span className="p-4">
                          {formatCurrency(
                            (inv.total_cents ??
                              inv.total_amount_cents ??
                              0) as number
                          )}
                        </span>
                        <span className="p-4">
                          {formatCurrency(
                            (inv.paid_cents ??
                              inv.paid_amount_cents ??
                              0) as number
                          )}
                        </span>
                        <span className="p-4">
                          <StatusBadge status={status} />
                        </span>
                        <span className="p-4">
                          {formatDate(
                            (inv.issued_at ?? inv.created_at) as string
                          )}
                        </span>
                        <span className="p-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setExpandedInvoiceId(isExpanded ? null : invId)
                            }
                          >
                            {isExpanded ? "Hide" : "Details"}
                          </Button>
                        </span>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="space-y-4 border-t bg-slate-50 px-6 py-4">
                          {/* Line Items */}
                          <div>
                            <h4 className="mb-2 text-sm font-semibold text-slate-700">
                              Line Items
                            </h4>
                            {lineItems.length === 0 ? (
                              <p className="text-sm text-slate-500">
                                No line items.
                              </p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b text-left text-slate-500">
                                    <th className="pb-2 font-medium">
                                      Description
                                    </th>
                                    <th className="pb-2 font-medium">
                                      Category
                                    </th>
                                    <th className="pb-2 font-medium">Qty</th>
                                    <th className="pb-2 font-medium">
                                      Unit Price
                                    </th>
                                    <th className="pb-2 font-medium">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lineItems.map(
                                    (
                                      item: Record<string, unknown>,
                                      idx: number
                                    ) => (
                                      <tr
                                        key={
                                          (item.item_id as string) ??
                                          String(idx)
                                        }
                                        className="border-b last:border-0"
                                      >
                                        <td className="py-2">
                                          {(item.description as string) || "-"}
                                        </td>
                                        <td className="py-2 capitalize">
                                          {(item.category as string) || "-"}
                                        </td>
                                        <td className="py-2">
                                          {String(item.quantity ?? "-")}
                                        </td>
                                        <td className="py-2">
                                          {item.unit_price_cents != null
                                            ? formatCurrency(
                                                item.unit_price_cents as number
                                              )
                                            : "-"}
                                        </td>
                                        <td className="py-2">
                                          {item.total_cents != null
                                            ? formatCurrency(
                                                item.total_cents as number
                                              )
                                            : item.unit_price_cents != null &&
                                                item.quantity != null
                                              ? formatCurrency(
                                                  (item.unit_price_cents as number) *
                                                    (item.quantity as number)
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

                          {/* Payments */}
                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <h4 className="text-sm font-semibold text-slate-700">
                                Payments
                              </h4>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setPaymentDialogInvoiceId(invId)
                                }
                              >
                                Add Payment
                              </Button>
                            </div>
                            {payments.length === 0 ? (
                              <p className="text-sm text-slate-500">
                                No payments recorded.
                              </p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b text-left text-slate-500">
                                    <th className="pb-2 font-medium">
                                      Amount
                                    </th>
                                    <th className="pb-2 font-medium">
                                      Method
                                    </th>
                                    <th className="pb-2 font-medium">
                                      Reference
                                    </th>
                                    <th className="pb-2 font-medium">Date</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {payments.map(
                                    (
                                      pmt: Record<string, unknown>,
                                      idx: number
                                    ) => (
                                      <tr
                                        key={
                                          (pmt.payment_id as string) ??
                                          String(idx)
                                        }
                                        className="border-b last:border-0"
                                      >
                                        <td className="py-2">
                                          {pmt.amount_cents != null
                                            ? formatCurrency(
                                                pmt.amount_cents as number
                                              )
                                            : "-"}
                                        </td>
                                        <td className="py-2 capitalize">
                                          {((pmt.method as string) || "-").replace(
                                            "_",
                                            " "
                                          )}
                                        </td>
                                        <td className="py-2">
                                          {(pmt.reference as string) || "-"}
                                        </td>
                                        <td className="py-2">
                                          {formatDate(
                                            pmt.created_at as string
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            )}
                          </div>
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

      {/* Add Payment Dialog */}
      <Dialog
        open={!!paymentDialogInvoiceId}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentDialogInvoiceId(null);
            setPaymentForm({ amount: "", method: "cash", reference: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Payment</DialogTitle>
            <DialogDescription>
              Record a payment for this invoice.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddPayment} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Amount
              </label>
              <Input
                type="number"
                required
                min={0.01}
                step={0.01}
                value={paymentForm.amount}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, amount: e.target.value })
                }
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Payment Method
              </label>
              <Select
                value={paymentForm.method}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, method: e.target.value })
                }
              >
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="insurance">Insurance</option>
                <option value="bank_transfer">Bank Transfer</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Reference (optional)
              </label>
              <Input
                value={paymentForm.reference}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, reference: e.target.value })
                }
                placeholder="Transaction reference"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPaymentDialogInvoiceId(null);
                  setPaymentForm({ amount: "", method: "cash", reference: "" });
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addPaymentMutation.isPending}>
                {addPaymentMutation.isPending
                  ? "Processing..."
                  : "Add Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
