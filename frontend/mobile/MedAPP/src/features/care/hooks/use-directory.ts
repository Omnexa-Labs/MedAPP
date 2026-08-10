// useDirectory — one hook, switches on chip value.
//
// Why a single hook (not one per chip): the screen wants a single
// `{ entries, isLoading, error, refetch }` regardless of which chip is
// active. Centralising the chip→query mapping here keeps the screen
// presentation-only.
//
// Cache strategy:
//   - Query key shape: ["care", chip, q]. Distinct first segment so a
//     blanket invalidation can wipe the whole surface; second segment
//     makes inter-chip caches non-overlapping.
//   - staleTime / retry defaults come from the global QueryClient
//     (60s, no retry on 4xx). That's the right tradeoff for a
//     directory: not stale-noisy, but not chasing 403s.
//   - The "all" chip fans out to doctors + nurses + hospitals via
//     `useQueries`. Pharmacies and pharmacists are excluded from "all"
//     for now to keep the firehose readable; they appear when their
//     chip is active. We can reconsider if patient research says they
//     expect everything in one mixed list.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// Expo-specific code — none here.

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { careApi } from "@/features/care/api";
import type { DirectoryEntry } from "@/features/care/types";

export type DirectoryChip =
  | "all"
  | "doctors"
  | "nurses"
  | "hospitals"
  | "pharmacies"
  | "pharmacists";

interface UseDirectoryResult {
  entries: DirectoryEntry[];
  isLoading: boolean;
  error: unknown;
  /**
   * Returns the promise of the requests it re-issues.
   *
   * It used to return `void` and drop them on the floor, which meant the caller
   * could not tell a retry in flight from a retry that never started — so
   * FindCareScreen's "Try again" had no pending state at all. `ErrorPanel`'s
   * `retry` now requires the promise for exactly that reason, and a void return
   * no longer type-checks there.
   */
  refetch: () => Promise<unknown>;
}

/**
 * Trim + lowercase the query string so cache keys collide on
 * "Cardio" vs "cardio " — fewer distinct keys, more cache hits.
 * The backend ILIKE pattern is case-insensitive too, so we lose
 * nothing.
 */
function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function useDirectory(chip: DirectoryChip, q: string): UseDirectoryResult {
  const normalQ = normalizeQuery(q);

  // Fan-out for "all". useQueries gives us per-source loading state
  // and lets one source's 5xx not block the rest. The component
  // sees a merged list once anything resolves.
  //
  // We always declare the same three slots and toggle `enabled` so
  // the tuple length is stable — TanStack Query's `useQueries` infers
  // a fixed-length tuple from the array literal, and changing the
  // length between renders trips that inference.
  const fanOutEnabled = chip === "all";
  const allQueries = useQueries({
    queries: [
      {
        queryKey: ["care", "doctors", normalQ] as const,
        queryFn: () => careApi.listDoctors({ q: normalQ || undefined }),
        enabled: fanOutEnabled,
      },
      {
        queryKey: ["care", "nurses", normalQ] as const,
        queryFn: () => careApi.listNurses({ q: normalQ || undefined }),
        enabled: fanOutEnabled,
      },
      {
        queryKey: ["care", "hospitals", normalQ] as const,
        queryFn: () => careApi.listHospitals({ q: normalQ || undefined }),
        enabled: fanOutEnabled,
      },
    ],
  });

  // Single-chip path. The `enabled` flag keeps these idle on the "all"
  // chip so we don't fire redundant queries.
  const singleQuery = useQuery({
    queryKey: ["care", chip, normalQ] as const,
    queryFn: async () => {
      switch (chip) {
        case "doctors":
          return careApi.listDoctors({ q: normalQ || undefined });
        case "nurses":
          return careApi.listNurses({ q: normalQ || undefined });
        case "hospitals":
          return careApi.listHospitals({ q: normalQ || undefined });
        case "pharmacies":
          // First page only. Pagination UI is a follow-up; for now
          // 50 covers typical city density without an infinite-list
          // skeleton.
          return careApi.listPharmacies({ q: normalQ || undefined, limit: 50 });
        case "pharmacists":
          return careApi.listPharmacists({ q: normalQ || undefined, limit: 50 });
        default:
          // Exhaustiveness guard. If TS lets this through, the chip
          // type widened — fix it there, not here.
          return [] as DirectoryEntry[];
      }
    },
    enabled: chip !== "all",
  });

  return useMemo<UseDirectoryResult>(() => {
    if (chip === "all") {
      const entries = allQueries
        .flatMap((q) => (q.data ?? []) as DirectoryEntry[]);
      const isLoading = allQueries.some((q) => q.isLoading);
      // Surface only the first error; the screen renders one error
      // panel regardless. If one chip's source fails but others
      // succeed, we keep showing what loaded — better than blank.
      const error = allQueries.find((q) => q.isError)?.error ?? null;
      // `all` fans out over every source, so the retry is only settled when
      // the last one is. `allSettled`, not `all`: one failing source must not
      // leave the panel stuck on "Retrying…" forever.
      const refetch = () => Promise.allSettled(allQueries.map((q) => q.refetch()));
      return { entries, isLoading, error, refetch };
    }
    return {
      entries: (singleQuery.data ?? []) as DirectoryEntry[],
      isLoading: singleQuery.isLoading,
      error: singleQuery.error ?? null,
      refetch: () => singleQuery.refetch(),
    };
  }, [chip, allQueries, singleQuery]);
}
