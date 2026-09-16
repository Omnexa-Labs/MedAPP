import { useInfiniteQuery } from "@tanstack/react-query";
import { careApi } from "@/features/care/api";
import type { DirectoryCategory, DirectoryEntry } from "@/features/care/types";
import { useSessionScope } from "@/hooks/use-session-scope";

export type DirectoryChip = "all" | DirectoryCategory;
const CATEGORIES: DirectoryCategory[] = [
  "doctors",
  "nurses",
  "hospitals",
  "pharmacies",
  "pharmacists",
];
const LABELS = {
  doctors: "Doctors",
  nurses: "Nurses",
  hospitals: "Hospitals",
  pharmacies: "Pharmacies",
  pharmacists: "Pharmacists",
};

function useSource(
  category: DirectoryCategory,
  chip: DirectoryChip,
  normalQ: string,
  normalSpecialty: string,
  scope: ReturnType<typeof useSessionScope>,
) {
  return useInfiniteQuery({
    queryKey: [
      "care",
      "directory",
      scope.owner,
      scope.revision,
      chip,
      category,
      normalQ,
      normalSpecialty,
    ],
    enabled: !!scope.owner && (chip === "all" || chip === category),
    initialPageParam: 0,
    gcTime: 0,
    queryFn: ({ signal, pageParam }) =>
      careApi.listDirectoryPage(
        category,
        {
          q: normalQ || undefined,
          specialty: normalSpecialty || undefined,
          offset: pageParam,
          limit: 50,
        },
        { signal, isSessionCurrent: scope.isCurrent },
      ),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  });
}

export function useDirectory(chip: DirectoryChip, q: string, specialty = "") {
  const scope = useSessionScope();
  const normalQ = q.trim().toLowerCase();
  const normalSpecialty = specialty.trim().toLowerCase();
  // Stable hook order; only the selected sources run. Each paginated source
  // advances independently so a pharmacy outage cannot drop a doctor's results.
  const queries = [
    useSource("doctors", chip, normalQ, normalSpecialty, scope),
    useSource("nurses", chip, normalQ, normalSpecialty, scope),
    useSource("hospitals", chip, normalQ, normalSpecialty, scope),
    useSource("pharmacies", chip, normalQ, normalSpecialty, scope),
    useSource("pharmacists", chip, normalQ, normalSpecialty, scope),
  ];
  const active = queries.filter((_, i) => chip === "all" || chip === CATEGORIES[i]);
  const failedSources = CATEGORIES.filter(
    (category, i) => (chip === "all" || chip === category) && queries[i].isError,
  ).map((category) => LABELS[category]);
  const entries = active.flatMap(
    (query) => query.data?.pages.flatMap((page) => page.entries) ?? [],
  );
  // Offset pagination can repeat a row when the directory changes between pages.
  const unique = new Map(entries.map((entry) => [`${entry.category}:${entry.id}`, entry]));
  return {
    entries: [...unique.values()] as DirectoryEntry[],
    isLoading: active.some((query) => query.isLoading),
    isFetching: active.some((query) => query.isFetching),
    error: active.find((query) => query.isError)?.error ?? null,
    failedSources,
    hasMore: active.some((query) => query.hasNextPage),
    isLoadingMore: active.some((query) => query.isFetchingNextPage),
    loadMore: () =>
      Promise.allSettled(
        active
          .filter((query) => query.hasNextPage && !query.isFetching)
          .map((query) => query.fetchNextPage()),
      ),
    refetch: () =>
      Promise.allSettled(
        active.map((query) =>
          query.isFetchNextPageError ? query.fetchNextPage() : query.refetch(),
        ),
      ),
  };
}
