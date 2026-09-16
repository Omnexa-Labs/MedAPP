import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
const mockDirectory = jest.fn();
const mockRetry = jest.fn(async () => {});
const mockMore = jest.fn(async () => {});
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
}));
jest.mock("../hooks/use-directory", () => ({
  useDirectory: (...args: unknown[]) => mockDirectory(...args),
}));
import { FindCareScreen } from "../FindCareScreen";
const nurse = {
  kind: "person",
  category: "nurses",
  id: "n1",
  name: "Home Nurse",
  title: "Nurse",
  avatarUri: "",
  badges: [],
  homeVisitFeeCents: 0,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockDirectory.mockReturnValue({
    entries: [],
    isLoading: false,
    error: null,
    failedSources: [],
    refetch: mockRetry,
    hasMore: false,
    loadMore: mockMore,
    isLoadingMore: false,
  });
});
it("filters home visits by the recorded fee, including zero, rather than badge text", () => {
  mockDirectory.mockReturnValue({
    entries: [
      nurse,
      {
        ...nurse,
        id: "n2",
        name: "No Visits",
        homeVisitFeeCents: null,
        badges: [{ label: "Home Service", tone: "tertiary" }],
      },
    ],
    isLoading: false,
    error: null,
  });
  render(<FindCareScreen />);
  fireEvent.press(screen.getByLabelText("Home Service"));
  expect(screen.getByText("Home Nurse")).toBeTruthy();
  expect(screen.queryByText("No Visits")).toBeNull();
  expect(mockDirectory).toHaveBeenLastCalledWith("nurses", "", "");
});
it("sends the specialty query for supported categories and clears it on category change", async () => {
  render(<FindCareScreen />);
  fireEvent.press(screen.getByLabelText("Doctors"));
  fireEvent.changeText(screen.getByLabelText("Filter by specialty"), "cardiology");
  await waitFor(() => expect(mockDirectory).toHaveBeenLastCalledWith("doctors", "", "cardiology"));
  fireEvent.press(screen.getByLabelText("Nurses"));
  expect(mockDirectory).toHaveBeenLastCalledWith("nurses", "", "");
  fireEvent.press(screen.getByLabelText("Pharmacies"));
  expect(screen.queryByLabelText("Filter by specialty")).toBeNull();
});
it("keeps results visible beside a failed category and performs a real retry", async () => {
  mockDirectory.mockReturnValue({
    entries: [nurse],
    isLoading: false,
    error: new Error("offline"),
    failedSources: ["Pharmacies"],
    refetch: mockRetry,
  });
  render(<FindCareScreen />);
  expect(screen.getByText("Home Nurse")).toBeTruthy();
  expect(screen.getByText(/Could not load: Pharmacies/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Retry loading directory"));
  await waitFor(() => expect(mockRetry).toHaveBeenCalledTimes(1));
});
it("loads further results from the pagination control", () => {
  mockDirectory.mockReturnValue({
    entries: [nurse],
    isLoading: false,
    error: null,
    hasMore: true,
    loadMore: mockMore,
  });
  render(<FindCareScreen />);
  fireEvent.press(screen.getByLabelText("Load more results"));
  expect(mockMore).toHaveBeenCalledTimes(1);
});
