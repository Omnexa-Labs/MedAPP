import type { ProfessionalChanges, ProfessionalProfile } from "./professional-api";
export interface ProfessionalForm {
  firstName: string;
  lastName: string;
  specialty: string;
  bio: string;
  languages: string;
  isListable: boolean;
}
export const professionalDefaults = (profile: ProfessionalProfile): ProfessionalForm => ({
  firstName: profile.firstName,
  lastName: profile.lastName,
  specialty: profile.specialty ?? "",
  bio: profile.bio ?? "",
  languages: profile.languages.join(", "),
  isListable: profile.isListable,
});
const languageList = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
export function professionalErrors(value: ProfessionalForm) {
  const errors: Partial<Record<keyof ProfessionalForm, string>> = {};
  for (const field of ["firstName", "lastName"] as const) {
    if (!value[field].trim()) errors[field] = "Enter your professional name.";
    else if (value[field].trim().length > 255) errors[field] = "Use at most 255 characters.";
  }
  if (value.specialty.trim().length > 255) errors.specialty = "Use at most 255 characters.";
  if (value.bio.trim().length > 10000) errors.bio = "Use at most 10,000 characters.";
  const languages = languageList(value.languages);
  if (languages.length > 20 || languages.some((v) => v.length > 120))
    errors.languages = "Enter up to 20 language names, each at most 120 characters.";
  return errors;
}
export function professionalChanges(
  profile: ProfessionalProfile,
  value: ProfessionalForm,
): ProfessionalChanges {
  const changes: ProfessionalChanges = {};
  if (value.firstName.trim() !== profile.firstName) changes.first_name = value.firstName.trim();
  if (value.lastName.trim() !== profile.lastName) changes.last_name = value.lastName.trim();
  if ((value.specialty.trim() || null) !== profile.specialty)
    changes.specialty = value.specialty.trim() || null;
  if ((value.bio.trim() || null) !== profile.bio) changes.bio = value.bio.trim() || null;
  const languages = languageList(value.languages);
  if (JSON.stringify(languages) !== JSON.stringify(profile.languages))
    changes.languages = languages;
  if (value.isListable !== profile.isListable) changes.is_listable = value.isListable;
  return changes;
}
