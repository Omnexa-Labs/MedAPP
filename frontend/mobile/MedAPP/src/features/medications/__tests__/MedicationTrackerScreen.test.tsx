import { patient, owner, params, dose, tracking, queryClient, tree } from "../testing/fixtures";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { client } from "@/lib/api/client";
import { ApiError } from "@/types/api";
import { MedicationTrackerScreen, trackingSummary } from "../MedicationTrackerScreen";
let qc: ReturnType<typeof queryClient>;
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(client.get)
    .mockReset()
    .mockImplementation(async (url) => ({
      ...tracking,
      day: new URL(url, "https://example.test").searchParams.get("day"),
    }));
  jest.mocked(client.post).mockReset();
  owner(patient);
  params({});
  qc = queryClient();
});
afterEach(() => qc.clear());
it("does not include upcoming slots or turn unreported doses into skipped reports", () => {
  expect(trackingSummary(tracking)).toEqual({ taken: 0, skipped: 0, unreported: 1 });
  expect(
    trackingSummary({
      ...tracking,
      items: [{ ...tracking.items[0], slots: [{ ...tracking.items[0].slots[1] }] }],
    }),
  ).toEqual({ taken: 0, skipped: 0, unreported: 0 });
});
it("saves a dose then displays the authoritative refreshed outcome", async () => {
  render(tree(qc, <MedicationTrackerScreen />));
  await screen.findByText("08:00 · Not reported");
  fireEvent.changeText(screen.getByLabelText("Tracking date (YYYY-MM-DD)"), tracking.day);
  fireEvent.press(screen.getByText("Show day"));
  await waitFor(() =>
    expect(client.get).toHaveBeenLastCalledWith(
      expect.stringContaining("day=2026-09-16"),
      expect.anything(),
    ),
  );
  jest.mocked(client.post).mockResolvedValue(dose);
  jest.mocked(client.get).mockResolvedValue({
    ...tracking,
    items: [
      {
        ...tracking.items[0],
        slots: [
          { ...tracking.items[0].slots[0], state: "taken", dose },
          tracking.items[0].slots[1],
        ],
      },
    ],
  });
  fireEvent.press(await screen.findByText("Mark taken"));
  await screen.findByText("08:00 · Taken");
  expect(screen.queryByText("Mark taken")).toBeNull();
  expect(client.post).toHaveBeenCalledWith(
    expect.stringContaining("/doses"),
    { version: 1, day: "2026-09-16", time: "08:00", outcome: "taken" },
    expect.anything(),
  );
});
it("keeps the original day, dose and request key after an uncertain response", async () => {
  jest
    .mocked(client.post)
    .mockRejectedValueOnce(new ApiError("Lost response", 0))
    .mockResolvedValueOnce(dose);
  render(tree(qc, <MedicationTrackerScreen />));
  fireEvent.changeText(screen.getByLabelText("Tracking date (YYYY-MM-DD)"), tracking.day);
  fireEvent.press(screen.getByText("Show day"));
  fireEvent.press(await screen.findByText("Mark skipped"));
  fireEvent.press(await screen.findByText("Today"));
  fireEvent.press(screen.getByText("Retry the same request"));
  await screen.findByText("Saved to your medication record.");
  const calls = jest.mocked(client.post).mock.calls;
  expect(calls[1][1]).toEqual(calls[0][1]);
  expect(calls[1][2]?.headers).toEqual(calls[0][2]?.headers);
});
it("does not show a reassuring empty state during failure", async () => {
  jest.mocked(client.get).mockRejectedValue(new Error("offline"));
  render(tree(qc, <MedicationTrackerScreen />));
  await screen.findByText("Could not load medication tracking");
  expect(screen.queryByText("No medication courses for this date.")).toBeNull();
});

it("formats occurrence times in the saved course zone rather than the device zone", () => {
  const { occurrenceTime } = require("../medication-api");
  expect(occurrenceTime("2026-09-16T12:00:00Z", "Asia/Kolkata")).toBe("17:30");
  expect(occurrenceTime("2026-09-16T12:00:00Z", "Invalid/Zone")).toBe("12:00 UTC");
});
