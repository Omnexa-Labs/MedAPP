import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { ApiError } from "@/types/api";
import type { User } from "@/types/user";
import { EditPatientProfileScreen } from "../EditPatientProfileScreen";

const mockPreventRemove = jest.fn();
const mockDispatch = jest.fn();
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ dispatch: mockDispatch }),
  usePreventRemove: (...args: unknown[]) => mockPreventRemove(...args),
}));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true } }));

const user: User = {
  id: "patient",
  firstName: "Ama Kofi",
  lastName: "de Silva",
  displayName: "Ama Kofi de Silva",
  email: "patient@example.com",
  dateOfBirth: "1990-02-28",
  gender: "female",
  bloodType: "AB-",
  primaryGoal: "vitals",
  createdAt: "",
};

beforeEach(() => jest.clearAllMocks());

test("loads exact name parts and saved details; unchanged form cannot save", () => {
  render(<EditPatientProfileScreen user={user} onSave={jest.fn()} onBack={jest.fn()} />);
  expect(screen.getByDisplayValue("Ama Kofi")).toBeTruthy();
  expect(screen.getByDisplayValue("de Silva")).toBeTruthy();
  expect(screen.getByDisplayValue("28 / 02 / 1990")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Blood type (self-reported): AB-" })).toBeSelected();
});

test("saves only edits once, locks the form in flight, and confirms the server result", async () => {
  let resolve!: (value: User) => void;
  const onSave = jest.fn(
    () =>
      new Promise<User>((done) => {
        resolve = done;
      }),
  );
  render(<EditPatientProfileScreen user={user} onSave={onSave} onBack={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText("First name"), "  Ama Updated  ");
  fireEvent.changeText(screen.getByLabelText("Date of birth"), "");
  fireEvent.press(screen.getByRole("radio", { name: "Blood type (self-reported): Not provided" }));
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave).toHaveBeenCalledWith({
    firstName: "Ama Updated",
    dateOfBirth: null,
    bloodType: null,
  });
  expect(screen.getByLabelText("First name").props.editable).toBe(false);
  await act(async () =>
    resolve({ ...user, firstName: "Ama Updated", dateOfBirth: null, bloodType: null }),
  );
  await waitFor(() => expect(screen.getByText("Profile saved.")).toBeTruthy());
  expect(screen.getByDisplayValue("Ama Updated")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

test("invalid dates and names show field errors without sending a request", async () => {
  const onSave = jest.fn();
  render(<EditPatientProfileScreen user={user} onSave={onSave} onBack={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText("First name"), " ");
  fireEvent.changeText(screen.getByLabelText("Date of birth"), "30/02/1990");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.getByText("First name is required")).toBeTruthy());
  expect(screen.getByText("Enter a valid date as DD / MM / YYYY")).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});

test("a network failure preserves entries and permits a successful retry", async () => {
  const onSave = jest
    .fn()
    .mockRejectedValueOnce(new ApiError("offline", 0))
    .mockResolvedValueOnce({ ...user, lastName: "Mensah" });
  render(<EditPatientProfileScreen user={user} onSave={onSave} onBack={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText("Last name (optional)"), "Mensah");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.getByText(/Check your connection and try again/)).toBeTruthy());
  expect(screen.getByDisplayValue("Mensah")).toBeTruthy();
  expect(screen.queryByText("Profile saved.")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.getByText("Profile saved.")).toBeTruthy());
  expect(onSave).toHaveBeenCalledTimes(2);
});

test("unsaved navigation can keep editing or discard without saving", async () => {
  const onSave = jest.fn();
  render(<EditPatientProfileScreen user={user} onSave={onSave} onBack={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText("First name"), "Draft");
  const action = { type: "GO_BACK" };
  const preventExit = () => {
    const [enabled, callback] = mockPreventRemove.mock.calls.at(-1)!;
    expect(enabled).toBe(true);
    act(() => callback({ data: { action } }));
  };
  preventExit();
  fireEvent.press(screen.getByRole("button", { name: "Keep editing" }));
  expect(mockDispatch).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("Draft")).toBeTruthy();
  preventExit();
  fireEvent.press(screen.getByRole("button", { name: "Discard changes" }));
  expect(mockDispatch).toHaveBeenCalledWith(action);
  expect(onSave).not.toHaveBeenCalled();
});
