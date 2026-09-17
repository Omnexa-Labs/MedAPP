import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TEST_METRICS } from "@/test/safe-area";
import { client } from "@/lib/api/client";
import { PharmacyPrescriptionHistory } from "../PharmacyPrescriptionHistory";
import { pharmacyPrescriptions } from "../pharmacy-prescriptions-api";

let mockOwner: string | undefined = "patient";
jest.mock("@/lib/config", () => ({ config: { appEnv: "dev" } }));
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => {
    const owner = mockOwner;
    return {
      owner,
      revision: 1,
      isCurrent: require("react").useCallback(() => !!owner && mockOwner === owner, [owner]),
    };
  },
}));
jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn() } }));
jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
const id = "22222222-2222-4222-8222-222222222222";
const record = {
  id,
  pharmacy_id: id,
  pharmacy_name: "Care Pharmacy",
  sequence: 3,
  reported_at: "2026-09-16T12:00:00Z",
  snapshot: {
    rx_number: "RX-123",
    rx_version: 2,
    status: "dispensed",
    prescriber_name: "Dr Test",
    items: [
      {
        prescription_item_id: id,
        drug_name: "Test medicine",
        dosage_instructions: "As directed",
        quantity_prescribed: 10,
        quantity_dispensed: 10,
        quantity_returned: 2,
      },
    ],
  },
};
const page = { items: [record], total: 1, limit: 25, offset: 0 };
let qc: QueryClient;
function tree() {
  return (
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <QueryClientProvider client={qc}>
        <PharmacyPrescriptionHistory />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = "patient";
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(client.get).mockResolvedValue(page);
});
afterEach(() => qc.clear());
it("loads genuine pharmacy reports and keeps dispensing distinct from medicine-course completion", async () => {
  render(tree());
  expect(await screen.findByText("Care Pharmacy")).toBeTruthy();
  expect(screen.getByText("Dispensed")).toBeTruthy();
  expect(screen.queryByText("Completed")).toBeNull();
  expect(screen.queryByTestId("prescriptions-sample-notice")).toBeNull();
  fireEvent.press(screen.getByText("View medicines"));
  expect(screen.getByText("10 of 10 units dispensed")).toBeTruthy();
  expect(screen.getByText("2 units later returned to the pharmacy")).toBeTruthy();
  expect(client.get).toHaveBeenCalledWith(
    "/v1/me/pharmacy-prescriptions?limit=25&offset=0",
    expect.objectContaining({ signal: expect.anything(), isSessionCurrent: expect.any(Function) }),
  );
});
it("shows no records only after a successful empty response", async () => {
  jest.mocked(client.get).mockResolvedValue({ ...page, items: [], total: 0 });
  render(tree());
  expect(await screen.findByText("No pharmacy records yet")).toBeTruthy();
});
it("shows a failed load and retries without inventing empty or sample records", async () => {
  jest.mocked(client.get).mockRejectedValueOnce(new Error("Unavailable"));
  render(tree());
  await screen.findByText("Could not load pharmacy records");
  expect(screen.queryByText("No pharmacy records yet")).toBeNull();
  fireEvent.press(screen.getByText("Refresh pharmacy records"));
  await screen.findByText("Care Pharmacy");
});
it("cancels the old account's request and ignores its late result", async () => {
  let resolve!: (value: unknown) => void;
  jest.mocked(client.get).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(tree());
  await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
  const options = jest.mocked(client.get).mock.calls[0][1]!;
  mockOwner = "another-patient";
  jest.mocked(client.get).mockResolvedValue({ ...page, items: [], total: 0 });
  view.rerender(tree());
  await screen.findByText("No pharmacy records yet");
  expect(options.signal?.aborted).toBe(true);
  expect(options.isSessionCurrent?.()).toBe(false);
  await act(async () => resolve(page));
  expect(screen.queryByText("Care Pharmacy")).toBeNull();
});
it("requests the next page and resets paging on account change", async () => {
  jest.mocked(client.get).mockResolvedValue({ ...page, total: 26 });
  const view = render(tree());
  fireEvent.press(await screen.findByText("Next records"));
  await waitFor(() =>
    expect(client.get).toHaveBeenCalledWith(
      "/v1/me/pharmacy-prescriptions?limit=25&offset=25",
      expect.anything(),
    ),
  );
  mockOwner = "new-patient";
  jest.mocked(client.get).mockResolvedValue({ ...page, items: [], total: 0 });
  view.rerender(tree());
  await screen.findByText("No pharmacy records yet");
  expect(screen.queryByText("Previous records")).toBeNull();
});
it.each(["balance", "status", "identity", "timestamp", "duplicate"])(
  "rejects an inconsistent %s response",
  async (change) => {
    const broken = JSON.parse(JSON.stringify(page));
    if (change === "balance") broken.items[0].snapshot.items[0].quantity_returned = 11;
    if (change === "status") broken.items[0].snapshot.status = "completed";
    if (change === "identity") broken.items[0].id = "not-an-id";
    if (change === "timestamp") broken.items[0].reported_at = "yesterday";
    if (change === "duplicate") broken.items.push(broken.items[0]);
    jest.mocked(client.get).mockResolvedValue(broken);
    await expect(pharmacyPrescriptions(0, {})).rejects.toThrow("could not be confirmed");
  },
);
