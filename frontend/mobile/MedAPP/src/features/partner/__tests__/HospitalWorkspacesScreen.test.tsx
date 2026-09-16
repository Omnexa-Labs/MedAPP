import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TEST_METRICS } from "@/test/safe-area";
import { client } from "@/lib/api/client";
import { openHospitalPortal } from "@/lib/partner/open-hospital";
import { HospitalWorkspacesScreen } from "../HospitalWorkspacesScreen";
let mockOwner: string | undefined = "owner";
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
jest.mock("@/lib/partner/open-hospital", () => ({
  openHospitalPortal: jest.fn(),
  consumeNativeHospitalReturn: jest.fn(),
  consumeWebHospitalReturn: jest.fn(),
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
  hospital_id: "22222222-2222-4222-8222-222222222222",
  hospital_name: "Accra Care Hospital",
  hms_role: "nurse",
};
function tree() {
  return (
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <QueryClientProvider client={queryClient}>
        <HospitalWorkspacesScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = "owner";
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(client.get).mockResolvedValue([workspace]);
  jest.mocked(openHospitalPortal).mockResolvedValue("returned");
});
afterEach(() => queryClient.clear());
it("lists saved memberships and opens a portal session bound to the current mobile account", async () => {
  render(tree());
  expect(await screen.findByText("Accra Care Hospital")).toBeTruthy();
  expect(client.get).toHaveBeenCalledWith(
    "/v1/hms/auth/workspaces",
    expect.objectContaining({ signal: expect.anything(), isSessionCurrent: expect.any(Function) }),
  );
  fireEvent.press(screen.getByText("Open hospital portal"));
  await waitFor(() =>
    expect(openHospitalPortal).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "owner", signal: expect.anything() }),
    ),
  );
  await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
});
it("explains absent membership without opening a clinical workspace", async () => {
  jest.mocked(client.get).mockResolvedValue([]);
  render(tree());
  expect(await screen.findByText("No hospital workspaces yet")).toBeTruthy();
  expect(screen.queryByText("Open hospital portal")).toBeNull();
});
it("shows membership failures and supports a real retry", async () => {
  jest.mocked(client.get).mockRejectedValueOnce(new Error("Unavailable"));
  render(tree());
  expect(await screen.findByText("Could not load hospital access")).toBeTruthy();
  fireEvent.press(screen.getByText("Refresh hospital access"));
  expect(await screen.findByText("Accra Care Hospital")).toBeTruthy();
});
it("removes the old account's membership list when the signed-in user changes", async () => {
  const page = render(tree());
  await screen.findByText("Accra Care Hospital");
  mockOwner = "new-owner";
  jest.mocked(client.get).mockResolvedValue([]);
  page.rerender(tree());
  expect(await screen.findByText("No hospital workspaces yet")).toBeTruthy();
  expect(screen.queryByText("Accra Care Hospital")).toBeNull();
});
