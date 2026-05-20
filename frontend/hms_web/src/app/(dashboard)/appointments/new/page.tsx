"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { appointmentRepository } from "@/lib/repositories/appointment.repository";
import { patientRepository } from "@/lib/repositories/patient.repository";
import { staffRepository } from "@/lib/repositories/staff.repository";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const APPOINTMENT_TYPES = [
  { value: "checkup", label: "Checkup" },
  { value: "follow_up", label: "Follow Up" },
  { value: "emergency", label: "Emergency" },
  { value: "consultation", label: "Consultation" },
] as const;

interface AppointmentFormValues {
  patient_id: string;
  doctor_staff_id: string;
  department_id: string;
  appointment_type: string;
  scheduled_date: string;
  scheduled_start: string;
  scheduled_end: string;
  reason: string;
}

export default function NewAppointmentPage() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AppointmentFormValues>({
    defaultValues: {
      patient_id: "",
      doctor_staff_id: "",
      department_id: "",
      appointment_type: "",
      scheduled_date: "",
      scheduled_start: "",
      scheduled_end: "",
      reason: "",
    },
  });

  // Fetch patients for select
  const { data: patientsData } = useQuery({
    queryKey: ["patients-select"],
    queryFn: () =>
      patientRepository.list({ limit: 100 }).then((r) => r.data),
  });

  // Fetch staff for select
  const { data: staffData } = useQuery({
    queryKey: ["staff-select"],
    queryFn: () =>
      staffRepository.list({ limit: 100 }).then((r) => r.data),
  });

  // Fetch departments for select
  const { data: departmentsData } = useQuery({
    queryKey: ["departments-select"],
    queryFn: () =>
      staffRepository.listDepartments({ limit: 100 }).then((r) => r.data),
  });

  const patients = Array.isArray(patientsData?.items)
    ? patientsData.items
    : Array.isArray(patientsData)
      ? patientsData
      : [];

  const staff = Array.isArray(staffData?.items)
    ? staffData.items
    : Array.isArray(staffData)
      ? staffData
      : [];

  const departments = Array.isArray(departmentsData?.items)
    ? departmentsData.items
    : Array.isArray(departmentsData)
      ? departmentsData
      : [];

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      appointmentRepository.create(data),
    onSuccess: () => router.push("/appointments"),
  });

  const onSubmit = (values: AppointmentFormValues) => {
    const payload: Record<string, unknown> = {};

    // Only include non-empty fields
    Object.entries(values).forEach(([key, value]) => {
      if (value && value.trim()) {
        payload[key] = value.trim();
      }
    });

    mutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Book Appointment</h1>
        <Link href="/appointments">
          <Button variant="outline">Cancel</Button>
        </Link>
      </div>

      {mutation.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to book appointment. Please check the form and try again.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Appointment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Patient and Doctor */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Patient <span className="text-red-500">*</span>
                </label>
                <Select
                  {...register("patient_id", {
                    required: "Patient is required",
                  })}
                >
                  <option value="">Select a patient</option>
                  {patients.map((p: Record<string, unknown>) => (
                    <option
                      key={p.patient_id as string}
                      value={p.patient_id as string}
                    >
                      {p.first_name as string} {p.last_name as string}
                      {p.mrn ? ` (${p.mrn as string})` : ""}
                    </option>
                  ))}
                </Select>
                {errors.patient_id && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.patient_id.message}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Doctor <span className="text-red-500">*</span>
                </label>
                <Select
                  {...register("doctor_staff_id", {
                    required: "Doctor is required",
                  })}
                >
                  <option value="">Select a doctor</option>
                  {staff.map((s: Record<string, unknown>) => (
                    <option
                      key={s.staff_id as string}
                      value={s.staff_id as string}
                    >
                      {s.first_name as string} {s.last_name as string}
                      {s.specialty ? ` - ${s.specialty as string}` : ""}
                    </option>
                  ))}
                </Select>
                {errors.doctor_staff_id && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.doctor_staff_id.message}
                  </p>
                )}
              </div>
            </div>

            {/* Department and Type */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Department
                </label>
                <Select {...register("department_id")}>
                  <option value="">Select a department</option>
                  {departments.map((d: Record<string, unknown>) => (
                    <option
                      key={d.department_id as string}
                      value={d.department_id as string}
                    >
                      {d.name as string}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Appointment Type <span className="text-red-500">*</span>
                </label>
                <Select
                  {...register("appointment_type", {
                    required: "Appointment type is required",
                  })}
                >
                  <option value="">Select type</option>
                  {APPOINTMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                {errors.appointment_type && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.appointment_type.message}
                  </p>
                )}
              </div>
            </div>

            {/* Schedule */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Date <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  {...register("scheduled_date", {
                    required: "Date is required",
                  })}
                />
                {errors.scheduled_date && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.scheduled_date.message}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Start Time <span className="text-red-500">*</span>
                </label>
                <Input
                  type="time"
                  {...register("scheduled_start", {
                    required: "Start time is required",
                  })}
                />
                {errors.scheduled_start && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.scheduled_start.message}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  End Time <span className="text-red-500">*</span>
                </label>
                <Input
                  type="time"
                  {...register("scheduled_end", {
                    required: "End time is required",
                  })}
                />
                {errors.scheduled_end && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.scheduled_end.message}
                  </p>
                )}
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Reason
              </label>
              <Textarea
                {...register("reason")}
                placeholder="Reason for the appointment"
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Link href="/appointments">
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Booking..." : "Book Appointment"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
