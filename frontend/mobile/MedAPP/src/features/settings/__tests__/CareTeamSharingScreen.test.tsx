import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { CareTeamSharingScreen } from "../CareTeamSharingScreen";
import { ApiError } from "@/types/api";

jest.setTimeout(90_000);
const mockSearch = jest.fn();
const mockList = jest.fn();
const mockGrant = jest.fn();
const mockRevoke = jest.fn();
let mockOwner = "patient";
let mockRevision = 1;
jest.mock("expo-router", () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn() },
}));
jest.mock("@/features/care/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));
jest.mock("../care-team-api", () => ({
  ...jest.requireActual("../care-team-api"),
  careTeamApi: () => ({ search: mockSearch, list: mockList, grant: mockGrant, revoke: mockRevoke }),
}));
jest.mock("@/lib/api/client", () => ({ client: {} }));
jest.mock("@/store/auth-store", () => ({
  useAuthStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({ revision: mockRevision, user: { id: mockOwner } }),
    {
      getState: () => ({ revision: mockRevision, user: { id: mockOwner }, isAuthenticated: true }),
    },
  ),
}));
const clinician = {
  userId: "doctor-user",
  profileId: "doctor-profile",
  name: "Ama Mensah",
  role: "doctor",
  specialty: "Cardiology",
};
const consent = {
  consent_id: "grant",
  doctor_user_id: "doctor-user",
  patient_id: "record-uuid",
  scope: "records",
  status: "active",
  clinician_display_name: "Ama Mensah",
  clinician_role: "doctor",
  granted_at: "2026-09-13T12:00:00Z",
  expires_at: "2026-10-13T12:00:00Z",
  revoked_at: null,
};
const page = (items: unknown[], next_offset: number | null = null) => ({
  items,
  next_offset,
  offset: 0,
  limit: 25,
});
beforeEach(() => {
  jest.clearAllMocks();
  for (const mock of [mockSearch, mockList, mockGrant, mockRevoke]) mock.mockReset();
  mockOwner = "patient";
  mockRevision = 1;
  mockSearch.mockResolvedValue([clinician]);
  mockList.mockResolvedValue(page([]));
  mockGrant.mockResolvedValue(consent);
  mockRevoke.mockResolvedValue({ ...consent, status: "revoked" });
});
function mount() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CareTeamSharingScreen />
    </QueryClientProvider>,
  );
}
async function choose() {
  mount();
  fireEvent.changeText(screen.getByLabelText("Search clinicians by name or specialty"), "Ama");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Choose Ama Mensah" })).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole("button", { name: "Choose Ama Mensah" }));
}
test("search and clinician selection require a separate confirmation; default is read-only for 30 days", async () => {
  await choose();
  expect(mockGrant).not.toHaveBeenCalled();
  expect(
    screen.getByRole("checkbox", { name: "Also allow this clinician to add vitals" }),
  ).not.toBeChecked();
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Confirm sharing" })));
  expect(mockGrant).toHaveBeenCalledWith("patient", "doctor-user", false, 30);
  expect(await screen.findByText("Sharing permission saved.")).toBeTruthy();
});
test("the patient can choose add-vitals permission and a shorter expiry", async () => {
  await choose();
  fireEvent.press(
    screen.getByRole("checkbox", { name: "Also allow this clinician to add vitals" }),
  );
  fireEvent.press(screen.getByRole("button", { name: "7 days" }));
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Confirm sharing" })));
  expect(mockGrant).toHaveBeenCalledWith("patient", "doctor-user", true, 7);
});
test("cancelling confirmation creates no permission", async () => {
  await choose();
  fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(mockGrant).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Confirm sharing" })).toBeNull();
});
test("revocation requires confirmation and refreshes sharing history", async () => {
  mockList.mockResolvedValue(page([consent]));
  mount();
  fireEvent.press(await screen.findByRole("button", { name: "Revoke access for Ama Mensah" }));
  expect(mockRevoke).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Confirm revoke" })));
  expect(mockRevoke).toHaveBeenCalledWith("patient", "grant");
  expect(await screen.findByText(/Sharing permission revoked/)).toBeTruthy();
});
test("history paginates and expired permissions cannot be revoked from the active UI", async () => {
  mockList.mockImplementation(async (_owner, offset, history) =>
    history
      ? page(
          [{ ...consent, consent_id: `history-${offset}`, status: "expired" }],
          offset ? null : 25,
        )
      : page([]),
  );
  mount();
  fireEvent.press(screen.getByRole("button", { name: "Show sharing history" }));
  fireEvent.press(await screen.findByRole("button", { name: "Load more permissions" }));
  await waitFor(() => expect(mockList).toHaveBeenCalledWith("patient", 25, true));
  expect(screen.queryByRole("button", { name: "Revoke access for Ama Mensah" })).toBeNull();
});
test("failed directory search can retry and switch to nurses", async () => {
  mockSearch.mockRejectedValueOnce(new ApiError("offline", 0)).mockResolvedValue([clinician]);
  mount();
  fireEvent.changeText(screen.getByLabelText("Search clinicians by name or specialty"), "Ama");
  fireEvent.press(await screen.findByRole("button", { name: "Retry clinician search" }));
  await screen.findByRole("button", { name: "Choose Ama Mensah" });
  fireEvent.press(screen.getByRole("button", { name: "Nurses" }));
  await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("nurse", "Ama", expect.anything()));
});
test("lost grant response checks this clinician's actual permission before retrying", async () => {
  mockGrant.mockRejectedValue(new ApiError("offline", 0));
  await choose();
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Confirm sharing" })));
  expect(screen.getByRole("button", { name: "Confirm sharing" })).toBeDisabled();
  mockList.mockResolvedValue(page([consent]));
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Check permission status" })),
  );
  expect(mockList).toHaveBeenCalledWith("patient", 0, false, "doctor-user");
  expect(mockGrant).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/This clinician already has an active permission/)).toBeTruthy();
});
test("late success after account change never appears for the next patient", async () => {
  mockGrant.mockImplementation(async () => {
    mockRevision++;
    mockOwner = "other-patient";
    return consent;
  });
  await choose();
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Confirm sharing" })));
  expect(screen.queryByText("Sharing permission saved.")).toBeNull();
});

test("unsupported legacy scope cannot be mistaken for a successfully saved EHR permission", async () => {
  mockGrant.mockRejectedValue(new ApiError("offline", 0));
  await choose();
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Confirm sharing" })));
  mockList.mockResolvedValue(page([{ ...consent, scope: "legacy-custom-scope" }]));
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Check permission status" })),
  );
  expect(screen.getByRole("button", { name: "Confirm sharing" })).not.toBeDisabled();
  expect(screen.queryByText(/This clinician already has an active permission/)).toBeNull();
});
test("repeated confirmation while saving submits once", async () => {
  let resolve!: (value: unknown) => void;
  mockGrant.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await choose();
  const button = screen.getByRole("button", { name: "Confirm sharing" });
  fireEvent.press(button);
  fireEvent.press(button);
  expect(mockGrant).toHaveBeenCalledTimes(1);
  await act(async () => resolve(consent));
});
