import { client } from "@/lib/api/client";
import { authApi } from "@/features/auth/api";
import { ApiError } from "@/types/api";

jest.mock("@/lib/api/client", () => ({ client: { patch: jest.fn(), get: jest.fn() } }));
const wireUser = {
  id: "patient",
  email: "patient@example.com",
  first_name: "Ama Kofi",
  last_name: "de Silva",
  dob: null,
  gender: "female",
  blood_type: null,
  primary_goal: "vitals",
};

beforeEach(() => jest.resetAllMocks());

test("PATCH uses the authenticated self endpoint, keeps null, and restores exact name parts", async () => {
  jest.mocked(client.patch).mockResolvedValue(wireUser);
  const result = await authApi.updateProfile({
    firstName: "Ama Kofi",
    bloodType: null,
    dateOfBirth: null,
  });
  const [path, body] = jest.mocked(client.patch).mock.calls[0];
  expect(path).toBe("/v1/me");
  // JSON serialization drops omitted fields while preserving explicit clears.
  expect(JSON.parse(JSON.stringify(body))).toEqual({
    first_name: "Ama Kofi",
    blood_type: null,
    dob: null,
  });
  expect(result).toMatchObject({
    firstName: "Ama Kofi",
    lastName: "de Silva",
    displayName: "Ama Kofi de Silva",
    bloodType: null,
  });
  expect(client.get).not.toHaveBeenCalled();
});

test("failed saves propagate the original status for the editor to offer retry", async () => {
  const error = new ApiError("offline", 0);
  jest.mocked(client.patch).mockRejectedValue(error);
  await expect(authApi.updateProfile({ primaryGoal: "wellness" })).rejects.toBe(error);
});
