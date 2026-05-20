"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const statusColorMap: Record<string, string> = {
  // Appointment statuses
  scheduled: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  "in-progress": "bg-yellow-100 text-yellow-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  "no-show": "bg-slate-100 text-slate-800",
  no_show: "bg-slate-100 text-slate-800",

  // Queue statuses
  waiting: "bg-orange-100 text-orange-800",
  serving: "bg-blue-100 text-blue-800",
  served: "bg-green-100 text-green-800",

  // Invoice / payment statuses
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  partial: "bg-orange-100 text-orange-800",
  refunded: "bg-purple-100 text-purple-800",

  // General
  active: "bg-green-100 text-green-800",
  inactive: "bg-slate-100 text-slate-800",
  draft: "bg-slate-100 text-slate-800",
  archived: "bg-slate-100 text-slate-800",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalised = status.toLowerCase().trim();
  const colors =
    statusColorMap[normalised] ?? "bg-slate-100 text-slate-800";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        colors,
        className
      )}
    >
      {status}
    </span>
  );
}
