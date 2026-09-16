import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { SignUpStep3Screen } from "../SignUpStep3Screen";
import { SignUpStep3Schema } from "../schema";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

test("failed provider signup has an explicit restart action", () => {
  const restart = jest.fn();
  render(<SignUpStep3Screen errorMessage="Provider proof expired" onRestartProvider={restart} />);
  fireEvent.press(screen.getByRole("button", { name: "Restart provider sign-in" }));
  expect(restart).toHaveBeenCalledTimes(1);
});

test("unavailable options stay off and completing setup grants no sharing or security enrollment", async () => {
  const onSubmit = jest.fn();
  render(<SignUpStep3Screen onSubmit={onSubmit} />);
  for (const control of screen.getAllByRole("switch")) {
    expect(control).toBeDisabled();
    fireEvent.press(control);
    expect(control.props.accessibilityState.checked).toBe(false);
  }
  fireEvent.press(screen.getByRole("button", { name: "Complete setup" }));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith({
      enableBiometric: false,
      enableTwoFactor: false,
      shareWithCareTeam: false,
    }),
  );
  expect(screen.queryByText(/HIPAA-Compliant Security|Last audit:/)).toBeNull();
});

test("the form rejects a request to activate an unavailable option", () => {
  expect(
    SignUpStep3Schema.safeParse({
      enableBiometric: false,
      enableTwoFactor: true,
      shareWithCareTeam: false,
    }).success,
  ).toBe(false);
});

test("skip can complete the account without accepting optional choices", () => {
  const onSkip = jest.fn();
  const onSubmit = jest.fn();
  render(<SignUpStep3Screen onSkip={onSkip} onSubmit={onSubmit} />);
  fireEvent.press(screen.getByRole("button", { name: "Skip security setup for now" }));
  expect(onSkip).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
});

test("an account already created offers sign-in without submitting signup again", () => {
  const onSignIn = jest.fn();
  const onSubmit = jest.fn();
  render(
    <SignUpStep3Screen
      accountCreated
      onSignIn={onSignIn}
      onSubmit={onSubmit}
      onSkip={jest.fn()}
      errorMessage="Your account was created and your details were saved. Sign in to continue."
    />,
  );
  fireEvent.press(screen.getByRole("button", { name: "Sign in to continue" }));
  expect(onSignIn).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.queryByTestId("signup.step3.skip")).toBeNull();
});
