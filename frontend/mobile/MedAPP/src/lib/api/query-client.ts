import { QueryClient } from "@tanstack/react-query";

// Single QueryClient for the whole app. Instantiated at module scope so Fast
// Refresh doesn't clobber the cache. Imported once by src/app/_layout.tsx.
//
// Defaults rationale:
// - staleTime 60s: prevents duplicate refetches when users tab between screens.
// - retry: only retry on network errors; 4xx responses are deterministic and
//   should not be retried. The retry callback returns false for any thrown
//   ApiError that carries an HTTP status.
// - refetchOnWindowFocus: false on mobile (we use app-state foreground refresh
//   from the hook layer instead — see hooks/use-app-state.ts when added).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        // ApiError shape lands here once lib/api/client.ts ships. For now, any
        // non-Error or any error without a numeric `.status` is treated as a
        // network failure and retried.
        const status = (error as { status?: number })?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return true;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});
