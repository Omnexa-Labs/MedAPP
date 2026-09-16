import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import SignUpStep3Route from "@/app/(public)/sign-up-step-3";
import { SignupSignInError } from "../api";

jest.mock("@/lib/api/client", () => ({ client: { post: jest.fn(), get: jest.fn() } }));

const mockMutateAsync = jest.fn();
const mockDraft = {
  step1: { fullName: "Ama Mensah", email: "patient@example.com", password: "LocalDetails123!" },
  step2: { dateOfBirth: "1995-04-12", gender: "female", bloodType: "AB+", primaryGoal: "vitals" },
  verification: { channel: "email", recipient: "patient@example.com", token: "proof" },
  reset: jest.fn(),
};

jest.mock("expo-router", () => ({
  Redirect: () => null,
  router: { replace: jest.fn(), canGoBack: jest.fn(), back: jest.fn() },
}));
jest.mock("../hooks/use-signup-draft", () => ({ useSignUpDraft: () => mockDraft }));
jest.mock("../hooks/use-signup", () => ({
  useSignUp: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));
jest.mock("../SignUpStep3Screen", () => {
  const { View, Text, Pressable } = require("react-native");
  return {
    SignUpStep3Screen: ({
      onSubmit,
      onSkip,
      onSignIn,
      accountCreated,
      errorMessage,
    }: {
      onSubmit?: () => void;
      onSkip?: () => void;
      onSignIn?: () => void;
      accountCreated?: boolean;
      errorMessage?: string | null;
    }) => (
      <View>
        <Pressable testID="complete" onPress={onSubmit} />
        <Pressable testID="skip" onPress={onSkip} />
        {accountCreated ? <Pressable testID="sign-in" onPress={onSignIn} /> : null}
        <Text>{errorMessage}</Text>
      </View>
    ),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMutateAsync.mockReset().mockResolvedValue(undefined);
});

test("skip saves the personal details and clears the draft without activating options", async () => {
  render(<SignUpStep3Route />);
  fireEvent.press(screen.getByTestId("skip"));
  await waitFor(() => expect(mockDraft.reset).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).toHaveBeenCalledWith({
    ...mockDraft.step1,
    ...mockDraft.step2,
    verification: mockDraft.verification,
  });
  expect(router.replace).toHaveBeenCalledWith("/(app)");
});

test("duplicate taps create only one account while the request is pending", async () => {
  let resolve!: () => void;
  mockMutateAsync.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render(<SignUpStep3Route />);
  fireEvent.press(screen.getByTestId("complete"));
  fireEvent.press(screen.getByTestId("skip"));
  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
});

test("a confirmed account with failed automatic login cannot be submitted a second time", async () => {
  mockMutateAsync.mockRejectedValue(new SignupSignInError());
  render(<SignUpStep3Route />);
  fireEvent.press(screen.getByTestId("complete"));
  await waitFor(() => expect(screen.getByTestId("sign-in")).toBeTruthy());
  expect(screen.getByText(/Your account was created and your details were saved/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("complete"));
  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByTestId("sign-in"));
  expect(mockDraft.reset).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith("/(public)/sign-in");
});
