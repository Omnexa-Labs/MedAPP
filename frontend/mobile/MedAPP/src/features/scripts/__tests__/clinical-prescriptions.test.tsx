import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TEST_METRICS } from "@/test/safe-area";
import { client } from "@/lib/api/client";
import { ApiError } from "@/types/api";
import { saveTextDocument } from "@/lib/documents";
import { clinicalApi, type ClinicalPrescription } from "../clinical-api";
import {
  ClinicalPrescriptionDetailScreen,
  ClinicalPrescriptionHistory,
} from "../ClinicalPrescriptionScreens";
import { PrescribingScreen } from "../PrescribingScreen";

const patient = "11111111-1111-4111-8111-111111111111";
const doctor = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
let mockOwner = patient;
let mockRole = "patient";
let mockParams: { id?: string; patientId?: string } = {};
jest.mock("@/lib/documents", () => ({
  saveTextDocument: jest.fn(),
  describeSaveResult: () => ({ message: "Copy saved" }),
}));
jest.mock("@/lib/config", () => ({ config: { appEnv: "dev" } }));
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => {
    const owner = mockOwner;
    return {
      owner,
      user: { id: owner, accountRole: mockRole },
      revision: 1,
      isCurrent: require("react").useCallback(() => owner === mockOwner, [owner]),
    };
  },
}));
jest.mock("@/lib/api/client", () => ({
  client: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "44444444-4444-4444-8444-444444444444" }));
jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
const rx: ClinicalPrescription = {
  id,
  patient_user_id: patient,
  author_id: doctor,
  prescriber_name: "Dr Test",
  version: 2,
  status: "issued",
  items: [
    {
      drug_name: "Test medicine",
      strength: "10mg",
      form: "tablet",
      dose: "1 tablet",
      route: "Oral",
      frequency: "Once daily",
      duration: "5 days",
      quantity: 5,
      instructions: "With food",
    },
  ],
  clinical_goal: "Recorded clinical goal",
  valid_until: "2026-12-01",
  issued_at: "2026-09-16T12:00:00Z",
  cancelled_at: null,
  created_at: "2026-09-16T12:00:00Z",
  change_reason: null,
  replaces_id: null,
  replacement_id: null,
  pharmacy_id: null,
  deliveries: [],
};
const page = { items: [rx], offset: 0, limit: 25, next_offset: null };
let qc: QueryClient;
function tree(children: React.ReactNode) {
  return (
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = patient;
  mockRole = "patient";
  mockParams = {};
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(client.get).mockResolvedValue(page);
});
afterEach(() => qc.clear());

it("refreshes the saved status before exporting a patient copy", async () => {
  mockParams = { id };
  jest
    .mocked(client.get)
    .mockResolvedValueOnce(rx)
    .mockResolvedValueOnce({ ...rx, status: "cancelled", cancelled_at: "2026-09-16T13:00:00Z" });
  render(tree(<ClinicalPrescriptionDetailScreen />));
  fireEvent.press(await screen.findByText("Save or share text copy (.txt)"));
  await screen.findByText("Copy saved");
  expect(saveTextDocument).toHaveBeenCalledWith(
    expect.objectContaining({
      body: expect.stringContaining("Status: Cancelled"),
      fileName: `MedApp-prescription-${id}.txt`,
    }),
  );
});

it("shows issued clinical records and links pharmacy reports without claiming course completion", async () => {
  render(tree(<ClinicalPrescriptionHistory />));
  expect(await screen.findByText("Test medicine")).toBeTruthy();
  expect(screen.getByText("View pharmacy reports")).toBeTruthy();
  expect(screen.queryByText("Completed")).toBeNull();
  expect(client.get).toHaveBeenCalledWith(
    `/v1/patients/${patient}/prescriptions?limit=25&offset=0`,
    expect.objectContaining({ signal: expect.anything() }),
  );
});
it("rejects a response for another patient", async () => {
  jest
    .mocked(client.get)
    .mockResolvedValue({ ...page, items: [{ ...rx, patient_user_id: doctor }] });
  await expect(clinicalApi.list(patient, 0, {})).rejects.toThrow("could not be confirmed");
});
it("does not reconstruct a prescription from clinical URL parameters", async () => {
  render(tree(<ClinicalPrescriptionDetailScreen />));
  expect(
    screen.getByText("Open a prescription from your history to view its saved details."),
  ).toBeTruthy();
  expect(client.get).not.toHaveBeenCalled();
});
it("hides the previous patient's late response after an account switch", async () => {
  let resolve!: (data: unknown) => void;
  jest.mocked(client.get).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(tree(<ClinicalPrescriptionHistory />));
  await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
  const options = jest.mocked(client.get).mock.calls[0][1]!;
  mockOwner = doctor;
  jest.mocked(client.get).mockResolvedValue({ ...page, items: [] });
  view.rerender(tree(<ClinicalPrescriptionHistory />));
  await screen.findByText("No issued prescriptions yet.");
  expect(options.signal?.aborted).toBe(true);
  expect(options.isSessionCurrent?.()).toBe(false);
  await act(async () => resolve(page));
  expect(screen.queryByText("Test medicine")).toBeNull();
});
it("shows a failed query separately from empty history", async () => {
  jest.mocked(client.get).mockRejectedValue(new Error("offline"));
  render(tree(<ClinicalPrescriptionHistory />));
  expect(await screen.findByText("Could not load prescriptions")).toBeTruthy();
  expect(screen.queryByText("No issued prescriptions yet.")).toBeNull();
});
it("blocks the nurse prescribing surface", async () => {
  mockOwner = doctor;
  mockRole = "nurse";
  mockParams = { patientId: patient };
  render(tree(<PrescribingScreen />));
  expect(
    screen.getByText(
      "Prescribing is available to verified doctors from an authorized patient record.",
    ),
  ).toBeTruthy();
  expect(client.get).not.toHaveBeenCalled();
});
it("requires complete draft fields then explicit clinical review before issuing", async () => {
  mockOwner = doctor;
  mockRole = "doctor";
  mockParams = { patientId: patient };
  jest
    .mocked(client.get)
    .mockImplementation(async (url) =>
      url.includes("?limit=")
        ? { ...page, items: [] }
        : jest.mocked(client.post).mock.calls.length > 1
          ? rx
          : { ...rx, status: "draft", version: 1, issued_at: null },
    );
  jest
    .mocked(client.post)
    .mockResolvedValueOnce({ ...rx, status: "draft", version: 1, issued_at: null })
    .mockResolvedValueOnce(rx);
  render(tree(<PrescribingScreen />));
  fireEvent.press(await screen.findByText("Create prescription"));
  fireEvent.press(screen.getByText("Save draft and review"));
  expect(client.post).not.toHaveBeenCalled();
  for (const [label, value] of [
    ["Medicine name 1", "Test medicine"],
    ["Strength 1", "10mg"],
    ["Form (for example, tablet or capsule) 1", "tablet"],
    ["Dose 1", "1 tablet"],
    ["Route 1", "Oral"],
    ["Frequency 1", "Once daily"],
    ["Duration 1", "5 days"],
    ["Dispense quantity 1", "5"],
    ["Valid for dispensing through (YYYY-MM-DD, UTC)", "2026-12-01"],
  ])
    fireEvent.changeText(screen.getByLabelText(label), value);
  fireEvent.press(screen.getByText("Save draft and review"));
  await screen.findByText("Issue prescription");
  fireEvent.press(screen.getByText("Issue prescription"));
  expect(client.post).toHaveBeenCalledTimes(1);
  fireEvent.press(
    screen.getByLabelText(
      "I reviewed the patient, medicines, allergies, directions and quantities",
    ),
  );
  fireEvent.press(screen.getByText("Issue prescription"));
  await screen.findByText("Prescription issued and available to the patient.");
  expect(client.post).toHaveBeenLastCalledWith(
    `/v1/patients/${patient}/prescriptions/${id}/issue`,
    { version: 1, clinical_review_confirmed: true },
    expect.objectContaining({ headers: { "Idempotency-Key": expect.any(String) } }),
  );
});
it.each(["issued", "cancelled"] as const)(
  "retries an uncertain issue and refreshes the current %s status",
  async (status) => {
    mockOwner = doctor;
    mockRole = "doctor";
    mockParams = { patientId: patient };
    const draft = { ...rx, status: "draft", version: 1, issued_at: null };
    jest
      .mocked(client.get)
      .mockImplementation(async (url) =>
        url.includes("?limit=")
          ? { ...page, items: [draft] }
          : jest.mocked(client.post).mock.calls.length > 1
            ? { ...rx, status, version: 3 }
            : { ...draft, version: jest.mocked(client.put).mock.calls.length ? 2 : 1 },
      );
    jest.mocked(client.put).mockResolvedValue({ ...draft, version: 2 });
    jest
      .mocked(client.post)
      .mockRejectedValueOnce(new ApiError("Response lost", 0))
      .mockResolvedValueOnce({ ...rx, version: 3 });
    render(tree(<PrescribingScreen />));
    fireEvent.press(await screen.findByText("Open prescription"));
    fireEvent.press(await screen.findByText("Save draft and review"));
    fireEvent.press(
      await screen.findByLabelText(
        "I reviewed the patient, medicines, allergies, directions and quantities",
      ),
    );
    fireEvent.press(screen.getByText("Issue prescription"));
    fireEvent.press(await screen.findByText("Retry the same request"));
    await screen.findByText(
      status === "issued"
        ? "Prescription issued and available to the patient."
        : "Prescription saved.",
    );
    if (status === "cancelled") expect(screen.getByText("Cancelled")).toBeTruthy();
    const calls = jest.mocked(client.post).mock.calls;
    expect(calls[1][0]).toBe(calls[0][0]);
    expect(calls[1][1]).toEqual(calls[0][1]);
    expect(calls[1][2]?.headers).toEqual(calls[0][2]?.headers);
  },
);
