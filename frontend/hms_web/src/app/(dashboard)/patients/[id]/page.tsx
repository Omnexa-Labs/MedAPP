"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { patientRepository } from "@/lib/repositories/patient.repository";
import { staffRepository } from "@/lib/repositories/staff.repository";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

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
const VISIT_TYPE_OPTIONS = ["checkup", "emergency", "follow_up"] as const;

interface VisitFormValues {
  visit_type: string;
  chief_complaint: string;
  department_id: string;
}

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showVisitForm, setShowVisitForm] = useState(false);

  // ---------- Data fetching ----------

  const {
    data: patient,
    isLoading: loadingPatient,
  } = useQuery({
    queryKey: ["patient", id],
    queryFn: () => patientRepository.get(id).then((r) => r.data),
  });

  const { data: visits, isLoading: loadingVisits } = useQuery({
    queryKey: ["patient-visits", id],
    queryFn: () => patientRepository.listVisits(id).then((r) => r.data),
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

  // ---------- Patient edit mutation ----------

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      patientRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", id] });
      setEditing(false);
    },
  });

  // ---------- Visit creation ----------

  const visitForm = useForm<VisitFormValues>({
    defaultValues: { visit_type: "", chief_complaint: "", department_id: "" },
  });

  const visitMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      patientRepository.createVisit(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-visits", id] });
      setShowVisitForm(false);
      visitForm.reset();
    },
  });

  const onVisitSubmit = (values: VisitFormValues) => {
    const payload: Record<string, unknown> = { ...values };
    Object.keys(payload).forEach((key) => {
      if (payload[key] === "") delete payload[key];
    });
    visitMutation.mutate(payload);
  };

  // ---------- Edit form state ----------

  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const startEditing = () => {
    if (!patient) return;
    setEditValues({
      first_name: (patient.first_name as string) ?? "",
      last_name: (patient.last_name as string) ?? "",
      date_of_birth: (patient.date_of_birth as string) ?? "",
      gender: (patient.gender as string) ?? "",
      blood_group: (patient.blood_group as string) ?? "",
      phone_primary: (patient.phone_primary as string) ?? "",
      phone_secondary: (patient.phone_secondary as string) ?? "",
      email: (patient.email as string) ?? "",
      address_line1: (patient.address_line1 as string) ?? (patient.address as string) ?? "",
      address_line2: (patient.address_line2 as string) ?? "",
      city: (patient.city as string) ?? "",
      region: (patient.region as string) ?? "",
      emergency_contact_name: (patient.emergency_contact_name as string) ?? "",
      emergency_contact_phone:
        (patient.emergency_contact_phone as string) ?? "",
      insurance_provider: (patient.insurance_provider as string) ?? "",
      insurance_policy_number:
        (patient.insurance_policy_number as string) ?? "",
      allergies: Array.isArray(patient.allergies)
        ? patient.allergies.join(", ")
        : (patient.allergies as string) ?? "",
      chronic_conditions: Array.isArray(patient.chronic_conditions)
        ? patient.chronic_conditions.join(", ")
        : (patient.chronic_conditions as string) ?? "",
    });
    setEditing(true);
  };

  const handleEditChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    setEditValues((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const saveEdits = () => {
    const payload: Record<string, unknown> = { ...editValues };

    if (typeof editValues.allergies === "string" && editValues.allergies.trim()) {
      payload.allergies = editValues.allergies
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      payload.allergies = [];
    }

    if (
      typeof editValues.chronic_conditions === "string" &&
      editValues.chronic_conditions.trim()
    ) {
      payload.chronic_conditions = editValues.chronic_conditions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      payload.chronic_conditions = [];
    }

    Object.keys(payload).forEach((key) => {
      if (payload[key] === "") delete payload[key];
    });

    updateMutation.mutate(payload);
  };

  // ---------- Loading state ----------

  if (loadingPatient) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton lines={2} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <LoadingSkeleton lines={5} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <LoadingSkeleton lines={5} />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="pt-6">
            <LoadingSkeleton lines={4} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <h3 className="text-lg font-semibold text-slate-900">
          Patient not found
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          The patient record could not be loaded.
        </p>
        <Link href="/patients">
          <Button className="mt-4">Back to Patients</Button>
        </Link>
      </div>
    );
  }

  const allergies = Array.isArray(patient.allergies) ? patient.allergies : [];
  const chronicConditions = Array.isArray(patient.chronic_conditions)
    ? patient.chronic_conditions
    : [];
  const visitItems: Record<string, unknown>[] = Array.isArray(visits?.items)
    ? visits.items
    : Array.isArray(visits)
      ? visits
      : [];

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/patients"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            &larr; Patients
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {patient.first_name} {patient.last_name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            {patient.mrn && <span>MRN: {patient.mrn}</span>}
            {patient.gender && (
              <span className="capitalize">{patient.gender as string}</span>
            )}
            {patient.date_of_birth && (
              <span>DOB: {formatDate(patient.date_of_birth as string)}</span>
            )}
            {patient.blood_group && (
              <span>Blood: {patient.blood_group as string}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!editing && (
            <Button variant="outline" onClick={startEditing}>
              Edit
            </Button>
          )}
          <Button onClick={() => setShowVisitForm(!showVisitForm)}>
            {showVisitForm ? "Cancel Visit" : "New Visit"}
          </Button>
        </div>
      </div>

      {updateMutation.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to update patient. Please try again.
        </div>
      )}

      {/* New Visit inline form */}
      {showVisitForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Record New Visit</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={visitForm.handleSubmit(onVisitSubmit)}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Visit Type
                  </label>
                  <Select {...visitForm.register("visit_type")}>
                    <option value="">Select type</option>
                    {VISIT_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Department
                  </label>
                  <Select {...visitForm.register("department_id")}>
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
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Chief Complaint
                </label>
                <Textarea
                  {...visitForm.register("chief_complaint")}
                  placeholder="Describe the patient's primary complaint"
                  rows={3}
                />
              </div>
              {visitMutation.isError && (
                <p className="text-sm text-red-500">
                  Failed to create visit. Please try again.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowVisitForm(false);
                    visitForm.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={visitMutation.isPending}>
                  {visitMutation.isPending ? "Saving..." : "Save Visit"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Main info grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Primary Phone
                  </label>
                  <Input
                    name="phone_primary"
                    value={editValues.phone_primary}
                    onChange={handleEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Secondary Phone
                  </label>
                  <Input
                    name="phone_secondary"
                    value={editValues.phone_secondary}
                    onChange={handleEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Email
                  </label>
                  <Input
                    name="email"
                    type="email"
                    value={editValues.email}
                    onChange={handleEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Address Line 1
                  </label>
                  <Input
                    name="address_line1"
                    value={editValues.address_line1}
                    onChange={handleEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Address Line 2
                  </label>
                  <Input
                    name="address_line2"
                    value={editValues.address_line2}
                    onChange={handleEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    City
                  </label>
                  <Input
                    name="city"
                    value={editValues.city}
                    onChange={handleEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Region
                  </label>
                  <Input
                    name="region"
                    value={editValues.region}
                    onChange={handleEditChange}
                  />
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="font-medium text-slate-500">Primary Phone</dt>
                  <dd className="text-slate-900">
                    {(patient.phone_primary as string) || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">
                    Secondary Phone
                  </dt>
                  <dd className="text-slate-900">
                    {(patient.phone_secondary as string) || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Email</dt>
                  <dd className="text-slate-900">
                    {(patient.email as string) || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Address</dt>
                  <dd className="text-slate-900">
                    {[
                      patient.address_line1 || patient.address,
                      patient.address_line2,
                      patient.city,
                      patient.region,
                    ]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Personal / Demographics (edit mode shows editable fields) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Personal Information</CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    First Name
                  </label>
                  <Input
                    name="first_name"
                    value={editValues.first_name}
                    onChange={handleEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Last Name
                  </label>
                  <Input
                    name="last_name"
                    value={editValues.last_name}
                    onChange={handleEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Date of Birth
                  </label>
                  <Input
                    type="date"
                    name="date_of_birth"
                    value={editValues.date_of_birth}
                    onChange={handleEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Gender
                  </label>
                  <Select
                    name="gender"
                    value={editValues.gender}
                    onChange={handleEditChange}
                  >
                    <option value="">Select gender</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Blood Group
                  </label>
                  <Select
                    name="blood_group"
                    value={editValues.blood_group}
                    onChange={handleEditChange}
                  >
                    <option value="">Select blood group</option>
                    {BLOOD_GROUP_OPTIONS.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="font-medium text-slate-500">Date of Birth</dt>
                  <dd className="text-slate-900">
                    {formatDate(patient.date_of_birth as string)}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Gender</dt>
                  <dd className="capitalize text-slate-900">
                    {(patient.gender as string) || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Blood Group</dt>
                  <dd className="text-slate-900">
                    {(patient.blood_group as string) || "-"}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Insurance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Insurance</CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Provider
                  </label>
                  <Input
                    name="insurance_provider"
                    value={editValues.insurance_provider}
                    onChange={handleEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Policy Number
                  </label>
                  <Input
                    name="insurance_policy_number"
                    value={editValues.insurance_policy_number}
                    onChange={handleEditChange}
                  />
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="font-medium text-slate-500">Provider</dt>
                  <dd className="text-slate-900">
                    {(patient.insurance_provider as string) || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Policy Number</dt>
                  <dd className="text-slate-900">
                    {(patient.insurance_policy_number as string) || "-"}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Emergency Contact</CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Name
                  </label>
                  <Input
                    name="emergency_contact_name"
                    value={editValues.emergency_contact_name}
                    onChange={handleEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Phone
                  </label>
                  <Input
                    name="emergency_contact_phone"
                    value={editValues.emergency_contact_phone}
                    onChange={handleEditChange}
                  />
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="font-medium text-slate-500">Name</dt>
                  <dd className="text-slate-900">
                    {(patient.emergency_contact_name as string) || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Phone</dt>
                  <dd className="text-slate-900">
                    {(patient.emergency_contact_phone as string) || "-"}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Medical Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Medical Information</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Allergies (comma-separated)
                </label>
                <Textarea
                  name="allergies"
                  value={editValues.allergies}
                  onChange={handleEditChange}
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Chronic Conditions (comma-separated)
                </label>
                <Textarea
                  name="chronic_conditions"
                  value={editValues.chronic_conditions}
                  onChange={handleEditChange}
                  rows={3}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium text-slate-500">
                  Allergies
                </h3>
                {allergies.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {allergies.map((a: string, i: number) => (
                      <span
                        key={i}
                        className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">None recorded</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-500">
                  Chronic Conditions
                </h3>
                {chronicConditions.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {chronicConditions.map((c: string, i: number) => (
                      <span
                        key={i}
                        className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">None recorded</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
        {editing && (
          <CardFooter className="justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={saveEdits}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Recent Visits */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Recent Visits</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowVisitForm(true)}
            >
              + New Visit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingVisits ? (
            <LoadingSkeleton lines={5} />
          ) : visitItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No visits recorded
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Chief Complaint</TableHead>
                  <TableHead>Diagnosis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitItems.map((visit) => (
                  <TableRow key={visit.visit_id as string}>
                    <TableCell>
                      {formatDateTime(
                        (visit.visit_date as string) ||
                          (visit.created_at as string)
                      )}
                    </TableCell>
                    <TableCell className="capitalize">
                      {((visit.visit_type as string) || (visit.type as string) || "-")
                        .replace(/_/g, " ")}
                    </TableCell>
                    <TableCell>
                      {visit.status ? (
                        <StatusBadge status={visit.status as string} />
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {(visit.doctor_name as string) ||
                        ((visit.doctor_staff_id as string)?.slice(0, 8) ??
                          "-")}
                    </TableCell>
                    <TableCell>
                      {(visit.chief_complaint as string) ||
                        (visit.reason as string) ||
                        "-"}
                    </TableCell>
                    <TableCell>
                      {(visit.diagnosis as string) || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
