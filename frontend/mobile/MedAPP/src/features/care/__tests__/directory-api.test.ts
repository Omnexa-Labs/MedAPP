const mockGet = jest.fn();
jest.mock("@/lib/api/client", () => ({
  client: { get: (...args: unknown[]) => mockGet(...args) },
}));
import { careApi } from "../api";
const person = {
  user_id: "u1",
  first_name: "Ama",
  last_name: "Osei",
  specialty: "cardiology",
  bio: "A saved biography",
  languages: ["English", "Twi", "French"],
  photo_url: null,
  is_active: true,
  is_listable: true,
};
beforeEach(() => mockGet.mockReset());
it("uses pharmacy_id from the real list envelope and does not claim open now", async () => {
  mockGet.mockResolvedValue({
    items: [
      {
        pharmacy_id: "ph1",
        name: "Local Pharmacy",
        city: "Accra",
        insurance_accepted: [],
        operating_hours: { monday: "closed" },
      },
    ],
    total: 2,
    limit: 50,
    offset: 0,
  });
  const page = await careApi.listDirectoryPage("pharmacies");
  expect(page.entries[0].id).toBe("ph1");
  expect(page.entries[0].badges).toEqual([{ label: "Hours listed", tone: "tertiary" }]);
  expect(page.nextOffset).toBe(1);
});
it("carries the server offset and signal into the next pharmacist page", async () => {
  const signal = new AbortController().signal;
  mockGet.mockResolvedValue({
    items: [{ ...person, pharmacist_id: "p1", specialties: ["oncology"] }],
    total: 51,
    limit: 50,
    offset: 50,
  });
  const page = await careApi.listDirectoryPage(
    "pharmacists",
    { q: "Ama Osei", offset: 50 },
    { signal },
  );
  expect(mockGet).toHaveBeenCalledWith("/v1/pharmacists?q=Ama%20Osei&limit=50&offset=50", {
    signal,
  });
  expect(page.nextOffset).toBeNull();
  expect(page.entries[0]).toMatchObject({
    id: "p1",
    specialties: ["oncology"],
    languages: person.languages,
  });
});
it("stops pagination on an empty page even when a changing count is larger", async () => {
  mockGet.mockResolvedValue({ items: [], total: 10, limit: 50, offset: 5 });
  expect((await careApi.listDirectoryPage("pharmacies", { offset: 5 })).nextOffset).toBeNull();
});
it("passes supported specialty filters to the hospital service", async () => {
  mockGet.mockResolvedValue({ items: [] });
  const options = { signal: new AbortController().signal };
  expect(
    await careApi.listDirectoryPage("hospitals", { specialty: "heart care" }, options),
  ).toEqual({ entries: [], total: 0, nextOffset: null });
  expect(mockGet).toHaveBeenCalledWith("/v1/hospitals?specialty=heart%20care", options);
});
it.each(["doctors", "nurses", "pharmacists"] as const)(
  "loads a %s profile from its single-resource endpoint",
  async (kind) => {
    const key = kind === "doctors" ? "doctor_id" : kind === "nurses" ? "nurse_id" : "pharmacist_id";
    mockGet.mockResolvedValue({
      ...person,
      [key]: "id1",
      consultation_fee_cents: 4500,
      home_visit_fee_cents: 0,
      specialties: ["oncology", "dispensing"],
    });
    const options = { signal: new AbortController().signal, isSessionCurrent: () => true };
    const profile = await careApi.getPublicPractitioner(kind, "id1", options);
    expect(mockGet).toHaveBeenCalledWith(`/v1/${kind}/id1`, options);
    expect(profile).toMatchObject({
      id: "id1",
      category: kind,
      bio: person.bio,
      languages: person.languages,
      isActive: true,
      isListable: true,
      avatarUri: "",
    });
    if (kind === "nurses") expect(profile.homeVisitFeeCents).toBe(0);
  },
);
it("rejects a response for another clinician", async () => {
  mockGet.mockResolvedValue({ ...person, doctor_id: "other", consultation_fee_cents: null });
  await expect(careApi.getPublicPractitioner("doctors", "id1")).rejects.toMatchObject({
    status: 502,
  });
});
it("preserves unlisted state and does not turn a missing fee into zero", async () => {
  mockGet.mockResolvedValue({
    ...person,
    doctor_id: "id1",
    consultation_fee_cents: null,
    is_listable: false,
  });
  expect(await careApi.getPublicPractitioner("doctors", "id1")).toMatchObject({
    isListable: false,
    consultationFeeCents: null,
  });
});
