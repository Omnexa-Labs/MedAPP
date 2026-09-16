import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { render as baseRender } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TEST_METRICS } from "@/test/safe-area";
function SafeArea({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={TEST_METRICS}>{children}</SafeAreaProvider>;
}
const render = (ui: React.ReactElement) => baseRender(ui, { wrapper: SafeArea });
import { ProfessionalProfileEditor } from "../PractitionerProfileScreen";
import type { ProfessionalProfile, ProfessionalChanges } from "../professional-api";
jest.mock("@/features/practitioner/use-professional-profile", () => ({
  useProfessionalProfile: jest.fn(),
}));
jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn(), patch: jest.fn() } }));
const mockPrevent = jest.fn(),
  mockDispatch = jest.fn();
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ dispatch: mockDispatch }),
  usePreventRemove: (...args: unknown[]) => mockPrevent(...args),
}));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
}));
const profile: ProfessionalProfile = {
  id: "doc",
  userId: "owner",
  kind: "doctors",
  firstName: "Ama",
  lastName: "Mensah",
  specialty: "Family medicine",
  bio: "My biography",
  languages: ["English"],
  photoUrl: null,
  isActive: true,
  isListable: false,
};
beforeEach(() => jest.clearAllMocks());
it("loads saved fields and keeps unchanged saves disabled", () => {
  render(<ProfessionalProfileEditor profile={profile} onSave={jest.fn()} isCurrent={() => true} />);
  expect(screen.getByDisplayValue("My biography")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});
it("saves only edits once and resets to the server response", async () => {
  let resolve!: (p: ProfessionalProfile) => void;
  const save = jest.fn(
    () =>
      new Promise<ProfessionalProfile>((done) => {
        resolve = done;
      }),
  );
  render(<ProfessionalProfileEditor profile={profile} onSave={save} isCurrent={() => true} />);
  fireEvent.changeText(screen.getByLabelText("Clinical bio"), " Updated ");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith({ bio: "Updated" }, expect.any(AbortSignal));
  expect(screen.getByLabelText("Clinical bio").props.editable).toBe(false);
  await act(async () => resolve({ ...profile, bio: "Updated" }));
  expect(await screen.findByText("Professional profile saved.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});
it("keeps failed edits available for retry", async () => {
  const save = jest
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ ...profile, bio: "Retry me" });
  render(<ProfessionalProfileEditor profile={profile} onSave={save} isCurrent={() => true} />);
  fireEvent.changeText(screen.getByLabelText("Clinical bio"), "Retry me");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText(/Could not save your profile/)).toBeTruthy();
  expect(screen.getByDisplayValue("Retry me")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("Professional profile saved.")).toBeTruthy();
});
it("validates names before making a request", () => {
  const save = jest.fn();
  render(<ProfessionalProfileEditor profile={profile} onSave={save} isCurrent={() => true} />);
  fireEvent.changeText(screen.getByLabelText("Professional first name"), " ");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByText("Enter your professional name.")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});
it("previews unsaved nurse details without writing them or claiming verification", () => {
  const save = jest.fn();
  render(
    <ProfessionalProfileEditor
      profile={{ ...profile, kind: "nurses" }}
      onSave={save}
      isCurrent={() => true}
    />,
  );
  fireEvent.changeText(screen.getByLabelText("Clinical bio"), "Nursing care");
  fireEvent.press(screen.getByRole("button", { name: "Preview profile" }));
  expect(screen.getByText("Preview · Unsaved changes")).toBeTruthy();
  expect(screen.getByText("Nursing care")).toBeTruthy();
  expect(screen.queryByText("Dr. Ama Mensah")).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
it("prevents accidental exit and can discard through the original navigation action", () => {
  render(<ProfessionalProfileEditor profile={profile} onSave={jest.fn()} isCurrent={() => true} />);
  fireEvent.changeText(screen.getByLabelText("Clinical bio"), "Changed");
  const [blocked, onRemove] = mockPrevent.mock.calls.at(-1);
  expect(blocked).toBe(true);
  const action = { type: "GO_BACK" };
  act(() => onRemove({ data: { action } }));
  fireEvent.press(screen.getByRole("button", { name: "Keep editing" }));
  expect(mockDispatch).not.toHaveBeenCalled();
  act(() => onRemove({ data: { action } }));
  fireEvent.press(screen.getByRole("button", { name: "Discard changes" }));
  expect(mockDispatch).toHaveBeenCalledWith(action);
});
it("discards a late save result after account change", async () => {
  let current = true,
    resolve!: (p: ProfessionalProfile) => void;
  const save = jest.fn(
    () =>
      new Promise<ProfessionalProfile>((done) => {
        resolve = done;
      }),
  );
  render(<ProfessionalProfileEditor profile={profile} onSave={save} isCurrent={() => current} />);
  fireEvent.changeText(screen.getByLabelText("Clinical bio"), "Changed");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  current = false;
  await act(async () => resolve({ ...profile, bio: "From old account" }));
  expect(screen.queryByText("Professional profile saved.")).toBeNull();
  expect(screen.queryByDisplayValue("From old account")).toBeNull();
});
it("aborts a pending save when the editor unmounts", () => {
  const save = jest.fn(
    (_changes: ProfessionalChanges, _signal: AbortSignal) =>
      new Promise<ProfessionalProfile>(() => {}),
  );
  const view = render(
    <ProfessionalProfileEditor profile={profile} onSave={save} isCurrent={() => true} />,
  );
  fireEvent.changeText(screen.getByLabelText("Clinical bio"), "Changed");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  const signal = save.mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
});

it("refreshes clean fields while retaining unsaved drafts during background updates", () => {
  const save = jest.fn();
  const view = render(
    <ProfessionalProfileEditor profile={profile} onSave={save} isCurrent={() => true} />,
  );
  view.rerender(
    <ProfessionalProfileEditor
      profile={{ ...profile, bio: "Updated elsewhere" }}
      onSave={save}
      isCurrent={() => true}
    />,
  );
  expect(screen.getByDisplayValue("Updated elsewhere")).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText("Clinical bio"), "My draft");
  view.rerender(
    <ProfessionalProfileEditor
      profile={{ ...profile, bio: "Another update" }}
      onSave={save}
      isCurrent={() => true}
    />,
  );
  expect(screen.getByDisplayValue("My draft")).toBeTruthy();
});
