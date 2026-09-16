import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { TEST_METRICS } from "@/test/safe-area";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { VitalsTimelineScreen } from "../VitalsTimelineScreen";
import { MedicalRecordsScreen } from "../MedicalRecordsScreen";

jest.setTimeout(90_000);
const mockList = jest.fn();
const mockPush = jest.fn();
let mockOwner = "patient";
let mockRevision = 1;
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    canGoBack: () => true,
    back: jest.fn(),
    replace: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => ({ owner: mockOwner, revision: mockRevision, isCurrent: () => true }),
}));
jest.mock("@/features/care/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));
jest.mock("../vital-timeline-api", () => ({
  ...jest.requireActual("../vital-timeline-api"),
  vitalTimelineApi: { list: (...args: unknown[]) => mockList(...args) },
}));
jest.mock("@/lib/api/client", () => ({ client: {} }));
const vital = {
  id: "v1",
  patientId: "record",
  kind: "blood_pressure",
  value: "122/80",
  unit: "mmHg",
  recordedAtIso: "2026-09-13T12:00:00Z",
  note: "Seated",
};
let queryClient: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockReset();
  mockOwner = "patient";
  mockRevision = 1;
  mockList.mockResolvedValue({ items: [vital], nextCursor: null });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => queryClient.clear());
const content = () => (
  <QueryClientProvider client={queryClient}>
    <VitalsTimelineScreen />
  </QueryClientProvider>
);

test("dated values and notes come from the EHR without reference ranges or invented classifications", async () => {
  render(content());
  expect(await screen.findByText("122/80 mmHg")).toBeTruthy();
  expect(screen.getByText("Seated")).toBeTruthy();
  expect(screen.queryByText(/Normal|Elevated|Healthy/)).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Manage care-team sharing" }));
  expect(mockPush).toHaveBeenCalledWith("/(app)/care-team-sharing");
});
test("empty filters can be cleared to search all recorded readings", async () => {
  mockList.mockResolvedValue({ items: [], nextCursor: null });
  render(content());
  fireEvent.changeText(screen.getByLabelText("Filter by recorded measurement type"), "temperature");
  fireEvent.press(await screen.findByRole("button", { name: "Show all readings" }));
  await waitFor(() =>
    expect(mockList).toHaveBeenLastCalledWith(
      "patient",
      { from: undefined, kind: undefined },
      null,
      expect.any(Object),
    ),
  );
  expect(await screen.findByText("No recorded vitals yet")).toBeTruthy();
});
test("paging uses the returned cursor and keeps loaded readings when a later page fails", async () => {
  mockList
    .mockResolvedValueOnce({ items: [vital], nextCursor: "cursor" })
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ items: [{ ...vital, id: "v2", value: "120/78" }], nextCursor: null });
  render(content());
  fireEvent.press(await screen.findByRole("button", { name: "Load more readings" }));
  expect(await screen.findByText("More readings couldn't load")).toBeTruthy();
  expect(screen.getByText("122/80 mmHg")).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Try again" })));
  expect(await screen.findByText("120/78 mmHg")).toBeTruthy();
  expect(mockList).toHaveBeenLastCalledWith(
    "patient",
    expect.any(Object),
    "cursor",
    expect.any(Object),
  );
});
test("initial failure is separate from an empty record and retry loads real data", async () => {
  mockList
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ items: [vital], nextCursor: null });
  render(content());
  expect(await screen.findByText("Vitals couldn't load")).toBeTruthy();
  expect(screen.queryByText("No recorded vitals yet")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("122/80 mmHg")).toBeTruthy();
});
test("account changes clear readings and filters before fetching the new account", async () => {
  const view = render(content());
  await screen.findByText("122/80 mmHg");
  fireEvent.changeText(
    screen.getByLabelText("Filter by recorded measurement type"),
    "blood pressure",
  );
  mockOwner = "other";
  mockRevision++;
  mockList.mockImplementation(() => new Promise(() => {}));
  view.rerender(<SafeAreaProvider initialMetrics={TEST_METRICS}>{content()}</SafeAreaProvider>);
  expect(screen.queryByText("122/80 mmHg")).toBeNull();
  expect(screen.getByLabelText("Filter by recorded measurement type").props.value).toBe("");
  expect(screen.getByTestId("vital-timeline-loading")).toBeTruthy();
});
test("medical-records hub connects its four available destinations", () => {
  render(<MedicalRecordsScreen />);
  for (const [label, route] of [
    ["View recorded vitals", "vitals-timeline"],
    ["Open health overview", "overview"],
    ["View lab results", "lab-results"],
    ["Manage care-team sharing", "care-team-sharing"],
  ]) {
    fireEvent.press(screen.getByRole("button", { name: label }));
    expect(mockPush).toHaveBeenCalledWith(`/(app)/${route}`);
  }
  expect(screen.queryByRole("button", { name: /upload/i })).toBeNull();
});
