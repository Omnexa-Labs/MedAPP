import {
  patient,
  id,
  owner,
  params,
  course,
  dose,
  empty,
  queryClient,
  tree,
} from "../testing/fixtures";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { client } from "@/lib/api/client";
import { ApiError } from "@/types/api";
import { MedicationDetailsScreen } from "../MedicationDetailsScreen";
import { medicationApi } from "../medication-api";
let qc: ReturnType<typeof queryClient>;
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(client.get)
    .mockReset()
    .mockImplementation(async (url) =>
      url.includes("/doses?")
        ? { ...empty, items: [dose] }
        : url.includes("/events?")
          ? empty
          : course,
    );
  jest.mocked(client.post).mockReset();
  owner(patient);
  params({ id });
  qc = queryClient();
});
afterEach(() => qc.clear());
it("requires a saved identifier and never falls back to sample medicine", () => {
  params({});
  render(tree(qc, <MedicationDetailsScreen />));
  expect(screen.getByText("Open a medication from your saved list.")).toBeTruthy();
  expect(client.get).not.toHaveBeenCalled();
});
it("saves an explicit status change and renders freshly loaded status", async () => {
  render(tree(qc, <MedicationDetailsScreen />));
  fireEvent.press(await screen.findByText("Pause tracking"));
  fireEvent.press(screen.getByText("Confirm tracking change"));
  expect(client.post).not.toHaveBeenCalled();
  fireEvent.changeText(
    screen.getByLabelText("Reason for tracking change"),
    "Patient paused tracking",
  );
  jest.mocked(client.post).mockResolvedValue({ ...course, status: "paused", version: 2 });
  jest
    .mocked(client.get)
    .mockImplementation(async (url) =>
      url.includes("/doses?")
        ? { ...empty, items: [dose] }
        : { ...course, status: "paused", version: 2 },
    );
  fireEvent.press(screen.getByText("Confirm tracking change"));
  await screen.findByText("Tracking: Paused");
  expect(client.post).toHaveBeenCalledWith(
    "/v1/patients/" + patient + "/medications/" + id + "/status",
    { version: 1, status: "paused", reason: "Patient paused tracking" },
    expect.anything(),
  );
});
it("reloads on version conflicts instead of silently resubmitting", async () => {
  jest.mocked(client.post).mockRejectedValue(new ApiError("Record changed", 409));
  render(tree(qc, <MedicationDetailsScreen />));
  fireEvent.press(await screen.findByText("Mark course completed"));
  fireEvent.changeText(screen.getByLabelText("Reason for tracking change"), "Finished my course");
  fireEvent.press(screen.getByText("Confirm tracking change"));
  fireEvent.press(await screen.findByText("Reload saved record"));
  await screen.findByText("Pause tracking");
  expect(client.post).toHaveBeenCalledTimes(1);
});
it("corrects a mistaken dose with the dose version and a reason", async () => {
  render(tree(qc, <MedicationDetailsScreen />));
  fireEvent.press(await screen.findByText("Correct entry"));
  fireEvent.press(screen.getByText("Remove mistaken entry"));
  fireEvent.changeText(screen.getByLabelText("Reason for dose correction"), "Wrong entry");
  jest.mocked(client.post).mockResolvedValue({ ...dose, outcome: "voided", version: 2 });
  jest
    .mocked(client.get)
    .mockImplementation(async (url) =>
      url.includes("/doses?")
        ? { ...empty, items: [{ ...dose, outcome: "voided", version: 2 }] }
        : course,
    );
  fireEvent.press(screen.getByText("Save dose correction"));
  await screen.findByText("Entry removed · 2026-09-16 08:00");
  expect(client.post).toHaveBeenCalledWith(
    "/v1/patients/" + patient + "/medications/" + id + "/doses/" + dose.id + "/correct",
    { version: 1, outcome: "voided", reason: "Wrong entry" },
    expect.anything(),
  );
});
it("shows withdrawal and disables resuming a withdrawn prescription", async () => {
  jest.mocked(client.get).mockImplementation(async (url) =>
    url.includes("/doses?")
      ? empty
      : {
          ...course,
          source: "prescribed",
          prescription_id: id,
          prescription_item: 0,
          prescription_status: "cancelled",
          prescriber_name: "Dr QA",
          status: "paused",
        },
  );
  render(tree(qc, <MedicationDetailsScreen />));
  await screen.findByText("Tracking: Paused · prescription withdrawn");
  fireEvent.press(screen.getByText("Resume tracking"));
  expect(screen.queryByText("Confirm tracking change")).toBeNull();
  expect(client.post).not.toHaveBeenCalled();
});
it("rejects a saved mutation response belonging to another medication", async () => {
  jest
    .mocked(client.post)
    .mockResolvedValue({ ...course, id: "66666666-6666-4666-8666-666666666666" });
  await expect(
    medicationApi.write(
      patient,
      {
        suffix: "/" + id + "/status",
        kind: "course",
        key: "44444444-4444-4444-8444-444444444444",
        body: {},
      },
      {},
    ),
  ).rejects.toThrow("identity");
});
