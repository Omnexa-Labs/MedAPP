"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { staffRepository } from "@/lib/repositories/staff.repository";
import { teamError } from "@/lib/repositories/team.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
interface StaffRecord {
  staff_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  employee_id: string | null;
  title: string | null;
  specialty: string | null;
  qualification: string | null;
  email: string | null;
  phone: string | null;
  updated_at: string;
}
const editableFields = [
  ["first_name", "First name", 128],
  ["last_name", "Last name", 128],
  ["employee_id", "Employee ID", 32],
  ["title", "Title", 64],
  ["specialty", "Specialty", 128],
  ["qualification", "Qualification", 255],
  ["phone", "Phone", 32],
] as const;
type EditableField = (typeof editableFields)[number][0];
function editableValues(record: StaffRecord) {
  return Object.fromEntries(
    editableFields.map(([key]) => [key, record[key] || ""]),
  ) as Record<EditableField, string>;
}
function StaffEditor({ record }: { record: StaffRecord }) {
  const cache = useQueryClient();
  const [baseline, setBaseline] = useState(() => editableValues(record));
  const [draft, setDraft] = useState(() => editableValues(record));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <form
      className="mt-6 space-y-5 rounded-xl border bg-white p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const payload: Record<string, string | null> = {};
        for (const [key] of editableFields)
          if (baseline[key] !== draft[key].trim())
            payload[key] = draft[key].trim() || null;
        if (!Object.keys(payload).length) {
          setSaved(true);
          return;
        }
        setBusy(true);
        setError("");
        setSaved(false);
        try {
          const response = await staffRepository.update(
            record.staff_id,
            payload,
          );
          const current = response.data as StaffRecord;
          setBaseline(editableValues(current));
          setDraft(editableValues(current));
          cache.setQueryData(["staff", "detail", record.staff_id], current);
          await cache.invalidateQueries({ queryKey: ["staff"] });
          await cache.invalidateQueries({ queryKey: ["team-memberships"] });
          setSaved(true);
        } catch (failure) {
          setError(teamError(failure));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {editableFields.map(([key, label, maxLength]) => (
          <div key={key}>
            <label
              htmlFor={`edit-staff-${key}`}
              className="mb-1 block text-sm font-medium"
            >
              {label}
            </label>
            <Input
              id={`edit-staff-${key}`}
              name={key}
              value={draft[key]}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  [key]: event.target.value,
                }));
                setSaved(false);
              }}
              maxLength={maxLength}
              required={key === "first_name" || key === "last_name"}
              pattern={
                key === "first_name" || key === "last_name"
                  ? ".*\\S.*"
                  : undefined
              }
              disabled={busy}
            />
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-600">
        These details belong to this hospital&apos;s staff record. Manage portal
        roles and revocation from Access and invitations.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-800">
          Staff details saved.
        </p>
      )}
      <Button disabled={busy} type="submit">
        {busy ? "Saving…" : "Save staff details"}
      </Button>
    </form>
  );
}
export default function StaffDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const staff = useQuery({
    queryKey: ["staff", "detail", id],
    queryFn: ({ signal }) =>
      staffRepository.get(id, signal).then((r) => r.data as StaffRecord),
  });
  return (
    <section className="mx-auto max-w-3xl">
      <Link href="/staff" className="text-sm text-slate-600 underline">
        ← Back to staff
      </Link>
      <h1 className="mt-3 text-2xl font-bold">Staff record</h1>
      {staff.isPending ? (
        <p role="status" className="mt-6">
          Loading staff record…
        </p>
      ) : staff.isError ? (
        <p role="alert" className="mt-6">
          {teamError(staff.error)}{" "}
          <button className="underline" onClick={() => void staff.refetch()}>
            Retry staff record
          </button>
        </p>
      ) : (
        <>
          <p className="mt-2 text-slate-600">
            {staff.data.first_name} {staff.data.last_name} ·{" "}
            {staff.data.email || "No email recorded"}
          </p>
          <StaffEditor key={staff.data.staff_id} record={staff.data} />
        </>
      )}
    </section>
  );
}
