"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentRepository } from "@/lib/repositories/appointment.repository";
import { staffRepository } from "@/lib/repositories/staff.repository";
import { timeAgo } from "@/lib/utils/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { StatCard } from "@/components/shared/stat-card";

export default function QueuePage() {
  const queryClient = useQueryClient();
  const [departmentFilter, setDepartmentFilter] = useState("");

  // Fetch queue entries with auto-refresh every 10 seconds
  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ["queue", departmentFilter],
    queryFn: () =>
      appointmentRepository
        .listQueue({
          department_id: departmentFilter || undefined,
        })
        .then((r) => r.data),
    refetchInterval: 10000,
  });

  // Fetch queue stats with auto-refresh
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["queue-stats"],
    queryFn: () => appointmentRepository.getQueueStats().then((r) => r.data),
    refetchInterval: 10000,
  });

  // Fetch departments for the filter
  const { data: departmentsData } = useQuery({
    queryKey: ["departments"],
    queryFn: () =>
      staffRepository.listDepartments({ limit: 100 }).then((r) => r.data),
  });

  const departments = Array.isArray(departmentsData?.items)
    ? departmentsData.items
    : Array.isArray(departmentsData)
      ? departmentsData
      : [];

  const queueItems = Array.isArray(queueData?.items)
    ? queueData.items
    : Array.isArray(queueData)
      ? queueData
      : [];

  // Split queue entries by status
  const waitingEntries = queueItems
    .filter((e: Record<string, unknown>) => e.status === "waiting")
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      // Sort by priority first (higher priority first), then by joined_at
      const priorityDiff =
        ((b.priority as number) || 0) - ((a.priority as number) || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return (
        new Date((a.joined_at as string) || 0).getTime() -
        new Date((b.joined_at as string) || 0).getTime()
      );
    });

  const servingEntries = queueItems.filter(
    (e: Record<string, unknown>) => e.status === "serving"
  );

  const completedEntries = queueItems
    .filter((e: Record<string, unknown>) => e.status === "served")
    .slice(0, 10);

  // Mutations
  const callNextMutation = useMutation({
    mutationFn: (deptId?: string) => appointmentRepository.callNext(deptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (ticketId: string) =>
      appointmentRepository.completeQueue(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
    },
  });

  const skipMutation = useMutation({
    mutationFn: (ticketId: string) => appointmentRepository.skipQueue(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Live Queue Board</h1>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          Auto-refreshing
        </div>
      </div>

      {/* Department Filter */}
      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Department
          </label>
          <Select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-56"
          >
            <option value="">All Departments</option>
            {departments.map((dept: Record<string, unknown>) => (
              <option
                key={dept.department_id as string}
                value={dept.department_id as string}
              >
                {dept.name as string}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Stats Summary */}
      {statsLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6">
              <LoadingSkeleton lines={2} />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            title="Waiting"
            value={statsData?.waiting_count ?? waitingEntries.length}
            description="Patients in queue"
          />
          <StatCard
            title="Being Served"
            value={statsData?.serving_count ?? servingEntries.length}
            description="Currently with staff"
          />
          <StatCard
            title="Avg Wait Time"
            value={
              statsData?.avg_wait_time
                ? `${statsData.avg_wait_time} min`
                : "--"
            }
            description="Average wait today"
          />
        </div>
      )}

      {/* Queue Columns */}
      {queueLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6">
              <LoadingSkeleton lines={6} />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Waiting Column */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Waiting</CardTitle>
                <StatusBadge status="waiting" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {waitingEntries.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">
                  No patients waiting
                </p>
              ) : (
                waitingEntries.map((entry: Record<string, unknown>) => (
                  <div
                    key={
                      (entry.ticket_id as string) ||
                      (entry.id as string)
                    }
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                          {(entry.ticket_number as string) ||
                            (entry.ticket_id as string)?.slice(0, 6) ||
                            "-"}
                        </span>
                        {entry.priority && Number(entry.priority) > 0 ? (
                          <StatusBadge status="emergency" />
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-slate-900">
                        {(entry.patient_name as string) || "Patient"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(entry.department_name as string) || "-"}
                      </p>
                      {entry.joined_at ? (
                        <p className="text-xs text-slate-400">
                          Joined {timeAgo(String(entry.joined_at))}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        callNextMutation.mutate(
                          (entry.department_id as string) || undefined
                        )
                      }
                      disabled={callNextMutation.isPending}
                    >
                      Call
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Being Served Column */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Being Served</CardTitle>
                <StatusBadge status="serving" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {servingEntries.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">
                  No one being served
                </p>
              ) : (
                servingEntries.map((entry: Record<string, unknown>) => {
                  const ticketId =
                    (entry.ticket_id as string) || (entry.id as string);
                  return (
                    <div
                      key={ticketId}
                      className="rounded-lg border border-blue-200 bg-blue-50/50 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                          {(entry.ticket_number as string) ||
                            ticketId?.slice(0, 6) ||
                            "-"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {(entry.patient_name as string) || "Patient"}
                      </p>
                      <p className="text-xs text-slate-600">
                        {(entry.department_name as string) || "-"}
                      </p>
                      {entry.assigned_staff_name ? (
                        <p className="text-xs text-slate-500">
                          Staff: {String(entry.assigned_staff_name)}
                        </p>
                      ) : null}
                      {entry.called_at ? (
                        <p className="text-xs text-slate-400">
                          Called {timeAgo(String(entry.called_at))}
                        </p>
                      ) : null}
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => completeMutation.mutate(ticketId)}
                          disabled={completeMutation.isPending}
                        >
                          Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => skipMutation.mutate(ticketId)}
                          disabled={skipMutation.isPending}
                        >
                          Skip
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Completed Column */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Completed</CardTitle>
                <StatusBadge status="served" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {completedEntries.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">
                  No completed entries yet
                </p>
              ) : (
                completedEntries.map((entry: Record<string, unknown>) => (
                  <div
                    key={
                      (entry.ticket_id as string) ||
                      (entry.id as string)
                    }
                    className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                  >
                    <span className="rounded bg-green-600 px-2 py-0.5 text-xs font-bold text-white">
                      {(entry.ticket_number as string) ||
                        (entry.ticket_id as string)?.slice(0, 6) ||
                        "-"}
                    </span>
                    <p className="truncate text-sm text-slate-700">
                      {(entry.patient_name as string) || "Patient"}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
