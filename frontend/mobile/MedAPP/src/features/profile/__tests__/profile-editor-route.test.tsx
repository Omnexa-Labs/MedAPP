import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { authApi } from "@/features/auth/api";
import EditPatientProfileRoute from "@/app/(app)/edit-patient-profile";
import type { User } from "@/types/user";

const mockSetUser = jest.fn();
const patient: User = {
  id: "patient",
  firstName: "Ama",
  lastName: "Kofi",
  displayName: "Ama Kofi",
  email: "patient@example.com",
  createdAt: "",
};
let mockSession = { user: patient as User | null, isAuthenticated: true, setUser: mockSetUser };
jest.mock("@/store/auth-store", () => ({
  useAuthStore: Object.assign(
    (selector: (s: typeof mockSession) => unknown) => selector(mockSession),
    { getState: () => mockSession },
  ),
}));
jest.mock("@/features/auth/api", () => ({ authApi: { me: jest.fn(), updateProfile: jest.fn() } }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock("@/features/profile/EditPatientProfileScreen", () => ({
  EditPatientProfileScreen: ({
    user,
    onSave,
  }: {
    user: User;
    onSave: (p: object) => Promise<User>;
  }) => {
    const React = require("react");
    const { Text, Pressable } = require("react-native");
    const [status, setStatus] = React.useState("");
    return (
      <>
        <Text>{user.firstName}</Text>
        <Text>{status}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Submit profile"
          onPress={() =>
            onSave({ firstName: "Updated" }).then(
              () => setStatus("Saved"),
              () => setStatus("Failed"),
            )
          }
        >
          <Text>Submit</Text>
        </Pressable>
      </>
    );
  },
}));

function mount(cached?: User) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  if (cached) client.setQueryData(["patient-profile-editor", cached.id], cached);
  render(
    <QueryClientProvider client={client}>
      <EditPatientProfileRoute />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { user: patient, isAuthenticated: true, setUser: mockSetUser };
  jest.mocked(authApi.me).mockResolvedValue(patient);
});

test("loads fresh profile data, saves once, and updates the auth store and editor cache", async () => {
  const updated = { ...patient, firstName: "Updated", displayName: "Updated Kofi" };
  jest.mocked(authApi.updateProfile).mockResolvedValue(updated);
  const client = mount();
  await waitFor(() => expect(screen.getByText("Ama")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Submit profile"));
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  expect(mockSetUser).toHaveBeenCalledWith(updated);
  expect(client.getQueryData(["patient-profile-editor", patient.id])).toEqual(updated);
});

test("a failed initial load offers a real retry before fields are shown", async () => {
  jest
    .mocked(authApi.me)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(patient);
  mount();
  await waitFor(() => expect(screen.getByText("Couldn't load your profile")).toBeTruthy());
  expect(screen.queryByLabelText("Submit profile")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.getByText("Ama")).toBeTruthy());
  expect(authApi.me).toHaveBeenCalledTimes(2);
});

test("a failed fresh load never opens the editor using a previously cached profile", async () => {
  jest.mocked(authApi.me).mockRejectedValueOnce(new Error("offline"));
  mount({ ...patient, firstName: "Outdated" });
  await waitFor(() => expect(screen.getByText("Couldn't load your profile")).toBeTruthy());
  expect(screen.queryByLabelText("Submit profile")).toBeNull();
  expect(screen.queryByText("Outdated")).toBeNull();
});

test.each(["signed out", "different patient"])("ignores a delayed save after %s", async (state) => {
  let resolve!: (user: User) => void;
  jest.mocked(authApi.updateProfile).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const client = mount();
  await waitFor(() => expect(screen.getByText("Ama")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Submit profile"));
  mockSession = {
    user: state === "signed out" ? null : { ...patient, id: "other" },
    isAuthenticated: state !== "signed out",
    setUser: mockSetUser,
  };
  await act(async () => resolve({ ...patient, firstName: "Updated" }));
  await waitFor(() => expect(screen.getByText("Failed")).toBeTruthy());
  expect(mockSetUser).not.toHaveBeenCalled();
  expect(client.getQueryData(["patient-profile-editor", patient.id])).toEqual(patient);
});

test("does not send an edit after the account changed before submission", async () => {
  mount();
  await waitFor(() => expect(screen.getByText("Ama")).toBeTruthy());
  mockSession = { user: { ...patient, id: "other" }, isAuthenticated: true, setUser: mockSetUser };
  fireEvent.press(screen.getByLabelText("Submit profile"));
  await waitFor(() => expect(screen.getByText("Failed")).toBeTruthy());
  expect(authApi.updateProfile).not.toHaveBeenCalled();
});
