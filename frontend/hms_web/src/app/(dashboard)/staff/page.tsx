"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { staffRepository } from "@/lib/repositories/staff.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";

export default function StaffPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["staff", search],
    queryFn: () =>
      staffRepository
        .list({ search: search || undefined, limit: 50 })
        .then((r) => r.data),
  });

  const staffItems: Record<string, unknown>[] = Array.isArray(data?.items)
    ? data.items
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Staff</h1>
        <Link href="/staff/new">
          <Button>Add Staff</Button>
        </Link>
      </div>

      {/* Search */}
      <div className="max-w-md">
        <Input
          type="text"
          placeholder="Search by name, employee ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingSkeleton lines={8} />
      ) : staffItems.length === 0 ? (
        <EmptyState
          title="No staff members found"
          description={
            search
              ? "Try adjusting your search terms."
              : "Get started by adding your first staff member."
          }
          action={
            !search ? (
              <Link href="/staff/new">
                <Button>Add Staff</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Specialty</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffItems.map((staff) => (
                <TableRow key={staff.staff_id as string}>
                  <TableCell className="font-medium">
                    {(staff.employee_id as string) || "-"}
                  </TableCell>
                  <TableCell>
                    {staff.first_name as string} {staff.last_name as string}
                  </TableCell>
                  <TableCell>{(staff.title as string) || "-"}</TableCell>
                  <TableCell>{(staff.specialty as string) || "-"}</TableCell>
                  <TableCell>
                    <Link
                      href={`/staff/${staff.staff_id as string}`}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      View
                    </Link>
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
