const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock("@/lib/api/client", () => ({
  client: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));
import { authApi } from "../api";
import { ApiError } from "@/types/api";

test("a rotated refresh token is saved before a failing profile read", async () => {
  const order: string[] = [];
  mockPost.mockResolvedValue({
    access_token: "new-access",
    refresh_token: "new-refresh",
    expires_in: 900,
  });
  mockGet.mockImplementation(async () => {
    order.push("profile");
    throw new ApiError("offline", 0);
  });
  const persist = jest.fn(async () => {
    order.push("persist");
  });
  await expect(
    authApi.refresh("old-refresh", { biometric: true, onTokensRotated: persist }),
  ).rejects.toMatchObject({ status: 0 });
  expect(persist).toHaveBeenCalledWith({ accessToken: "new-access", refreshToken: "new-refresh" });
  expect(order).toEqual(["persist", "profile"]);
  expect(mockPost).toHaveBeenCalledWith(
    "/v1/auth/refresh",
    { refresh_token: "old-refresh", biometric: true },
    { withAuth: false },
  );
});
