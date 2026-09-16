jest.mock("@/lib/api/client", () => ({ client: {} }));
jest.mock("@/features/care/api", () => ({ careApi: {} }));
import { __testables } from "../api";
it("uses elapsed time only to label a booking as past, never completed", () => {
  const row = { status: "booked", ends_at: "2020-01-01T10:00:00Z" } as Parameters<
    typeof __testables.resolveStatus
  >[0];
  expect(__testables.resolveStatus(row, Date.parse("2021-01-01T00:00:00Z"))).toBe("past");
});
it("keeps a cancelled future booking cancelled", () => {
  const row = { status: "cancelled", ends_at: "2035-01-01T10:00:00Z" } as Parameters<
    typeof __testables.resolveStatus
  >[0];
  expect(__testables.resolveStatus(row, Date.parse("2021-01-01T00:00:00Z"))).toBe("cancelled");
});
