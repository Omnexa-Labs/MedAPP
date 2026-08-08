// A shared link tapped by someone who is not signed in.
//
// This is the likeliest way a share is experienced now that shares carry links
// (@/lib/share-links): the recipient is, by definition, not the sender. The
// router matches `medapp://post-detail?id=…` BEFORE the auth guard runs, and
// the guard's `<Redirect>` replaces the URL — so without the handoff below the
// id is destroyed and the user lands on Home wondering what they tapped.
//
// The two route files are tested together because neither half is worth
// anything alone: the layout that remembers and the sign-in that spends.

import { render } from "@testing-library/react-native";
import { clearPendingLink, takePendingLink } from "@/lib/pending-link";

const mockRedirect = jest.fn();
const mockReplace = jest.fn();
let mockPathname = "/post-detail";
let mockGlobalParams: Record<string, string | string[] | undefined> = { id: "p-42" };

jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
  Stack: () => null,
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => mockGlobalParams,
}));

let mockIsAuthenticated = false;
jest.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: mockIsAuthenticated }),
}));

// The screen is a whole feature tree with its own coverage; what this suite
// cares about is the callback the route hands it.
let capturedOnSuccess: (() => void) | null = null;
jest.mock("@/features/auth/SignInScreen", () => ({
  SignInScreen: (props: { onSuccess: () => void }) => {
    capturedOnSuccess = props.onSuccess;
    return null;
  },
}));

import AppLayout from "../(app)/_layout";
import SignInRoute from "../(public)/sign-in";

beforeEach(() => {
  clearPendingLink();
  mockRedirect.mockReset();
  mockReplace.mockReset();
  capturedOnSuccess = null;
  mockIsAuthenticated = false;
  mockPathname = "/post-detail";
  mockGlobalParams = { id: "p-42" };
});

describe("a shared post opened without a session", () => {
  it("sends the user to sign in and then to the post they tapped", () => {
    render(<AppLayout />);
    expect(mockRedirect).toHaveBeenCalledWith("/(public)/sign-in");

    render(<SignInRoute />);
    capturedOnSuccess!();

    // NOT "/(app)". Landing on Home is the defect: the link resolved, the
    // guard bounced it, and the destination was silently discarded.
    expect(mockReplace).toHaveBeenCalledWith("/post-detail?id=p-42");
  });

  it("goes to Home when there was no link — every ordinary sign-in", () => {
    render(<SignInRoute />);
    capturedOnSuccess!();
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
  });

  it("does not replay the same post on the NEXT sign-in", () => {
    render(<AppLayout />);
    render(<SignInRoute />);
    capturedOnSuccess!();
    expect(mockReplace).toHaveBeenCalledWith("/post-detail?id=p-42");

    mockReplace.mockClear();
    capturedOnSuccess!();
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
  });
});

describe("a signed-in user", () => {
  it("renders the stack and stashes nothing", () => {
    mockIsAuthenticated = true;
    render(<AppLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    // A pending link left behind by an authenticated visit would fire at the
    // next sign-out/sign-in and teleport the user somewhere they never asked
    // to go.
    expect(takePendingLink()).toBeNull();
  });
});

describe("what the guard refuses to stash", () => {
  it("ignores a pathname that is not an in-app absolute path", () => {
    // Defence in depth. `usePathname` is not attacker-controlled today, and
    // the handoff replays straight into `router.replace` — so the refusal
    // lives at the store, where a future caller inherits it.
    mockPathname = "https://evil.example/steal";
    render(<AppLayout />);
    expect(mockRedirect).toHaveBeenCalledWith("/(public)/sign-in");

    render(<SignInRoute />);
    capturedOnSuccess!();
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
  });
});
