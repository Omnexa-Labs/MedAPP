"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { appointmentRepository } from "@/lib/repositories/appointment.repository";
import { formatDateTime } from "@/lib/utils/format";
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
import { StatusBadge } from "@/components/shared/status-badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export default function AppointmentsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["appointments", statusFilter, dateFilter],
    queryFn: () =>
      appointmentRepository
        .list({
          status: statusFilter || undefined,
          date: dateFilter || undefined,
          limit: 50,
        })
        .then((r) => r.data),
  });

  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
      ? data
      : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
        <Link href="/appointments/new">
          <Button>Book Appointment</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Status
          </label>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-48"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Date
          </label>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-48"
          />
        </div>
        {(statusFilter || dateFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("");
              setDateFilter("");
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-lg border bg-white p-6">
          <LoadingSkeleton lines={8} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No appointments found"
          description={
            statusFilter || dateFilter
              ? "Try adjusting your filters."
              : "Book your first appointment to get started."
          }
          action={
            !statusFilter && !dateFilter ? (
              <Link href="/appointments/new">
                <Button>Book Appointment</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date/Time</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((appt: Record<string, unknown>) => (
                <TableRow key={appt.appointment_id as string}>
                  <TableCell>
                    <div className="font-medium">
                      {formatDateTime(appt.scheduled_date as string)}
                    </div>
                    {appt.scheduled_start ? (
                      <div className="text-xs text-slate-500">
                        {String(appt.scheduled_start)}
                        {appt.scheduled_end
                          ? ` - ${String(appt.scheduled_end)}`
                          : ""}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {(appt.patient_name as string) ||
                      (appt.patient_id as string)?.slice(0, 8) ||
                      "-"}
                  </TableCell>
                  <TableCell>
                    {(appt.doctor_name as string) ||
                      (appt.doctor_staff_id as string)?.slice(0, 8) ||
                      "-"}
                  </TableCell>
                  <TableCell>
                    {(appt.department_name as string) ||
                      (appt.department_id as string)?.slice(0, 8) ||
                      "-"}
                  </TableCell>
                  <TableCell>
                    {appt.status ? (
                      <StatusBadge status={appt.status as string} />
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {appt.appointment_type
                      ? (appt.appointment_type as string)
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
