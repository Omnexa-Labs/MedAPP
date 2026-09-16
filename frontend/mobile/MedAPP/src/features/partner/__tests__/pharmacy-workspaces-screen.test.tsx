import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TEST_METRICS } from "@/test/safe-area";
import { client } from "@/lib/api/client";
import { openPharmacyPortal } from "@/lib/partner/open-pharmacy";
import { PharmacyWorkspacesScreen } from "../pharmacy-workspaces-screen";
let mockOwner: string | undefined = "owner";
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
jest.mock("@/lib/partner/open-pharmacy", () => ({
  ...jest.requireActual("@/lib/partner/open-pharmacy"),
  openPharmacyPortal: jest.fn(),
  consumeNativePharmacyReturn: jest.fn(),
  consumeWebPharmacyReturn: jest.fn(),
}));
jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  },
}));
let queryClient: QueryClient;
const workspace = {
  pharmacy_id: "22222222-2222-4222-8222-222222222222",
  pharmacy_name: "Accra Care Pharmacy",
  deployment_key: "accra",
  web_origin: "https://pharmacy.example",
};
function tree() {
  return (
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <QueryClientProvider client={queryClient}>
        <PharmacyWorkspacesScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = "owner";
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(client.get).mockResolvedValue([workspace]);
  jest.mocked(openPharmacyPortal).mockResolvedValue("returned");
});
afterEach(() => queryClient.clear());
it("lists saved memberships and opens a portal session bound to the current mobile account", async () => {
  render(tree());
  expect(await screen.findByText("Accra Care Pharmacy")).toBeTruthy();
  expect(client.get).toHaveBeenCalledWith(
    "/v1/pharmacy-workspaces",
    expect.objectContaining({ signal: expect.anything(), isSessionCurrent: expect.any(Function) }),
  );
  fireEvent.press(screen.getByText("Open Accra Care Pharmacy"));
  await waitFor(() =>
    expect(openPharmacyPortal).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "owner", pharmacyId: workspace.pharmacy_id, portalOrigin: workspace.web_origin, signal: expect.anything() }),
    ),
  );
  await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
});
it("explains absent membership without opening a clinical workspace", async () => {
  jest.mocked(client.get).mockResolvedValue([]);
  render(tree());
  expect(await screen.findByText("No pharmacy workspaces yet")).toBeTruthy();
  expect(screen.queryByText("Open Accra Care Pharmacy")).toBeNull();
});
it("shows membership failures and supports a real retry", async () => {
  jest.mocked(client.get).mockRejectedValueOnce(new Error("Unavailable"));
  render(tree());
  expect(await screen.findByText("Could not load pharmacy access")).toBeTruthy();
  fireEvent.press(screen.getByText("Refresh pharmacy access"));
  expect(await screen.findByText("Accra Care Pharmacy")).toBeTruthy();
});
it("removes the old account's membership list when the signed-in user changes", async () => {
  const page = render(tree());
  await screen.findByText("Accra Care Pharmacy");
  mockOwner = "new-owner";
  jest.mocked(client.get).mockResolvedValue([]);
  page.rerender(tree());
  expect(await screen.findByText("No pharmacy workspaces yet")).toBeTruthy();
  expect(screen.queryByText("Accra Care Pharmacy")).toBeNull();
});
