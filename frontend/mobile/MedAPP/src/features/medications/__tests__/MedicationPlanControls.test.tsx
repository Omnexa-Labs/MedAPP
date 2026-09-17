import { patient, id, owner, params, course, empty, queryClient, tree } from "../testing/fixtures";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { client } from "@/lib/api/client";
import { MedicationDetailsScreen } from "../MedicationDetailsScreen";
import { enableReminderDevice } from "../reminder-device";
import { ApiError } from "@/types/api";

let qc: ReturnType<typeof queryClient>;
const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
beforeEach(() => {
  jest.clearAllMocks();
  owner(patient);
  params({ id });
  qc = queryClient();
  jest
    .mocked(client.get)
    .mockReset()
    .mockImplementation(async (url) =>
      url.includes("/doses?") || url.includes("/events?") ? empty : course,
    );
  jest.mocked(client.post).mockReset();
});
afterEach(() => qc.clear());
async function edit() {
  render(tree(qc, <MedicationDetailsScreen />));
  fireEvent.press(await screen.findByText("Edit future schedule"));
  fireEvent.changeText(screen.getByLabelText("New plan starts (YYYY-MM-DD)"), future);
  fireEvent.changeText(
    screen.getByLabelText("New daily times (HH:MM, comma separated)"),
    "09:00, 21:00",
  );
  fireEvent.changeText(
    screen.getByLabelText("Reason for schedule change"),
    "Adjust future tracking",
  );
}
it("saves a future revision and displays the authoritative pending plan", async () => {
  await edit();
  const next = {
    ...course,
    version: 2,
    schedule_changes: [{ effective_date: future, end_date: null, daily_times: ["09:00", "21:00"] }],
  };
  jest.mocked(client.post).mockResolvedValue(next);
  jest
    .mocked(client.get)
    .mockImplementation(async (url) => (url.includes("/doses?") ? empty : next));
  fireEvent.press(screen.getByText("Save future schedule"));
  await screen.findByText(`From ${future}: 09:00, 21:00 · Africa/Accra · no end date`);
  expect(client.post).toHaveBeenCalledWith(
    expect.stringContaining(`/${id}/schedule`),
    {
      version: 1,
      effective_date: future,
      end_date: null,
      daily_times: ["09:00", "21:00"],
      reason: "Adjust future tracking",
    },
    expect.anything(),
  );
  expect(screen.getByText("Daily tracking: 08:00, 20:00 · Africa/Accra")).toBeTruthy();
});
it("rejects duplicate times and past effective dates before sending", async () => {
  await edit();
  fireEvent.changeText(
    screen.getByLabelText("New daily times (HH:MM, comma separated)"),
    "09:00, 09:00",
  );
  fireEvent.press(screen.getByText("Save future schedule"));
  expect(client.post).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText("New daily times (HH:MM, comma separated)"), "09:00");
  fireEvent.changeText(screen.getByLabelText("New plan starts (YYYY-MM-DD)"), "2020-01-01");
  fireEvent.press(screen.getByText("Save future schedule"));
  expect(client.post).not.toHaveBeenCalled();
});
it("retries a lost revision response with the original key and body", async () => {
  await edit();
  jest
    .mocked(client.post)
    .mockRejectedValueOnce(new ApiError("Connection lost", 0))
    .mockResolvedValueOnce({ ...course, version: 2 });
  fireEvent.press(screen.getByText("Save future schedule"));
  fireEvent.press(await screen.findByText("Retry the same request"));
  await waitFor(() => expect(client.post).toHaveBeenCalledTimes(2));
  const [first, second] = jest.mocked(client.post).mock.calls;
  expect(second.slice(0, 2)).toEqual(first.slice(0, 2));
  expect(second[2]?.headers).toEqual(first[2]?.headers);
});
it("saves opt-in separately from confirming a registered device", async () => {
  render(tree(qc, <MedicationDetailsScreen />));
  const next = { ...course, version: 2, reminders_enabled: true };
  jest.mocked(client.post).mockResolvedValue(next);
  jest
    .mocked(client.get)
    .mockImplementation(async (url) => (url.includes("/doses?") ? empty : next));
  fireEvent.press(await screen.findByText("Turn reminders on"));
  await screen.findByText("Turn reminders off");
  expect(enableReminderDevice).not.toHaveBeenCalled();
  jest
    .mocked(enableReminderDevice)
    .mockRejectedValueOnce(new Error("Notifications are not allowed"));
  fireEvent.press(screen.getByText("Enable or check this device"));
  await screen.findByText("Notifications are not allowed");
  expect(screen.queryByText(/Device registered through/)).toBeNull();
});
it("shows provider acceptance without claiming arrival", async () => {
  jest.mocked(client.get).mockImplementation(async (url) =>
    url.includes("/reminder-history?")
      ? {
          ...empty,
          items: [
            { id, scheduled_at: "2026-09-17T08:00:00Z", state: "accepted", error_code: null },
          ],
        }
      : url.includes("/doses?")
        ? empty
        : course,
  );
  render(tree(qc, <MedicationDetailsScreen />));
  fireEvent.press(await screen.findByText("View reminder activity"));
  await screen.findByText(/Accepted by push provider; arrival unconfirmed/);
});

it("keeps an explicitly removed end date empty when editing a pending plan", async () => {
  const pending = {
    ...course,
    end_date: "2099-12-31",
    schedule_changes: [{ effective_date: future, end_date: null, daily_times: ["09:00"] }],
  };
  jest
    .mocked(client.get)
    .mockImplementation(async (url) => (url.includes("/doses?") ? empty : pending));
  render(tree(qc, <MedicationDetailsScreen />));
  fireEvent.press(await screen.findByText("Edit future schedule"));
  expect(screen.getByLabelText("New end date (optional, YYYY-MM-DD)").props.value).toBe("");
});
