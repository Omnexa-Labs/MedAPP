"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { patientRepository } from "@/lib/repositories/patient.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

const GENDER_OPTIONS = ["male", "female", "other"] as const;
const BLOOD_GROUP_OPTIONS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

interface PatientFormValues {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  blood_group: string;
  phone_primary: string;
  phone_secondary: string;
  email: string;
  address_line1: string;
  address_line2: string;
  city: string;
  region: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  insurance_provider: string;
  insurance_policy_number: string;
  allergies: string;
  chronic_conditions: string;
}

export default function NewPatientPage() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PatientFormValues>({
    defaultValues: {
      first_name: "",
      last_name: "",
      date_of_birth: "",
      gender: "",
      blood_group: "",
      phone_primary: "",
      phone_secondary: "",
      email: "",
      address_line1: "",
      address_line2: "",
      city: "",
      region: "",
      emergency_contact_name: "",
      emergency_contact_phone: "",
      insurance_provider: "",
      insurance_policy_number: "",
      allergies: "",
      chronic_conditions: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      patientRepository.create(data),
    onSuccess: () => router.push("/patients"),
  });

  const onSubmit = (values: PatientFormValues) => {
    const payload: Record<string, unknown> = { ...values };

    // Convert comma-separated strings to arrays
    if (values.allergies.trim()) {
      payload.allergies = values.allergies
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      payload.allergies = [];
    }

    if (values.chronic_conditions.trim()) {
      payload.chronic_conditions = values.chronic_conditions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      payload.chronic_conditions = [];
    }

    // Remove empty optional fields
    Object.keys(payload).forEach((key) => {
      if (payload[key] === "") delete payload[key];
    });

    mutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/patients"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            &larr; Back to Patients
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Register Patient
          </h1>
        </div>
      </div>

      {mutation.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to register patient. Please check the form and try again.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Personal Information</CardTitle>
            <CardDescription>
              Basic identifying information for the patient.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  First Name <span className="text-red-500">*</span>
                </label>
                <Input
                  {...register("first_name", {
                    required: "First name is required",
                  })}
                  placeholder="First name"
                />
                {errors.first_name && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.first_name.message}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <Input
                  {...register("last_name", {
                    required: "Last name is required",
                  })}
                  placeholder="Last name"
                />
                {errors.last_name && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.last_name.message}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Date of Birth
                </label>
                <Input type="date" {...register("date_of_birth")} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Gender
                </label>
                <Select {...register("gender")}>
                  <option value="">Select gender</option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Blood Group
                </label>
                <Select {...register("blood_group")}>
                  <option value="">Select blood group</option>
                  {BLOOD_GROUP_OPTIONS.map((bg) => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
            <CardDescription>
              Phone numbers, email, and physical address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Primary Phone
                </label>
                <Input
                  type="tel"
                  {...register("phone_primary")}
                  placeholder="e.g. 020 123 4567"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Secondary Phone
                </label>
                <Input
                  type="tel"
                  {...register("phone_secondary")}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <Input
                  type="email"
                  {...register("email")}
                  placeholder="patient@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Address Line 1
                </label>
                <Input
                  {...register("address_line1")}
                  placeholder="Street address"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Address Line 2
                </label>
                <Input
                  {...register("address_line2")}
                  placeholder="Apt, suite, etc."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  City
                </label>
                <Input {...register("city")} placeholder="City" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Region
                </label>
                <Input {...register("region")} placeholder="Region" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Emergency Contact</CardTitle>
            <CardDescription>
              Person to contact in case of emergency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Contact Name
                </label>
                <Input
                  {...register("emergency_contact_name")}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Contact Phone
                </label>
                <Input
                  type="tel"
                  {...register("emergency_contact_phone")}
                  placeholder="Phone number"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Medical Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Medical Information</CardTitle>
            <CardDescription>
              Allergies and chronic conditions (comma-separated).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Allergies{" "}
                  <span className="text-xs text-slate-400">
                    (comma-separated)
                  </span>
                </label>
                <Textarea
                  {...register("allergies")}
                  placeholder="e.g. Penicillin, Peanuts, Latex"
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Chronic Conditions{" "}
                  <span className="text-xs text-slate-400">
                    (comma-separated)
                  </span>
                </label>
                <Textarea
                  {...register("chronic_conditions")}
                  placeholder="e.g. Diabetes, Hypertension"
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Insurance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Insurance</CardTitle>
            <CardDescription>
              Health insurance details, if available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Insurance Provider
                </label>
                <Input
                  {...register("insurance_provider")}
                  placeholder="Provider name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Policy Number
                </label>
                <Input
                  {...register("insurance_policy_number")}
                  placeholder="Policy number"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <Link href="/patients">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Registering..." : "Register Patient"}
          </Button>
        </div>
      </form>
    </div>
  );
}
