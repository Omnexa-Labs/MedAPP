"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { billingRepository } from "@/lib/repositories/billing.repository";
import { patientRepository } from "@/lib/repositories/patient.repository";
import { formatCurrency } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface LineItem {
  description: string;
  category: string;
  quantity: number;
  unit_price_cents: number;
}

interface InvoiceFormData {
  patient_id: string;
  visit_id: string;
  currency: string;
  due_at: string;
  items: LineItem[];
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState("");

  // --- Patient list query ---
  const { data: patientsData } = useQuery({
    queryKey: ["patients-select", patientSearch],
    queryFn: () =>
      patientRepository
        .list({ search: patientSearch || undefined, limit: 50 })
        .then((r) => r.data),
  });

  const patients: Record<string, unknown>[] = patientsData?.items ?? [];

  // --- Form ---
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<InvoiceFormData>({
    defaultValues: {
      patient_id: "",
      visit_id: "",
      currency: "GHS",
      due_at: "",
      items: [
        {
          description: "",
          category: "consultation",
          quantity: 1,
          unit_price_cents: 0,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const watchedItems = watch("items");
  const watchedCurrency = watch("currency");

  const runningTotal = watchedItems.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unit_price_cents || 0),
    0
  );

  // --- Submit mutation ---
  const createInvoiceMutation = useMutation({
    mutationFn: async (formData: InvoiceFormData) => {
      setSubmitError(null);

      // Step 1: Create the invoice
      const invoiceRes = await billingRepository.createInvoice({
        patient_id: formData.patient_id,
        visit_id: formData.visit_id || undefined,
        currency: formData.currency,
        due_at: formData.due_at || undefined,
      });

      const invoiceId =
        invoiceRes.data?.invoice_id ?? invoiceRes.data?.id;

      if (!invoiceId) {
        throw new Error("Failed to create invoice - no ID returned.");
      }

      // Step 2: Add each line item sequentially
      for (const item of formData.items) {
        if (!item.description.trim()) continue;
        await billingRepository.addItem(invoiceId, {
          description: item.description.trim(),
          category: item.category,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
        });
      }

      return invoiceId;
    },
    onSuccess: () => {
      router.push("/billing");
    },
    onError: (err: Error) => {
      setSubmitError(err.message || "Failed to create invoice.");
    },
  });

  const onSubmit = (data: InvoiceFormData) => {
    createInvoiceMutation.mutate(data);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Create New Invoice
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Fill in the invoice details and add line items below.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Invoice header */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Patient select */}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Patient <span className="text-red-500">*</span>
                </label>
                <Select
                  {...register("patient_id", {
                    required: "Patient is required",
                  })}
                >
                  <option value="">Select a patient...</option>
                  {patients.map((p) => (
                    <option
                      key={p.patient_id as string}
                      value={p.patient_id as string}
                    >
                      {p.first_name as string} {p.last_name as string}
                      {p.mrn ? ` (${p.mrn})` : ""}
                    </option>
                  ))}
                </Select>
                {patients.length >= 50 && (
                  <Input
                    type="text"
                    placeholder="Search patients to load more..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="mt-2"
                  />
                )}
                {errors.patient_id && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.patient_id.message}
                  </p>
                )}
              </div>

              {/* Visit ID */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Visit ID (optional)
                </label>
                <Input
                  {...register("visit_id")}
                  placeholder="Reference a visit"
                />
              </div>

              {/* Currency */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Currency
                </label>
                <Select {...register("currency")}>
                  <option value="GHS">GHS</option>
                  <option value="NGN">NGN</option>
                  <option value="KES">KES</option>
                  <option value="USD">USD</option>
                </Select>
              </div>

              {/* Due date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Due Date
                </label>
                <Input type="date" {...register("due_at")} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Line Items</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    description: "",
                    category: "consultation",
                    quantity: 1,
                    unit_price_cents: 0,
                  })
                }
              >
                Add Line Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {fields.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No line items added yet. Click &quot;Add Line Item&quot; to
                begin.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="w-24">Qty</TableHead>
                      <TableHead className="w-36">
                        Unit Price (cents)
                      </TableHead>
                      <TableHead className="w-28">Subtotal</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => {
                      const qty = watchedItems[index]?.quantity || 0;
                      const price =
                        watchedItems[index]?.unit_price_cents || 0;
                      const subtotal = qty * price;

                      return (
                        <TableRow key={field.id}>
                          <TableCell>
                            <Input
                              {...register(`items.${index}.description`, {
                                required: true,
                              })}
                              placeholder="Item description"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              {...register(`items.${index}.category`)}
                            >
                              <option value="consultation">
                                Consultation
                              </option>
                              <option value="procedure">Procedure</option>
                              <option value="medication">Medication</option>
                              <option value="lab_test">Lab Test</option>
                              <option value="room">Room</option>
                              <option value="other">Other</option>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              {...register(`items.${index}.quantity`, {
                                valueAsNumber: true,
                                min: 1,
                              })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              {...register(
                                `items.${index}.unit_price_cents`,
                                { valueAsNumber: true, min: 0 }
                              )}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(subtotal, watchedCurrency)}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => remove(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-end border-t pt-4">
            <div className="text-right">
              <p className="text-sm text-slate-500">Running Total</p>
              <p className="text-2xl font-bold text-slate-900">
                {formatCurrency(runningTotal, watchedCurrency)}
              </p>
            </div>
          </CardFooter>
        </Card>

        {/* Error display */}
        {submitError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {submitError}
          </div>
        )}

        {/* Submit actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/billing")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createInvoiceMutation.isPending}
          >
            {createInvoiceMutation.isPending
              ? "Creating Invoice..."
              : "Create Invoice"}
          </Button>
        </div>
      </form>
    </div>
  );
}
