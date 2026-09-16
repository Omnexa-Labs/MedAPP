import {
  professionalChanges,
  professionalDefaults,
  professionalErrors,
} from "../professional-profile-form";
import type { ProfessionalProfile } from "../professional-api";
const profile: ProfessionalProfile = {
  id: "doc",
  userId: "owner",
  kind: "doctors",
  firstName: "Ama",
  lastName: "Mensah",
  specialty: "Care",
  bio: "A biography",
  languages: ["English"],
  photoUrl: null,
  isActive: true,
  isListable: false,
};
it("unchanged values do not generate a save", () =>
  expect(professionalChanges(profile, professionalDefaults(profile))).toEqual({}));
it("sends only changed fields and clears optional values explicitly", () => {
  expect(
    professionalChanges(profile, {
      ...professionalDefaults(profile),
      bio: " ",
      languages: " English, Twi, Twi ",
      isListable: true,
    }),
  ).toEqual({ bio: null, languages: ["English", "Twi"], is_listable: true });
});
it.each(["firstName", "lastName"] as const)("rejects empty %s", (field) =>
  expect(
    professionalErrors({ ...professionalDefaults(profile), [field]: " " })[field],
  ).toBeTruthy(),
);
it("bounds biography and languages to the service contract", () => {
  expect(
    professionalErrors({
      ...professionalDefaults(profile),
      bio: "x".repeat(10001),
      languages: Array.from({ length: 21 }, (_, i) => `Language ${i}`).join(","),
    }),
  ).toMatchObject({ bio: expect.any(String), languages: expect.any(String) });
});
