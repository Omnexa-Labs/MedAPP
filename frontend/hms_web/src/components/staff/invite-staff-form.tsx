"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/stores/auth.store";
import { staffRepository } from "@/lib/repositories/staff.repository";
import {
  teamRepository,
  roleLabel,
  staffRoles,
  teamError,
  type InvitationInput,
  type Invitation,
} from "@/lib/repositories/team.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function InviteStaffForm() {
  const user = useAuthStore((s) => s.user),
    scope = useAuthStore((s) => s.scope);
  const [created, setCreated] = useState<
    (Invitation & { code: string }) | null
  >(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: ({ signal }) =>
      staffRepository.listDepartments(undefined, signal).then((r) => r.data),
    enabled: user?.hmsRole === "hospital_admin",
  });
  async function submit(form: HTMLFormElement) {
    if (busy) return;
    const data = new FormData(form),
      payload: Record<string, string> = {};
    for (const [key, value] of data.entries())
      if (typeof value === "string" && value.trim())
        payload[key] = value.trim();
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    try {
      const result = await teamRepository.invite(
        payload as unknown as InvitationInput,
        controller.current.signal,
      );
      if (
        !controller.current.signal.aborted &&
        useAuthStore.getState().scope === scope
      )
        setCreated(result);
    } catch (failure) {
      if (!controller.current.signal.aborted) setError(teamError(failure));
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  }
  if (user?.hmsRole !== "hospital_admin")
    return (
      <section className="rounded-xl border bg-white p-6">
        <h1 className="text-xl font-semibold">
          Hospital administrator access required
        </h1>
        <p className="mt-2 text-slate-600">
          Contact an administrator to invite staff and assign workspace roles.
        </p>
        <Link href="/staff" className="mt-4 inline-block underline">
          Back to staff
        </Link>
      </section>
    );
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/staff" className="text-sm text-slate-600 underline">
          ← Back to staff
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Invite a staff member</h1>
        <p className="mt-2 text-slate-600">
          Invite someone to {user.hospitalName}. Their verified MedApp account
          supplies their name when they accept.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}
      {created ? (
        <div className="space-y-4 rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold">
            Invitation ready for {created.email}
          </h2>
          <p className="text-sm capitalize">
            Hospital role: {roleLabel(created.hms_role)}
          </p>
          <p className="text-sm text-slate-600">
            Share this code privately with the recipient. Ask them to sign in to
            this hospital portal, open Choose your hospital, and use Join a
            hospital. It expires {new Date(created.expires_at).toLocaleString()}
            .
          </p>
          <label
            htmlFor="created-invitation-code"
            className="block text-sm font-medium"
          >
            Invitation code
          </label>
          <Input
            id="created-invitation-code"
            readOnly
            value={created.code}
            className="font-mono"
            onFocus={(e) => e.target.select()}
          />
          <p className="text-sm text-slate-600">
            This code is shown only here. If it is lost, create a new invitation
            to replace it. Access begins after the recipient accepts.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(created.code);
                  setCopied("Invitation code copied.");
                } catch {
                  setCopied("Select the code above and copy it manually.");
                }
              }}
            >
              Copy code
            </Button>
            <Link href="/staff">
              <Button variant="outline">Review team access</Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setCopied("");
              }}
            >
              Invite another person
            </Button>
          </div>
          {copied && (
            <p role="status" className="text-sm">
              {copied}
            </p>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
          className="space-y-6 rounded-xl border bg-white p-6"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="staff-email"
                className="mb-1 block text-sm font-medium"
              >
                MedApp email address
              </label>
              <Input
                id="staff-email"
                name="email"
                type="email"
                required
                maxLength={254}
                disabled={busy}
                autoComplete="off"
              />
            </div>
            <div>
              <label
                htmlFor="staff-role"
                className="mb-1 block text-sm font-medium"
              >
                Hospital role
              </label>
              <Select
                id="staff-role"
                name="hms_role"
                required
                defaultValue=""
                disabled={busy}
              >
                <option value="" disabled>
                  Choose a role
                </option>
                {staffRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </Select>
            </div>
            {(
              [
                ["employee_id", "Employee ID", 32],
                ["title", "Title", 64],
                ["specialty", "Specialty", 128],
                ["qualification", "Qualification", 255],
              ] as const
            ).map(([name, label, maxLength]) => (
              <div key={name}>
                <label
                  htmlFor={`staff-${name}`}
                  className="mb-1 block text-sm font-medium"
                >
                  {label}{" "}
                  <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <Input
                  id={`staff-${name}`}
                  name={name}
                  maxLength={maxLength}
                  disabled={busy}
                />
              </div>
            ))}
            <div>
              <label
                htmlFor="staff-department"
                className="mb-1 block text-sm font-medium"
              >
                Department (optional)
              </label>
              <Select
                id="staff-department"
                name="department_id"
                disabled={busy || departments.isPending || departments.isError}
                defaultValue=""
              >
                <option value="">No department assigned</option>
                {departments.data?.items?.map(
                  (department: { department_id: string; name: string }) => (
                    <option
                      key={department.department_id}
                      value={department.department_id}
                    >
                      {department.name}
                    </option>
                  ),
                )}
              </Select>
              {departments.isError && (
                <p className="mt-2 text-sm text-red-700" role="alert">
                  Departments could not be loaded.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void departments.refetch()}
                  >
                    Retry departments
                  </button>
                </p>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-600">
            Hospital administrators can invite staff and change access. Choose
            the role this person needs. Creating another invitation for the same
            email replaces its earlier pending code.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Creating invitation…" : "Create invitation"}
            </Button>
            <Link href="/staff">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      )}
    </section>
  );
}
