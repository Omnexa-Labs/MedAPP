import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TEST_METRICS } from "@/test/safe-area";
import { ApiError } from "@/types/api";
import { authApi, type SignupOtpVerifyResult } from "../api";
import { SignUpVerifyScreen } from "../SignUpVerifyScreen";

jest.mock("../api", () => ({
  authApi: { signupOtpStart: jest.fn(), signupOtpVerify: jest.fn() },
}));

const start = jest.mocked(authApi.signupOtpStart);
const verify = jest.mocked(authApi.signupOtpVerify);
let client: QueryClient;
let onVerified: jest.Mock;
let onBack: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
  onVerified = jest.fn();
  onBack = jest.fn();
  start.mockResolvedValue({ expiresIn: 300, resendAfterSeconds: 30 });
  verify.mockResolvedValue({ verificationToken: "email-proof", expiresIn: 900 });
});

afterEach(() => {
  cleanup();
  client.clear();
  jest.useRealTimers();
});

function content(email = "patient@example.com") {
  return (
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <QueryClientProvider client={client}>
        <SignUpVerifyScreen email={email} onVerified={onVerified} onBack={onBack} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

async function sendCode() {
  fireEvent.press(screen.getByTestId("signup-verify.send-email"));
  await waitFor(() => expect(screen.getByTestId("signup-verify.submit")).toBeTruthy());
}

test("sends to the signup email and separates expiry from the resend cooldown", async () => {
  render(content(" patient@example.com "));
  expect(screen.getByLabelText("6-digit verification code")).toBeDisabled();
  await sendCode();
  expect(start).toHaveBeenCalledWith({ channel: "email", recipient: "patient@example.com" });
  expect(screen.getByText("Code expires in 5:00")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Resend code in 0:30" })).toBeDisabled();
  fireEvent.press(screen.getByRole("button", { name: "Resend code in 0:30" }));
  expect(start).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(30_000));
  expect(screen.getByText("Code expires in 4:30")).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText("6-digit verification code"), "123456");
  fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
  await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.getByLabelText("6-digit verification code").props.value).toBe(""),
  );
  expect(screen.getByText("Code expires in 5:00")).toBeTruthy();
});

test("passes the server's email proof to the next signup step only after verification", async () => {
  let resolve!: (result: SignupOtpVerifyResult) => void;
  verify.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(content());
  await sendCode();
  expect(screen.getByTestId("signup-verify.submit")).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText("6-digit verification code"), "123456");
  fireEvent.press(screen.getByTestId("signup-verify.submit"));
  fireEvent.press(screen.getByTestId("signup-verify.submit"));
  await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
  expect(verify).toHaveBeenCalledWith({
    channel: "email",
    recipient: "patient@example.com",
    code: "123456",
  });
  expect(onVerified).not.toHaveBeenCalled();
  await act(async () => resolve({ verificationToken: "email-proof", expiresIn: 900 }));
  expect(onVerified).toHaveBeenCalledWith({
    channel: "email",
    recipient: "patient@example.com",
    token: "email-proof",
  });
});

test("keeps a rejected code available to correct without advancing", async () => {
  verify.mockRejectedValue(new ApiError("invalid code", 400));
  render(content());
  await sendCode();
  fireEvent.changeText(screen.getByLabelText("6-digit verification code"), "123456");
  fireEvent.press(screen.getByTestId("signup-verify.submit"));
  await waitFor(() => expect(screen.getByText(/That code is invalid or has expired/)).toBeTruthy());
  expect(onVerified).not.toHaveBeenCalled();
  expect(screen.getByLabelText("6-digit verification code").props.value).toBe("123456");
  fireEvent.changeText(screen.getByLabelText("6-digit verification code"), "654321");
  expect(screen.queryByText(/That code is invalid or has expired/)).toBeNull();
});

test("blocks expired codes and allows requesting a replacement", async () => {
  start.mockResolvedValue({ expiresIn: 40, resendAfterSeconds: 10 });
  render(content());
  await sendCode();
  fireEvent.changeText(screen.getByLabelText("6-digit verification code"), "123456");
  act(() => jest.advanceTimersByTime(40_000));
  expect(screen.getByText("This code has expired. Request a new code.")).toBeTruthy();
  expect(screen.getByLabelText("6-digit verification code")).toBeDisabled();
  expect(screen.getByTestId("signup-verify.submit")).toBeDisabled();
  fireEvent.press(screen.getByTestId("signup-verify.submit"));
  expect(verify).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
  await waitFor(() => expect(screen.queryByText(/This code has expired/)).toBeNull());
  expect(screen.getByLabelText("6-digit verification code")).toBeEnabled();
});

test.each([
  [503, "Email verification is temporarily unavailable"],
  [409, "Looks like you already have an account"],
  [0, "Network error"],
])("reports send failure %s without claiming a code was sent", async (status, message) => {
  start.mockRejectedValue(new ApiError("unavailable", status));
  render(content());
  fireEvent.press(screen.getByTestId("signup-verify.send-email"));
  await waitFor(() => expect(screen.getByText(new RegExp(message))).toBeTruthy());
  expect(screen.queryByTestId("signup-verify.submit")).toBeNull();
  expect(screen.getByLabelText("6-digit verification code")).toBeDisabled();
});

test("shows delivery help and returns to account details to change email", () => {
  render(content());
  fireEvent.press(screen.getByRole("button", { name: "Help" }));
  expect(screen.getByText(/Check your inbox and spam folder/)).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Change email" }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

test("ignores a verification response for an email the user has changed", async () => {
  let resolve!: (result: SignupOtpVerifyResult) => void;
  verify.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = render(content());
  await sendCode();
  fireEvent.changeText(screen.getByLabelText("6-digit verification code"), "123456");
  fireEvent.press(screen.getByTestId("signup-verify.submit"));
  await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
  view.rerender(content("replacement@example.com"));
  await act(async () => resolve({ verificationToken: "old-email-proof", expiresIn: 900 }));
  expect(onVerified).not.toHaveBeenCalled();
  expect(screen.getByTestId("signup-verify.send-email")).toBeTruthy();
  expect(screen.getByText("replacement@example.com")).toBeTruthy();
});

test("ignores verification after leaving the screen", async () => {
  let resolve!: (result: SignupOtpVerifyResult) => void;
  verify.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = render(content());
  await sendCode();
  fireEvent.changeText(screen.getByLabelText("6-digit verification code"), "123456");
  fireEvent.press(screen.getByTestId("signup-verify.submit"));
  await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => resolve({ verificationToken: "email-proof", expiresIn: 900 }));
  expect(onVerified).not.toHaveBeenCalled();
});
