import { patient, id, owner, params, course, queryClient, tree } from "../testing/fixtures";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { client } from "@/lib/api/client";
import { ApiError } from "@/types/api";
import { AddMedicationScreen } from "../AddMedicationScreen";
let qc: ReturnType<typeof queryClient>;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(client.get).mockReset().mockResolvedValue(course);
  jest.mocked(client.post).mockReset().mockResolvedValue(course);
  owner(patient);
  params({});
  qc = queryClient();
});
afterEach(() => qc.clear());
function fill() {
  for (const [label, value] of [
    ["Medicine name", "Saved medicine"],
    ["Strength", "10mg"],
    ["Form", "tablet"],
    ["Dose", "1 tablet"],
    ["Route", "Oral"],
    ["Frequency", "Once daily"],
  ])
    fireEvent.changeText(screen.getByLabelText(label), value);
  fireEvent.press(screen.getByLabelText("I checked the medicine, directions and tracking plan"));
}
it("requires complete medicine details and confirmation before saving", async () => {
  render(tree(qc, <AddMedicationScreen />));
  fireEvent.press(screen.getByText("Save medication"));
  expect(client.post).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText("I checked the medicine, directions and tracking plan"));
  fireEvent.press(screen.getByText("Save medication"));
  expect(
    screen.getByText("Complete the medicine name, strength, form, dose, route and frequency."),
  ).toBeTruthy();
  fireEvent.press(screen.getByLabelText("I checked the medicine, directions and tracking plan"));
  fill();
  fireEvent.press(screen.getByText("Save medication"));
  await screen.findByText("View saved medication");
  expect(client.post).toHaveBeenCalledWith(
    "/v1/patients/" + patient + "/medications",
    expect.objectContaining({
      medicine: expect.objectContaining({ drug_name: "Saved medicine" }),
      daily_times: [],
    }),
    expect.objectContaining({ headers: { "Idempotency-Key": expect.any(String) } }),
  );
});
it("reuses the exact request after a lost save response", async () => {
  jest
    .mocked(client.post)
    .mockRejectedValueOnce(new ApiError("Response lost", 0))
    .mockResolvedValueOnce(course);
  render(tree(qc, <AddMedicationScreen />));
  fill();
  fireEvent.press(screen.getByText("Save medication"));
  fireEvent.press(await screen.findByText("Retry the same request"));
  await screen.findByText("View saved medication");
  const calls = jest.mocked(client.post).mock.calls;
  expect(calls[1][1]).toEqual(calls[0][1]);
  expect(calls[1][2]?.headers).toEqual(calls[0][2]?.headers);
});
it("rejects duplicate tracking times without a request", () => {
  render(tree(qc, <AddMedicationScreen />));
  fill();
  fireEvent.changeText(
    screen.getByLabelText("Daily times (HH:MM, separated by commas)"),
    "08:00,08:00",
  );
  fireEvent.press(screen.getByText("Save medication"));
  expect(client.post).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      "Use valid YYYY-MM-DD dates, a timezone, and distinct HH:MM daily times separated by commas.",
    ),
  ).toBeTruthy();
});
it("does not accept an invalid prescription identifier as a self-reported medicine", () => {
  params({ prescriptionId: "sample", item: "0" });
  render(tree(qc, <AddMedicationScreen />));
  expect(screen.getByText("Open a medicine from your saved prescription.")).toBeTruthy();
  expect(screen.queryByLabelText("Medicine name")).toBeNull();
  expect(client.get).not.toHaveBeenCalled();
});
it("loads authoritative prescribed directions and sends only the prescription identity", async () => {
  params({ prescriptionId: id, item: "0" });
  const rx = {
    id,
    patient_user_id: patient,
    author_id: "22222222-2222-4222-8222-222222222222",
    prescriber_name: "Dr QA",
    version: 2,
    status: "issued",
    items: [{ ...course.medicine, duration: "5 days", quantity: 5 }],
    clinical_goal: "",
    valid_until: "2026-12-01",
    issued_at: "2026-09-16T01:00:00Z",
    cancelled_at: null,
    created_at: "2026-09-16T00:00:00Z",
    change_reason: null,
    replaces_id: null,
    replacement_id: null,
    pharmacy_id: null,
    deliveries: [],
  };
  jest.mocked(client.get).mockResolvedValueOnce(rx).mockResolvedValue(course);
  render(tree(qc, <AddMedicationScreen />));
  await screen.findByText("Saved medicine 10mg · tablet");
  expect(screen.queryByLabelText("Medicine name")).toBeNull();
  fireEvent.press(screen.getByLabelText("I checked the medicine, directions and tracking plan"));
  fireEvent.press(screen.getByText("Save medication"));
  await screen.findByText("View saved medication");
  const payload = jest.mocked(client.post).mock.calls[0][1] as Record<string, unknown>;
  expect(payload.prescription_id).toBe(id);
  expect(payload.prescription_item).toBe(0);
  expect(payload.medicine).toBeUndefined();
});

it("does not show a previous account's save result after an account switch", async () => {
  const { act, waitFor } = require("@testing-library/react-native");
  const { other } = require("../testing/fixtures");
  let resolve!: (value: unknown) => void;
  jest.mocked(client.post).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(tree(qc, <AddMedicationScreen />));
  fill();
  fireEvent.press(screen.getByText("Save medication"));
  await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
  owner(other);
  view.rerender(tree(qc, <AddMedicationScreen />));
  await act(async () => resolve(course));
  expect(screen.queryByText("View saved medication")).toBeNull();
  expect(client.get).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Medicine name").props.value).toBe("");
});
