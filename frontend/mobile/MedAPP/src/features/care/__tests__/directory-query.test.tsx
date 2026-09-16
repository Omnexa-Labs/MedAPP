import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const mockList = jest.fn();
let mockOwner = "p1";
const mockCurrent = () => true;
jest.mock("../api", () => ({
  careApi: { listDirectoryPage: (...args: unknown[]) => mockList(...args) },
}));
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => ({ owner: mockOwner, revision: 1, isCurrent: mockCurrent }),
}));
import { useDirectory, type DirectoryChip } from "../hooks/use-directory";
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const page = (category: string, id = category, nextOffset: number | null = null) => ({
  entries: [{ category, kind: "person", id, name: id }],
  total: 2,
  nextOffset,
});
beforeEach(() => {
  mockOwner = "p1";
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mockList.mockReset().mockImplementation(async (category) => page(category));
});
afterEach(() => client.clear());
it("All requests and returns every category including pharmacies and pharmacists", async () => {
  const { result } = renderHook(() => useDirectory("all", ""), { wrapper });
  await waitFor(() => expect(result.current.entries).toHaveLength(5));
  expect(new Set(mockList.mock.calls.map(([category]) => category))).toEqual(
    new Set(["doctors", "nurses", "hospitals", "pharmacies", "pharmacists"]),
  );
});
it("normalizes search and forwards the specialty and request cancellation scope", async () => {
  const { result } = renderHook(() => useDirectory("doctors", " Ama ", " Cardiology "), {
    wrapper,
  });
  await waitFor(() => expect(result.current.entries).toHaveLength(1));
  expect(mockList).toHaveBeenCalledTimes(1);
  expect(mockList).toHaveBeenCalledWith(
    "doctors",
    { q: "ama", specialty: "cardiology", offset: 0, limit: 50 },
    expect.objectContaining({ signal: expect.anything(), isSessionCurrent: mockCurrent }),
  );
});
it("loads another pharmacy page without refetching other categories and deduplicates changed rows", async () => {
  mockList.mockImplementation(async (category, params) =>
    category === "pharmacies"
      ? params.offset === 0
        ? page(category, "first", 1)
        : {
            entries: [...page(category, "first").entries, ...page(category, "second").entries],
            total: 2,
            nextOffset: null,
          }
      : page(category),
  );
  const { result } = renderHook(() => useDirectory("all", ""), { wrapper });
  await waitFor(() => expect(result.current.entries).toHaveLength(5));
  await act(async () => {
    await result.current.loadMore();
  });
  await waitFor(() => expect(result.current.entries).toHaveLength(6));
  expect(mockList).toHaveBeenCalledTimes(6);
  expect(result.current.hasMore).toBe(false);
});
it("keeps successful categories and names the source that failed, then retries it", async () => {
  mockList.mockImplementation(async (category) => {
    if (category === "pharmacies") throw new Error("offline");
    return page(category);
  });
  const { result } = renderHook(() => useDirectory("all", ""), { wrapper });
  await waitFor(() => expect(result.current.failedSources).toEqual(["Pharmacies"]));
  expect(result.current.entries).toHaveLength(4);
  mockList.mockImplementation(async (category) => page(category));
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(result.current.entries).toHaveLength(5));
  expect(result.current.error).toBeNull();
});
it("retries a failed next page without discarding the first", async () => {
  mockList
    .mockResolvedValueOnce(page("pharmacies", "first", 1))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(page("pharmacies", "second"));
  const { result } = renderHook(() => useDirectory("pharmacies", ""), { wrapper });
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  await act(async () => {
    await result.current.loadMore();
  });
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.entries[0].id).toBe("first");
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(result.current.entries).toHaveLength(2));
  expect(mockList.mock.calls[2][1].offset).toBe(1);
});
it("cancels an old query when the selected category changes", async () => {
  mockList.mockImplementation((category) =>
    category === "doctors" ? new Promise(() => {}) : Promise.resolve(page(category)),
  );
  const { result, rerender } = renderHook(
    ({ chip }: { chip: DirectoryChip }) => useDirectory(chip, ""),
    { wrapper, initialProps: { chip: "doctors" as DirectoryChip } },
  );
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
  const signal = mockList.mock.calls[0][2].signal;
  rerender({ chip: "nurses" });
  await waitFor(() => expect(result.current.entries[0]?.category).toBe("nurses"));
  expect(signal.aborted).toBe(true);
});
it("uses a fresh cache scope when the active account changes", async () => {
  const { result, rerender } = renderHook(() => useDirectory("doctors", ""), { wrapper });
  await waitFor(() => expect(result.current.entries).toHaveLength(1));
  mockOwner = "p2";
  mockList.mockReturnValue(new Promise(() => {}));
  rerender({});
  expect(result.current.entries).toHaveLength(0);
});
