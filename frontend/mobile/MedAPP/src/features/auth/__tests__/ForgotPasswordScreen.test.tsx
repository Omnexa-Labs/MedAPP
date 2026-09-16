import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { ApiError } from "@/types/api";
import { authApi } from "../api";
import { ForgotPasswordScreen } from "../ForgotPasswordScreen";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: jest.fn() },
}));
jest.mock("../api", () => ({
  authApi: { requestPasswordReset: jest.fn(), resetPassword: jest.fn() },
}));

const requestCode = jest.mocked(authApi.requestPasswordReset);
const resetPassword = jest.mocked(authApi.resetPassword);

beforeEach(() => {
  jest.clearAllMocks();
  requestCode.mockResolvedValue({ resendAfterSeconds: 30 });
  resetPassword.mockResolvedValue(undefined);
});

function enterResetDetails(confirmPassword = "newpassword123") {
  fireEvent.changeText(screen.getByLabelText("Reset code"), "email-reset-code");
  fireEvent.changeText(screen.getByLabelText("New password"), "newpassword123");
  fireEvent.changeText(screen.getByLabelText("Confirm new password"), confirmPassword);
}

test("validates email before requesting recovery", async () => {
  render(<ForgotPasswordScreen />);
  fireEvent.changeText(screen.getByLabelText("Email address"), "invalid");
  fireEvent.press(screen.getByText("Send reset code"));
  await waitFor(() => expect(screen.getByText("Enter a valid email")).toBeTruthy());
  expect(requestCode).not.toHaveBeenCalled();
});

test("accepts a trimmed email and prevents immediate resend", async () => {
  render(<ForgotPasswordScreen />);
  fireEvent.changeText(screen.getByLabelText("Email address"), " patient@example.com ");
  fireEvent.press(screen.getByText("Send reset code"));
  await waitFor(() => expect(screen.getByTestId("recovery-request-accepted")).toBeTruthy());
  expect(requestCode).toHaveBeenCalledWith("patient@example.com");
  expect(screen.getByText(/If an account exists for patient@example.com/)).toBeTruthy();
  fireEvent.press(screen.getByText(/^Resend code in \d+s$/));
  expect(requestCode).toHaveBeenCalledTimes(1);
});

test("keeps the request form and reports unavailable email delivery", async () => {
  requestCode.mockRejectedValue(new ApiError("unavailable", 503));
  render(<ForgotPasswordScreen />);
  fireEvent.changeText(screen.getByLabelText("Email address"), "patient@example.com");
  fireEvent.press(screen.getByText("Send reset code"));
  await waitFor(() =>
    expect(screen.getByText(/Password recovery is temporarily unavailable/)).toBeTruthy(),
  );
  expect(screen.getByLabelText("Email address").props.value).toBe("patient@example.com");
  expect(screen.queryByLabelText("Reset code")).toBeNull();
});

test("rejects mismatched passwords without sending a reset", async () => {
  render(<ForgotPasswordScreen />);
  fireEvent.press(screen.getByText("I already have a reset code"));
  enterResetDetails("differentpassword");
  fireEvent.press(screen.getByText("Update password"));
  await waitFor(() => expect(screen.getByText("Passwords do not match")).toBeTruthy());
  expect(resetPassword).not.toHaveBeenCalled();
});

test("invalid or expired code keeps entered details available to correct", async () => {
  resetPassword.mockRejectedValue(new ApiError("invalid token", 400));
  render(<ForgotPasswordScreen />);
  fireEvent.press(screen.getByText("I already have a reset code"));
  enterResetDetails();
  fireEvent.press(screen.getByText("Update password"));
  await waitFor(() =>
    expect(screen.getByText(/This reset code is invalid or has expired/)).toBeTruthy(),
  );
  expect(screen.getByLabelText("New password").props.value).toBe("newpassword123");
  expect(screen.queryByTestId("recovery-complete")).toBeNull();
});

test("shows completion only after the server confirms and returns to sign in", async () => {
  let complete!: () => void;
  resetPassword.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  render(<ForgotPasswordScreen />);
  fireEvent.press(screen.getByText("I already have a reset code"));
  enterResetDetails();
  fireEvent.press(screen.getByText("Update password"));
  await waitFor(() =>
    expect(resetPassword).toHaveBeenCalledWith({
      token: "email-reset-code",
      newPassword: "newpassword123",
    }),
  );
  expect(screen.queryByTestId("recovery-complete")).toBeNull();
  await act(async () => {
    complete();
  });
  expect(screen.getByTestId("recovery-complete")).toBeTruthy();
  expect(screen.queryByLabelText("New password")).toBeNull();
  fireEvent.press(screen.getByText("Back to sign in"));
  expect(router.replace).toHaveBeenCalledWith("/(public)/sign-in");
});

test("network failure does not claim the password changed", async () => {
  resetPassword.mockRejectedValue(new ApiError("offline", 0));
  render(<ForgotPasswordScreen />);
  fireEvent.press(screen.getByText("I already have a reset code"));
  enterResetDetails();
  fireEvent.press(screen.getByText("Update password"));
  await waitFor(() =>
    expect(screen.getByText(/Your password hasn't been confirmed as changed/)).toBeTruthy(),
  );
  expect(screen.queryByTestId("recovery-complete")).toBeNull();
});
