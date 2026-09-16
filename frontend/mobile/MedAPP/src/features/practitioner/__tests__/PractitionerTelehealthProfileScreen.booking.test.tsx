import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
let mockParams: Record<string, string | undefined> = {};
let mockOwner = "patient1";
const mockCurrent = jest.fn(() => true);
const mockGet = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));
jest.mock("@/features/care/api", () => ({
  careApi: { getPublicPractitioner: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => ({ owner: mockOwner, revision: 1, isCurrent: mockCurrent }),
}));
import { router } from "expo-router";
import { ApiError } from "@/types/api";
import { PractitionerTelehealthProfileScreen } from "../PractitionerTelehealthProfileScreen";
const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const profile = {
  id: "doc1",
  category: "doctors",
  name: "Dr. Ama Osei",
  title: "Cardiology Specialist",
  bio: "A biography from the directory.",
  specialties: ["cardiology"],
  languages: ["English", "Twi"],
  avatarUri: "",
  consultationFeeCents: 12000,
  isActive: true,
  isListable: true,
};
let client: QueryClient;
function App() {
  return (
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <PractitionerTelehealthProfileScreen />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = "patient1";
  mockCurrent.mockReturnValue(true);
  mockParams = { providerId: "doc1", providerName: "Forged Name", providerFeeCents: "1" };
  mockGet.mockReset().mockResolvedValue(profile);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => client.clear());
it("reloads an ID-only link and renders the saved biography, specialties and languages", async () => {
  mockParams = { id: "doc1" };
  render(<App />);
  expect(await screen.findByText(profile.bio)).toBeTruthy();
  expect(screen.getByText("English, Twi")).toBeTruthy();
  expect(screen.getByText("cardiology")).toBeTruthy();
  expect(mockGet).toHaveBeenCalledWith(
    "doctors",
    "doc1",
    expect.objectContaining({ signal: expect.anything(), isSessionCurrent: mockCurrent }),
  );
});
it("books with the loaded identity and fee, ignoring display values in the URL", async () => {
  render(<App />);
  fireEvent.press(await screen.findByLabelText("Book appointment"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/(app)/select-time-slot",
    params: {
      practitionerId: "doc1",
      practitionerName: profile.name,
      practitionerSpecialty: profile.title,
      practitionerFeeCents: "12000",
    },
  });
  expect(screen.queryByText("Forged Name")).toBeNull();
});
it("does not offer booking while loading", () => {
  mockGet.mockReturnValue(new Promise(() => {}));
  render(<App />);
  expect(screen.getByLabelText("Loading provider profile")).toBeTruthy();
  expect(screen.queryByLabelText("Book appointment")).toBeNull();
});
it.each([
  {},
  { providerName: "Name only" },
  { providerId: "undefined" },
  { providerId: "doc1", providerKind: "hospitals" },
])("rejects a missing or invalid practitioner link %j", (params) => {
  mockParams = params;
  render(<App />);
  expect(screen.getByText(/don't have a provider to show/)).toBeTruthy();
  expect(mockGet).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Book appointment")).toBeNull();
});
it("retries a failed profile request and only then enables booking", async () => {
  mockGet.mockRejectedValueOnce(new ApiError("offline", 0));
  render(<App />);
  expect(await screen.findByText("Unable to load provider")).toBeTruthy();
  expect(screen.queryByLabelText("Book appointment")).toBeNull();
  fireEvent.press(screen.getByLabelText("Retry loading provider"));
  expect(await screen.findByLabelText("Book appointment")).toBeTruthy();
  expect(mockGet).toHaveBeenCalledTimes(2);
});
it("shows a removed profile without using route display data", async () => {
  mockGet.mockRejectedValue(new ApiError("gone", 404));
  render(<App />);
  expect(await screen.findByText("Provider not found")).toBeTruthy();
  expect(screen.queryByText("Forged Name")).toBeNull();
});
it.each(["nurses", "pharmacists"])(
  "loads %s without passing its ID to doctor booking",
  async (kind) => {
    mockParams = { providerId: "doc1", providerKind: kind };
    mockGet.mockResolvedValue({ ...profile, category: kind });
    render(<App />);
    expect(await screen.findByText(profile.name)).toBeTruthy();
    expect(screen.getByText(/Online booking isn't available/)).toBeTruthy();
    expect(screen.queryByLabelText("Book appointment")).toBeNull();
  },
);
it.each([{ isActive: false }, { isListable: false }])(
  "withholds booking for unavailable provider state %j",
  async (state) => {
    mockGet.mockResolvedValue({ ...profile, ...state });
    render(<App />);
    await screen.findByText(profile.name);
    expect(screen.queryByLabelText("Book appointment")).toBeNull();
  },
);
it("blocks an action if the signed-in account changed before the press", async () => {
  render(<App />);
  const button = await screen.findByLabelText("Book appointment");
  mockCurrent.mockReturnValue(false);
  fireEvent.press(button);
  expect(router.push).not.toHaveBeenCalled();
});
it("hides a cached profile after its refresh fails", async () => {
  render(<App />);
  await screen.findByLabelText("Book appointment");
  mockGet.mockRejectedValue(new ApiError("offline", 0));
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["care", "public-practitioner"] });
  });
  await screen.findByText("Unable to load provider");
  expect(screen.queryByLabelText("Book appointment")).toBeNull();
});
it("does not replace a new clinician with a late response from the old route", async () => {
  let finish!: (p: unknown) => void;
  mockGet.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = render(<App />);
  mockParams = { providerId: "doc2" };
  mockGet.mockResolvedValue({ ...profile, id: "doc2", name: "Dr. New Clinician" });
  view.rerender(<App />);
  await screen.findByText("Dr. New Clinician");
  await act(async () => finish(profile));
  expect(screen.queryByText(profile.name)).toBeNull();
  fireEvent.press(screen.getByLabelText("Book appointment"));
  expect(router.push).toHaveBeenCalledWith(
    expect.objectContaining({ params: expect.objectContaining({ practitionerId: "doc2" }) }),
  );
});
