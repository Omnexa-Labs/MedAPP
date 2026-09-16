import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { TwoFactorSignIn } from "../TwoFactorSignIn";
import { TwoFactorRequired } from "../api";
import { ApiError } from "@/types/api";

jest.setTimeout(90_000);
const mockVerify = jest.fn();
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
let mockRevision = 1;
jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  authApi: {
    completeTwoFactor: (...args: unknown[]) => mockVerify(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
  },
}));
jest.mock("@/lib/api/client", () => ({ client: {} }));
jest.mock("@/store/auth-store", () => ({
  useAuthStore: { getState: () => ({ revision: mockRevision, signIn: mockSignIn }) },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockRevision = 1;
  mockSignIn.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
});
function show() {
  return render(
    <TwoFactorSignIn
      challenge={new TwoFactorRequired("test-challenge", 300)}
      revision={1}
      onCancel={jest.fn()}
    />,
  );
}
test("invalid code stays on screen without sending a proof", () => {
  show();
  fireEvent.press(screen.getByRole("button", { name: "Verify and sign in" }));
  expect(mockVerify).not.toHaveBeenCalled();
  expect(screen.getByText("Enter the six-digit authenticator code.")).toBeTruthy();
});
test("wrong code can be retried and no session is installed prematurely", async () => {
  mockVerify.mockRejectedValueOnce(new ApiError("Code already used", 400));
  show();
  fireEvent.changeText(screen.getByLabelText("Authenticator code"), "123456");
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Verify and sign in" })),
  );
  expect(screen.getByText("Code already used")).toBeTruthy();
  expect(mockSignIn).not.toHaveBeenCalled();
  mockVerify.mockResolvedValue({
    accessToken: "access",
    refreshToken: "refresh",
    user: { id: "patient" },
  });
  fireEvent.changeText(screen.getByLabelText("Authenticator code"), "654321");
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Verify and sign in" })),
  );
  expect(mockSignIn).toHaveBeenCalledWith("access", { id: "patient" }, "refresh");
});
test("recovery code is supported and duplicate submit is ignored", async () => {
  let done!: (value: unknown) => void;
  mockVerify.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  show();
  fireEvent.press(screen.getByRole("button", { name: "Use a recovery code" }));
  fireEvent.changeText(screen.getByLabelText("Recovery code"), "ABCDE-12345-ABCDE-12345");
  const button = screen.getByRole("button", { name: "Verify and sign in" });
  fireEvent.press(button);
  fireEvent.press(button);
  expect(mockVerify).toHaveBeenCalledTimes(1);
  await act(async () =>
    done({ accessToken: "access", refreshToken: "refresh", user: { id: "patient" } }),
  );
  expect(mockSignIn).toHaveBeenCalledTimes(1);
});
test("late verified response cannot replace a newer account", async () => {
  let done!: (value: unknown) => void;
  mockVerify.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  show();
  fireEvent.changeText(screen.getByLabelText("Authenticator code"), "123456");
  fireEvent.press(screen.getByRole("button", { name: "Verify and sign in" }));
  mockRevision++;
  await act(async () => done({ accessToken: "late", refreshToken: "orphan", user: { id: "old" } }));
  expect(mockSignIn).not.toHaveBeenCalled();
  expect(mockSignOut).toHaveBeenCalledWith("orphan");
});
test("lost response requires a fresh password challenge", async () => {
  mockVerify.mockRejectedValue(new ApiError("offline", 0));
  show();
  fireEvent.changeText(screen.getByLabelText("Authenticator code"), "123456");
  fireEvent.press(screen.getByRole("button", { name: "Verify and sign in" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Verify and sign in" })).toBeDisabled(),
  );
  expect(screen.getByRole("button", { name: "Back to password sign-in" })).toBeEnabled();
});

test("local credential failure after verification offers a fresh sign-in instead of a stuck form", async () => {
  mockVerify.mockResolvedValue({
    accessToken: "access",
    refreshToken: "refresh",
    user: { id: "patient" },
  });
  mockSignIn.mockImplementation(async () => {
    mockRevision++;
    throw new Error("storage failed");
  });
  show();
  fireEvent.changeText(screen.getByLabelText("Authenticator code"), "123456");
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Verify and sign in" })),
  );
  expect(
    screen.getByText("Sign-in couldn't be saved on this device. Start again with your password."),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Verify and sign in" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Back to password sign-in" })).toBeEnabled();
});
