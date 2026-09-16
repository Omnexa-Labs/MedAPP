jest.mock("../api", () => ({
  practitionerApi: { listAvailability: jest.fn().mockResolvedValue([]) },
}));
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { render as baseRender } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TEST_METRICS } from "@/test/safe-area";
function SafeArea({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={TEST_METRICS}>{children}</SafeAreaProvider>;
}
const render = (ui: React.ReactElement) => baseRender(ui, { wrapper: SafeArea });
import { ProfessionalAccess } from "../ProfessionalAccess";
import { PractitionerProfileScreen } from "../PractitionerProfileScreen";
import { professionalApi, type ProfessionalProfile } from "../professional-api";
import type { User } from "@/types/user";
import { ApiError } from "@/types/api";
const mockState: { user: User; revision: number } = {
  user: {
    id: "u1",
    email: "u1@example.test",
    displayName: "Ama",
    createdAt: "",
    accountRole: "doctor",
  },
  revision: 1,
};
jest.mock("@/store/auth-store", () => ({ useAuthStore: { getState: () => mockState } }));
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => {
    const owner = mockState.user.id,
      revision = mockState.revision;
    return {
      user: mockState.user,
      owner,
      revision,
      isCurrent: () => mockState.user.id === owner && mockState.revision === revision,
    };
  },
}));
jest.mock("../professional-api", () => ({
  ...jest.requireActual("../professional-api"),
  professionalApi: { getSelf: jest.fn(), updateSelf: jest.fn() },
}));
jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn(), patch: jest.fn() } }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ dispatch: jest.fn() }),
  usePreventRemove: jest.fn(),
}));
const profile: ProfessionalProfile = {
  id: "doc",
  userId: "u1",
  kind: "doctors",
  firstName: "Ama",
  lastName: "Mensah",
  specialty: null,
  bio: "Owner one",
  languages: [],
  photoUrl: null,
  isActive: true,
  isListable: false,
};
const get = jest.mocked(professionalApi.getSelf);
let client: QueryClient;
const tree = (editor = false) => (
  <QueryClientProvider client={client}>
    {editor ? (
      <PractitionerProfileScreen />
    ) : (
      <ProfessionalAccess doctorsOnly>
        <Text>Clinical workspace</Text>
      </ProfessionalAccess>
    )}
  </QueryClientProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  mockState.user = { ...mockState.user, id: "u1", accountRole: "doctor" };
  mockState.revision = 1;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => client.clear());
it.each(["user", "pharmacy", "hospital_admin", "unknown"])(
  "keeps %s accounts out without requesting a clinician record",
  async (role) => {
    mockState.user.accountRole = role;
    render(tree());
    expect(screen.getByText("Workspace access unavailable")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  },
);
it("waits for a valid active self profile before mounting clinical content", async () => {
  let resolve!: (p: ProfessionalProfile) => void;
  get.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(tree());
  expect(screen.queryByText("Clinical workspace")).toBeNull();
  await act(async () => resolve(profile));
  expect(await screen.findByText("Clinical workspace")).toBeTruthy();
});
it("does not mount professional actions for an inactive record", async () => {
  get.mockResolvedValue({ ...profile, isActive: false });
  render(tree());
  expect(await screen.findByText("Professional profile inactive")).toBeTruthy();
  expect(screen.queryByText("Clinical workspace")).toBeNull();
});
it("distinguishes missing activation from a loading failure and retries", async () => {
  get.mockRejectedValueOnce(new ApiError("Missing", 404)).mockResolvedValueOnce(profile);
  render(tree());
  expect(await screen.findByText("Profile activation needed")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Clinical workspace")).toBeTruthy();
});
it("nurses reach their own editor through the nurse contract", async () => {
  mockState.user.accountRole = "nurse";
  get.mockResolvedValue({ ...profile, kind: "nurses" });
  render(tree(true));
  expect(await screen.findByDisplayValue("Owner one")).toBeTruthy();
  expect(get).toHaveBeenCalledWith(
    "nurses",
    "u1",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
it("clears an unsaved draft and cancels old scope when changing accounts", async () => {
  get
    .mockResolvedValueOnce(profile)
    .mockResolvedValueOnce({ ...profile, userId: "u2", bio: "Owner two" });
  const view = render(tree(true));
  await screen.findByDisplayValue("Owner one");
  fireEvent.changeText(screen.getByLabelText("Clinical bio"), "Private draft");
  const oldOptions = get.mock.calls[0][2]!;
  mockState.user = { ...mockState.user, id: "u2" };
  mockState.revision++;
  view.rerender(tree(true));
  expect(await screen.findByDisplayValue("Owner two")).toBeTruthy();
  expect(screen.queryByDisplayValue("Private draft")).toBeNull();
  expect(oldOptions.isSessionCurrent!()).toBe(false);
});
it("hides cached professional details if revalidation is denied", async () => {
  get.mockResolvedValueOnce(profile).mockRejectedValueOnce(new ApiError("Denied", 403));
  render(tree(true));
  await screen.findByDisplayValue("Owner one");
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["professional", "self"] });
  });
  expect(await screen.findByText("Could not load your profile")).toBeTruthy();
  expect(screen.queryByDisplayValue("Owner one")).toBeNull();
});
