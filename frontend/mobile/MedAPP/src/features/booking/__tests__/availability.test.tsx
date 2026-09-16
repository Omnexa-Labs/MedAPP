import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => ({ owner: "patient-1", revision: 1, isCurrent: () => true }),
}));
jest.mock("../api", () => ({ bookingApi: { listSlots: jest.fn() } }));
import { bookingApi } from "../api";
import { displaySlot, useSlots } from "../hooks/use-booking-availability";
it("distinguishes repeated clocks and preserves their two instants", () => {
  const first = displaySlot({
    doctorId: "d1",
    startsAtIso: "2026-11-01T05:00:00Z",
    endsAtIso: "2026-11-01T05:30:00Z",
    timezone: "America/New_York",
  });
  const second = displaySlot({
    doctorId: "d1",
    startsAtIso: "2026-11-01T06:00:00Z",
    endsAtIso: "2026-11-01T06:30:00Z",
    timezone: "America/New_York",
  });
  expect(first.time).toContain("01:00 AM");
  expect(second.time).toContain("01:00 AM");
  expect(first.time).not.toBe(second.time);
  expect(first.startsAtIso).not.toBe(second.startsAtIso);
});
it("loads from the booked-slot-aware endpoint and propagates failure", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  (bookingApi.listSlots as jest.Mock).mockResolvedValue([]);
  const view = renderHook(() => useSlots("d1", "2030-05-13"), { wrapper });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  expect(bookingApi.listSlots).toHaveBeenCalledWith(
    "d1",
    "2030-05-13",
    expect.objectContaining({ signal: expect.any(Object), isSessionCurrent: expect.any(Function) }),
  );
  expect(view.result.current.slots).toEqual([]);
  (bookingApi.listSlots as jest.Mock).mockRejectedValue(new Error("offline"));
  view.result.current.retry();
  await waitFor(() => expect(view.result.current.isError).toBe(true));
  expect(view.result.current.slots).toEqual([]);
  view.unmount();
  queryClient.clear();
});
