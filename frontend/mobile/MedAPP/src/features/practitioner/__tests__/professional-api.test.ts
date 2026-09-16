import { client } from "@/lib/api/client";
import { professionalApi, professionalKind } from "../professional-api";
import { practitionerApi } from "../api";
import { authApi } from "@/features/auth/api";
import { ApiError } from "@/types/api";
jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn(), patch: jest.fn() } }));
const get = jest.mocked(client.get),
  patch = jest.mocked(client.patch);
const wire = {
  doctor_id: "doc-id",
  nurse_id: "nurse-id",
  user_id: "owner",
  first_name: "Ama",
  last_name: "Mensah",
  specialty: "Family medicine",
  bio: null,
  languages: ["English"],
  photo_url: null,
  is_active: true,
  is_listable: false,
};
beforeEach(() => jest.resetAllMocks());
it.each(["doctors", "nurses"] as const)(
  "loads the authenticated %s identity directly and forwards request scope",
  async (kind) => {
    get.mockResolvedValue(wire);
    const options = { signal: new AbortController().signal, isSessionCurrent: () => true };
    const result = await professionalApi.getSelf(kind, "owner", options);
    expect(get).toHaveBeenCalledWith(`/v1/${kind}/me`, options);
    expect(result).toMatchObject({
      id: kind === "doctors" ? "doc-id" : "nurse-id",
      userId: "owner",
      isListable: false,
    });
  },
);
it("patches the authenticated record, without accepting a route ID", async () => {
  patch.mockResolvedValue({ ...wire, bio: "Changed" });
  const result = await professionalApi.updateSelf("doctors", "owner", { bio: "Changed" });
  expect(patch).toHaveBeenCalledWith("/v1/doctors/me", { bio: "Changed" }, undefined);
  expect(result.bio).toBe("Changed");
});
it("rejects wrong account identities and absent provider IDs", async () => {
  get
    .mockResolvedValueOnce({ ...wire, user_id: "other" })
    .mockResolvedValueOnce({ ...wire, doctor_id: undefined });
  await expect(professionalApi.getSelf("doctors", "owner")).rejects.toMatchObject({ status: 502 });
  await expect(professionalApi.getSelf("doctors", "owner")).rejects.toMatchObject({ status: 502 });
});
it("replaces the legacy full-directory scan and preserves missing-profile semantics", async () => {
  get
    .mockResolvedValueOnce(wire)
    .mockRejectedValueOnce(new ApiError("Missing", 404))
    .mockRejectedValueOnce(new ApiError("Denied", 403));
  expect(await practitionerApi.findMyProfile("owner")).toMatchObject({ doctorId: "doc-id" });
  expect(get).toHaveBeenCalledWith("/v1/doctors/me", undefined);
  expect(await practitionerApi.findMyProfile("owner")).toBeNull();
  await expect(practitionerApi.findMyProfile("owner")).rejects.toMatchObject({ status: 403 });
});
it.each([
  "doctor",
  "nurse",
  "user",
  "pharmacist",
  "hospital_admin",
  "platform_admin",
  "unrecognized",
])("preserves server role %s without inventing application approval", async (role) => {
  get.mockResolvedValue({
    id: "owner",
    email: "owner@example.test",
    first_name: "Ama",
    last_name: "Mensah",
    role,
  });
  const user = await authApi.me();
  expect(user.accountRole).toBe(role);
  expect(user.partner).toBeUndefined();
  expect(professionalKind(user)).toBe(
    role === "doctor" ? "doctors" : role === "nurse" ? "nurses" : undefined,
  );
});
