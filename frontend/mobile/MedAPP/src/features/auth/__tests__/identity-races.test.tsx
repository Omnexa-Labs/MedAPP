import { act, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLogin } from "../hooks/use-login";
import { useSignUp } from "../hooks/use-signup";
import { SignupSignInError, TwoFactorRequired } from "../api";

const mockLogin = jest.fn();
const mockSignUp = jest.fn();
const mockSignIn = jest.fn();
let mockRevision = 0;
jest.mock("@/lib/api/client", () => ({ client: {} }));
jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  authApi: {
    login: (...args: unknown[]) => mockLogin(...args),
    signUpFull: (...args: unknown[]) => mockSignUp(...args),
  },
}));
jest.mock("@/store/auth-store", () => ({
  AuthSessionChanged: class extends Error {},
  useAuthStore: Object.assign(
    (selector: (state: { signIn: typeof mockSignIn }) => unknown) =>
      selector({ signIn: mockSignIn }),
    { getState: () => ({ revision: mockRevision }) },
  ),
}));
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: 0, gcTime: 0 } } })}
    >
      {children}
    </QueryClientProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRevision = 1;
  mockSignIn.mockResolvedValue(undefined);
});
const response = {
  accessToken: "new-access",
  refreshToken: "new-refresh",
  user: { id: "patient-a" },
};

test("a late two-factor challenge is discarded after an account change", async () => {
  mockLogin.mockImplementation(async () => {
    mockRevision++;
    throw new TwoFactorRequired("old-challenge", 300);
  });
  const { result } = renderHook(useLogin, { wrapper });
  await act(async () => {
    await expect(
      result.current.mutateAsync({ email: "patient@example.com", password: "Password123!" }),
    ).rejects.not.toBeInstanceOf(TwoFactorRequired);
  });
  expect(mockSignIn).not.toHaveBeenCalled();
});

test("a late password response cannot replace a newer account", async () => {
  let resolve!: (value: typeof response) => void;
  mockLogin.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { result } = renderHook(useLogin, { wrapper });
  await act(async () => {
    const login = result.current.mutateAsync({
      email: "patient@example.com",
      password: "Password123!",
    });
    const rejected = expect(login).rejects.toBeInstanceOf(Error);
    await Promise.resolve();
    mockRevision++;
    resolve(response);
    await rejected;
  });
  expect(mockSignIn).not.toHaveBeenCalled();
});

test("account creation completed after an account switch offers sign-in without replacing it", async () => {
  mockSignUp.mockImplementation(async () => {
    mockRevision++;
    return response;
  });
  const { result } = renderHook(useSignUp, { wrapper });
  await act(async () => {
    await expect(
      result.current.mutateAsync({
        fullName: "Ama Mensah",
        email: "patient@example.com",
        password: "Password123!",
        dateOfBirth: "1995-04-12",
        gender: "female",
        primaryGoal: "wellness",
      }),
    ).rejects.toBeInstanceOf(SignupSignInError);
  });
  expect(mockSignIn).not.toHaveBeenCalled();
});

test("a saved account with a failed local sign-in retains the account-created error contract", async () => {
  mockSignUp.mockResolvedValue(response);
  mockSignIn.mockRejectedValueOnce(new Error("storage failed"));
  const { result } = renderHook(useSignUp, { wrapper });
  await act(async () => {
    await expect(
      result.current.mutateAsync({
        fullName: "Ama Mensah",
        email: "patient@example.com",
        password: "Password123!",
        dateOfBirth: "1995-04-12",
        gender: "female",
        primaryGoal: "wellness",
      }),
    ).rejects.toBeInstanceOf(SignupSignInError);
  });
  expect(mockSignUp).toHaveBeenCalledTimes(1);
});
