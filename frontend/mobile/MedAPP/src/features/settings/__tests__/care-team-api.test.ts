import { client } from "@/lib/api/client";
import { careTeamApi } from "../care-team-api";

jest.mock("@/lib/api/client", () => ({
  client: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
const current = () => true;
const api = careTeamApi(current);
beforeEach(() => jest.clearAllMocks());

test.each(["doctor", "nurse"] as const)(
  "%s directory retains identity UUID and filters unavailable clinicians",
  async (role) => {
    const person = {
      user_id: "identity-uuid",
      doctor_id: "doctor-profile",
      nurse_id: "nurse-profile",
      first_name: "Ama",
      last_name: "Mensah",
      specialty: "Cardiology",
      is_active: true,
      is_listable: true,
    };
    jest
      .mocked(client.get)
      .mockResolvedValue({
        items: [person, { ...person, is_active: false }, { ...person, is_listable: false }],
      });
    const result = await api.search(role, " Ama ");
    expect(result).toEqual([
      {
        userId: "identity-uuid",
        profileId: `${role}-profile`,
        name: "Ama Mensah",
        specialty: "Cardiology",
        role,
      },
    ]);
    expect(client.get).toHaveBeenCalledWith(
      `/v1/${role}s?q=Ama&only_listable=true`,
      expect.objectContaining({ isSessionCurrent: current }),
    );
  },
);

test("grant sends explicit scope and duration to the patient identity endpoint", async () => {
  await api.grant("patient/user", "clinician-user", false, 30);
  expect(client.post).toHaveBeenLastCalledWith(
    "/v1/patients/patient%2Fuser/consents",
    expect.objectContaining({
      doctor_user_id: "clinician-user",
      scope: "records",
      expires_in_days: 30,
    }),
    { isSessionCurrent: current },
  );
  await api.grant("patient/user", "clinician-user", true, 7);
  expect(client.post).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ scope: "records_and_vitals", expires_in_days: 7 }),
    expect.any(Object),
  );
});

test("history and outcome checks preserve paging and clinician filters", async () => {
  await api.list("owner", 25, true, "doctor");
  expect(client.get).toHaveBeenCalledWith(
    "/v1/patients/owner/consents?offset=25&limit=25&include_inactive=true&clinician_user_id=doctor",
    { isSessionCurrent: current },
  );
  await api.revoke("owner", "grant/uuid");
  expect(client.delete).toHaveBeenCalledWith("/v1/patients/owner/consents/grant%2Fuuid", {
    isSessionCurrent: current,
  });
});

test("prescribing requires an explicit permission choice", async () => {
  await api.grant("patient", "doctor", false, 30, true);
  expect(client.post).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ scope: "records_and_prescriptions" }), expect.any(Object));
});
