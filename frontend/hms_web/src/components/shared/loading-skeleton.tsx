"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-200",
        className
      )}
      {...props}
    />
  );
}

interface LoadingSkeletonProps {
  /** Number of skeleton rows to render */
  lines?: number;
  className?: string;
}

export function LoadingSkeleton({
  lines = 3,
  className,
}: LoadingSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === 0 && "w-3/4",
            i !== 0 && i === lines - 1 && "w-1/2",
            i !== 0 && i !== lines - 1 && "w-full"
          )}
        />
      ))}
    </div>
  );
}
