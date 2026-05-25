import { z } from "zod";

// Auth form schemas. zodResolver consumes these for runtime validation; the
// inferred types feed react-hook-form's generics.

export const LoginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "At least 8 characters"),
  // Note: no .default(false) here — that desyncs the resolver's input vs
  // output types and trips RHF's generics. defaultValues are supplied at
  // useForm() instead.
  rememberMe: z.boolean(),
});

export type LoginFormValues = z.infer<typeof LoginSchema>;

// Sign-up is a 3-step flow:
//   1. Create account  — name + email + password (this schema)
//   2. Tell us about yourself
//   3. Account security
// Each step has its own schema; the final submit composes them.

export const SignUpStep1Schema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required"),
    middleName: z.string().trim().optional(),
    lastName: z.string().trim().min(1, "Surname is required"),
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
    agreeToTerms: z.boolean(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((d) => d.agreeToTerms, {
    path: ["agreeToTerms"],
    message: "You must agree to continue",
  });

export type SignUpStep1Values = z.infer<typeof SignUpStep1Schema>;

// Step 2 — "Tell us about yourself".
//   - DOB is captured as DD/MM/YYYY across three inputs and normalized to an
//     ISO date string before validation. The refine ensures the date is real
//     (no Feb 30) and the user is at least 13.
//   - bloodType is optional and constrained to the standard ABO+Rh set.
//   - gender and primaryGoal mirror the Stitch radio groups exactly.

export const BloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const Genders = ["female", "male", "nonbinary", "other"] as const;
export const HealthGoals = ["meds", "vitals", "tele", "wellness"] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine(
    (s) => {
      const d = new Date(s + "T00:00:00Z");
      if (Number.isNaN(d.getTime())) return false;
      // Reject impossible calendar dates that Date silently rolls over (e.g.
      // 2024-02-30 → 2024-03-01).
      const [y, m, day] = s.split("-").map(Number);
      return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
    },
    { message: "Enter a valid date" },
  )
  .refine(
    (s) => {
      const dob = new Date(s + "T00:00:00Z");
      const cutoff = new Date();
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 13);
      return dob <= cutoff;
    },
    { message: "You must be at least 13 to sign up" },
  );

export const SignUpStep2Schema = z.object({
  dateOfBirth: isoDate,
  bloodType: z.enum(BloodTypes).optional(),
  gender: z.enum(Genders, { message: "Select an option" }),
  primaryGoal: z.enum(HealthGoals, { message: "Pick a primary goal" }),
});

export type SignUpStep2Values = z.infer<typeof SignUpStep2Schema>;
export type BloodType = (typeof BloodTypes)[number];
export type Gender = (typeof Genders)[number];
export type HealthGoal = (typeof HealthGoals)[number];

// Step 3 — "Secure your account". All three are user preferences; none are
// required to create the account. Defaults mirror the Stitch HTML (biometric
// + data-sharing pre-checked, 2FA opt-in).

export const SignUpStep3Schema = z.object({
  enableBiometric: z.boolean(),
  enableTwoFactor: z.boolean(),
  shareAnonymousData: z.boolean(),
});

export type SignUpStep3Values = z.infer<typeof SignUpStep3Schema>;
