import { z } from "zod";

// Auth form schemas. zodResolver consumes these for runtime validation; the
// inferred types feed react-hook-form's generics.

export const LoginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required").min(8, "At least 8 characters"),
  // Note: no .default(false) here — that desyncs the resolver's input vs
  // output types and trips RHF's generics. defaultValues are supplied at
  // useForm() instead.
  rememberMe: z.boolean(),
});

export type LoginFormValues = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
});

export const ResetPasswordSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, "Enter the reset code from your email")
      .max(256, "Check the reset code"),
    newPassword: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(128, "Use no more than 128 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type ForgotPasswordValues = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof ResetPasswordSchema>;

// Sign-up is a 3-step flow:
//   1. Create account  — name + email + password (this schema)
//   2. Tell us about yourself
//   3. Account security
// Each step has its own schema; the final submit composes them.

export const SignUpStep1Schema = z
  .object({
    // Collapsed from firstName / middleName / lastName to one field, because
    // the approved Figma frame (1:34, node 301:628) draws a single "Full Name"
    // input. Consequences, FLAGGED for a product decision and NOT yet resolved:
    //   - middleName is no longer captured anywhere in the app. There is no
    //     profile-completion screen that re-collects it; treat this as a
    //     dropped capability until one is designed.
    //   - `authApi.signUpFull` whitespace-splits this string back into
    //     first_name / last_name for the backend, which is lossy for mononyms
    //     and 3+ part names. See the note there.
    fullName: z.string().trim().min(1, "Full name is required"),
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
    // Tightened from length-only: the frame shows the hint "Min 8 characters,
    // 1 number, 1 symbol" (301:655), so the rule has to enforce what it says.
    password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/\d/, "Include at least 1 number")
      .regex(/[^A-Za-z0-9]/, "Include at least 1 symbol"),
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

// Signup has no enrollment/consent flow for these options yet. They remain
// off; completing or skipping this step cannot activate security or sharing.

export const SignUpStep3Schema = z.object({
  enableBiometric: z.literal(false),
  enableTwoFactor: z.literal(false),
  shareWithCareTeam: z.literal(false),
});

export type SignUpStep3Values = z.infer<typeof SignUpStep3Schema>;
