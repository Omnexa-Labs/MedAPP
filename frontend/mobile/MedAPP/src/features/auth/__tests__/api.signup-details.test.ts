import { client } from "@/lib/api/client";
import { ApiError } from "@/types/api";
import { authApi, SignupSignInError, type SignUpFullPayload } from "../api";

jest.mock("@/lib/api/client", () => ({
  client: { post: jest.fn(), get: jest.fn(), patch: jest.fn() },
}));
const post = jest.mocked(client.post);
const get = jest.mocked(client.get);
const tokens = {
  access_token: "access",
  refresh_token: "refresh",
  token_type: "bearer",
  expires_in: 900,
};
const wireUser = {
  id: "patient-id",
  email: "patient@example.com",
  phone: null,
  first_name: "Ama",
  last_name: "Mensah",
  role: "user",
  dob: "1995-04-12",
  gender: "female",
  blood_type: "AB+",
  primary_goal: "vitals",
  email_verified: true,
  phone_verified: false,
  kyc_status: "not_required",
  is_active: true,
};
const payload: SignUpFullPayload = {
  fullName: "Ama Mensah",
  email: "patient@example.com",
  password: "LocalDetails123!",
  dateOfBirth: "1995-04-12",
  gender: "female",
  bloodType: "AB+",
  primaryGoal: "vitals",
  verification: { channel: "email", recipient: "patient@example.com", token: "email-proof" },
};

beforeEach(() => {
  jest.resetAllMocks();
  post.mockResolvedValueOnce(wireUser).mockResolvedValueOnce(tokens);
  get.mockResolvedValue(wireUser);
});

test("saves all personal details in the account creation request and restores them after login", async () => {
  const result = await authApi.signUpFull(payload);
  expect(post).toHaveBeenNthCalledWith(
    1,
    "/v1/auth/signup",
    {
      email: "patient@example.com",
      password: "LocalDetails123!",
      first_name: "Ama",
      last_name: "Mensah",
      role: "user",
      verification_token: "email-proof",
      dob: "1995-04-12",
      gender: "female",
      blood_type: "AB+",
      primary_goal: "vitals",
    },
    { withAuth: false },
  );
  expect(post).toHaveBeenNthCalledWith(
    2,
    "/v1/auth/login",
    { email: payload.email, password: payload.password },
    { withAuth: false },
  );
  expect(client.patch).not.toHaveBeenCalled();
  expect(result.user).toMatchObject({
    dateOfBirth: payload.dateOfBirth,
    gender: "female",
    bloodType: "AB+",
    primaryGoal: "vitals",
  });
  expect(result.accessToken).toBe("access");
});

test("provider signup sends its linking ticket alongside the independent email proof", async () => {
  await authApi.signUpFull({ ...payload, providerTicket: "provider-proof" });
  expect(post.mock.calls[0][1]).toMatchObject({
    provider_ticket: "provider-proof",
    verification_token: "email-proof",
    role: "user",
  });
});

test("does not fabricate a blood type when the optional field is skipped", async () => {
  get.mockResolvedValue({ ...wireUser, blood_type: null });
  const { bloodType, ...withoutBloodType } = payload;
  const result = await authApi.signUpFull(withoutBloodType);
  expect(post.mock.calls[0][1]).toHaveProperty("blood_type", undefined);
  expect(result.user.bloodType).toBeNull();
});

test("fresh-session me restores details while supporting accounts with absent new fields", async () => {
  expect(await authApi.me()).toMatchObject({
    dateOfBirth: "1995-04-12",
    gender: "female",
    bloodType: "AB+",
    primaryGoal: "vitals",
  });
  get.mockResolvedValue({
    ...wireUser,
    dob: null,
    gender: null,
    blood_type: undefined,
    primary_goal: undefined,
  });
  expect(await authApi.me()).toMatchObject({
    dateOfBirth: null,
    gender: null,
    bloodType: null,
    primaryGoal: null,
  });
});

test("does not attempt login after signup validation fails", async () => {
  post.mockReset().mockRejectedValue(new ApiError("invalid details", 422));
  await expect(authApi.signUpFull(payload)).rejects.toMatchObject({ status: 422 });
  expect(post).toHaveBeenCalledTimes(1);
  expect(get).not.toHaveBeenCalled();
});

test("distinguishes successful account creation from a failed automatic login", async () => {
  post
    .mockReset()
    .mockResolvedValueOnce(wireUser)
    .mockRejectedValueOnce(new ApiError("offline", 0));
  await expect(authApi.signUpFull(payload)).rejects.toBeInstanceOf(SignupSignInError);
  expect(post).toHaveBeenCalledTimes(2);
});
