"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { staffRepository } from "@/lib/repositories/staff.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

const TITLE_OPTIONS = ["Dr.", "Nurse", "Mr.", "Mrs.", "Ms."] as const;

interface StaffFormValues {
  first_name: string;
  last_name: string;
  employee_id: string;
  title: string;
  specialty: string;
  qualification: string;
  department_id: string;
}

export default function NewStaffPage() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StaffFormValues>({
    defaultValues: {
      first_name: "",
      last_name: "",
      employee_id: "",
      title: "",
      specialty: "",
      qualification: "",
      department_id: "",
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () =>
      staffRepository.listDepartments({ limit: 100 }).then((r) => r.data),
  });

  const departmentItems: Record<string, unknown>[] = Array.isArray(
    departments?.items
  )
    ? departments.items
    : Array.isArray(departments)
      ? departments
      : [];

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => staffRepository.create(data),
    onSuccess: () => router.push("/staff"),
  });

  const onSubmit = (values: StaffFormValues) => {
    const payload: Record<string, unknown> = { ...values };

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
            href="/staff"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            &larr; Back to Staff
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Add Staff Member
          </h1>
        </div>
      </div>

      {mutation.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to create staff member. Please check the form and try again.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Personal Information</CardTitle>
            <CardDescription>
              Name and professional details for the staff member.
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
                  Employee ID
                </label>
                <Input
                  {...register("employee_id")}
                  placeholder="e.g. EMP-001"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Title
                </label>
                <Select {...register("title")}>
                  <option value="">Select title</option>
                  {TITLE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Specialty
                </label>
                <Input
                  {...register("specialty")}
                  placeholder="e.g. Cardiology"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Qualification
                </label>
                <Input
                  {...register("qualification")}
                  placeholder="e.g. MD, BSc Nursing"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Department Assignment */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Department Assignment</CardTitle>
            <CardDescription>
              Assign the staff member to a department.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-sm">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Department
              </label>
              <Select {...register("department_id")}>
                <option value="">Select department</option>
                {departmentItems.map((dept) => (
                  <option
                    key={dept.department_id as string}
                    value={dept.department_id as string}
                  >
                    {dept.name as string}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <Link href="/staff">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating..." : "Create Staff Member"}
          </Button>
        </div>
      </form>
    </div>
  );
}
