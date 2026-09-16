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
import { TeamAccess } from "@/components/staff/team-access";
import { useAuthStore } from "@/lib/stores/auth.store";

export default function StaffPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0),
    [tab, setTab] = useState("records");
  const admin = useAuthStore((s) => s.user?.hmsRole === "hospital_admin");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["staff", search, page],
    queryFn: ({ signal }) =>
      staffRepository
        .list(
          { search: search || undefined, limit: 50, offset: page * 50 },
          signal,
        )
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
        {admin && (
          <Link href="/staff/new">
            <Button>Invite staff</Button>
          </Link>
        )}
      </div>

      {admin && (
        <div className="flex gap-3" aria-label="Staff views">
          <Button
            variant={tab === "records" ? "default" : "outline"}
            onClick={() => setTab("records")}
          >
            Staff records
          </Button>
          <Button
            variant={tab === "access" ? "default" : "outline"}
            onClick={() => setTab("access")}
          >
            Access and invitations
          </Button>
        </div>
      )}
      {tab === "access" && admin ? (
        <TeamAccess />
      ) : (
        <>
          {/* Search */}
          <div className="max-w-md">
            <Input
              type="text"
              placeholder="Search by name, employee ID..."
              value={search}
              aria-label="Search staff"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>

          {/* Table */}
          {isLoading ? (
            <LoadingSkeleton lines={8} />
          ) : isError ? (
            <p role="alert">
              Staff records could not be loaded.{" "}
              <button className="underline" onClick={() => void refetch()}>
                Retry staff records
              </button>
            </p>
          ) : staffItems.length === 0 ? (
            <EmptyState
              title="No staff members found"
              description={
                search
                  ? "Try adjusting your search terms."
                  : "Staff records appear after invited members join this hospital."
              }
              action={
                !search && admin ? (
                  <Link href="/staff/new">
                    <Button>Invite staff</Button>
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
                      <TableCell>
                        {(staff.specialty as string) || "-"}
                      </TableCell>
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
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={!page || isLoading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous records
            </Button>
            <span className="text-sm">Page {page + 1}</span>
            <Button
              variant="outline"
              disabled={!data?.has_more || isLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next records
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
