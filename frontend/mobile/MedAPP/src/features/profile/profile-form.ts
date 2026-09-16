import { z } from "zod";
import { BloodTypes, Genders, HealthGoals, SignUpStep2Schema } from "@/features/auth/schema";
import type { UpdateProfilePayload } from "@/features/auth/api";
import type { User } from "@/types/user";

export const GENDER_LABELS: Record<string, string> = {
  female: "Female",
  male: "Male",
  nonbinary: "Non-binary",
  other: "Other",
};
export const GOAL_LABELS: Record<string, string> = {
  meds: "Manage Meds",
  vitals: "Track Vitals",
  tele: "Telemedicine",
  wellness: "Wellness",
};

export function formatProfileDate(iso: string | null | undefined): string {
  return iso?.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3 / $2 / $1") ?? "";
}

export function profileDateToIso(display: string): string | null {
  if (!display.trim()) return null;
  const match = display.trim().match(/^(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "invalid";
}

// Existing records can contain a legacy gender value. Preserve it unless the
// person chooses a supported replacement; never silently clear it on a name edit.
function optionalChoice(options: readonly string[], existing?: string | null) {
  return z
    .string()
    .refine(
      (value) => !value || options.includes(value) || value === existing,
      "Select an available option",
    );
}

export function createProfileSchema(user: User) {
  return z.object({
    firstName: z
      .string()
      .trim()
      .min(1, "First name is required")
      .max(255, "Use no more than 255 characters"),
    lastName: z.string().trim().max(255, "Use no more than 255 characters"),
    dateOfBirth: z.string().superRefine((value, ctx) => {
      const iso = profileDateToIso(value);
      if (iso === null) return;
      if (iso.startsWith("0000-")) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date as DD / MM / YYYY" });
        return;
      }
      const result = SignUpStep2Schema.shape.dateOfBirth.safeParse(iso);
      if (!result.success) {
        const message =
          result.error.issues.some((issue) => issue.message.includes("13")) &&
          !result.error.issues.some((issue) => issue.message.includes("valid date"))
            ? "Date of birth must be for someone aged 13 or older"
            : "Enter a valid date as DD / MM / YYYY";
        ctx.addIssue({ code: "custom", message });
      }
    }),
    gender: optionalChoice(Genders, user.gender),
    bloodType: optionalChoice(BloodTypes, user.bloodType),
    primaryGoal: optionalChoice(HealthGoals, user.primaryGoal),
  });
}

export type ProfileFormValues = z.infer<ReturnType<typeof createProfileSchema>>;

export function profileDefaults(user: User): ProfileFormValues {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    dateOfBirth: formatProfileDate(user.dateOfBirth),
    gender: user.gender ?? "",
    bloodType: user.bloodType ?? "",
    primaryGoal: user.primaryGoal ?? "",
  };
}

export function profileChanges(user: User, values: ProfileFormValues): UpdateProfilePayload {
  const patch: UpdateProfilePayload = {};
  if (values.firstName.trim() !== user.firstName) patch.firstName = values.firstName.trim();
  if (values.lastName.trim() !== user.lastName) patch.lastName = values.lastName.trim();
  const dob = profileDateToIso(values.dateOfBirth);
  if (dob !== (user.dateOfBirth ?? null)) patch.dateOfBirth = dob;
  for (const key of ["gender", "bloodType", "primaryGoal"] as const) {
    if ((values[key] || null) !== (user[key] ?? null)) patch[key] = values[key] || null;
  }
  return patch;
}
