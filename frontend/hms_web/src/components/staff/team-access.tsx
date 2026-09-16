"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/stores/auth.store";
import {
  teamRepository,
  teamError,
  roleLabel,
  staffRoles,
  type Membership,
} from "@/lib/repositories/team.repository";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { AccessHistory } from "./access-history";

function MembershipEditor({
  row,
  close,
  saved,
}: {
  row: Membership;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [role, setRole] = useState(row.hms_role),
    [active, setActive] = useState(row.is_active);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      aria-label="Change staff access"
      className="mt-4 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await teamRepository.change(row, role, active);
          await saved();
          close();
        } catch (failure) {
          setError(teamError(failure));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold">
        Change access for {row.name || row.email || row.user_id}
      </h3>
      <p className="text-sm">
        Changes apply to this hospital. Revoking access stops future hospital
        requests; it preserves the staff record. The last hospital administrator
        cannot be removed.
      </p>
      <label className="block text-sm font-medium" htmlFor="membership-role">
        Hospital role
      </label>
      <Select
        id="membership-role"
        value={role}
        disabled={busy || !active}
        onChange={(e) => setRole(e.target.value)}
      >
        {staffRoles.map((value) => (
          <option key={value} value={value}>
            {roleLabel(value)}
          </option>
        ))}
      </Select>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!active}
          disabled={busy}
          onChange={(e) => setActive(!e.target.checked)}
        />
        Revoke hospital access
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button disabled={busy} type="submit">
          {busy
            ? "Saving…"
            : active
              ? "Save access change"
              : "Confirm revocation"}
        </Button>
        <Button disabled={busy} type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
export function TeamAccess() {
  const [memberPage, setMemberPage] = useState(0),
    [invitePage, setInvitePage] = useState(0);
  const [editing, setEditing] = useState<Membership | null>(null),
    [cancelling, setCancelling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const cache = useQueryClient();
  const members = useQuery({
    queryKey: ["team-memberships", memberPage],
    queryFn: ({ signal }) =>
      teamRepository.memberships(memberPage * 50, signal),
  });
  const invitations = useQuery({
    queryKey: ["team-invitations", invitePage],
    queryFn: ({ signal }) =>
      teamRepository.invitations(invitePage * 50, signal),
  });
  async function refresh() {
    setEditing(null);
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["team-memberships"] }),
      cache.invalidateQueries({ queryKey: ["team-invitations"] }),
      cache.invalidateQueries({ queryKey: ["staff"] }),
      cache.invalidateQueries({ queryKey: ["team-history"] }),
    ]);
    await useAuthStore.getState().hydrate();
  }
  return (
    <section className="space-y-6" aria-label="Hospital team access">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Hospital access</h2>
          <p className="mt-1 text-sm text-slate-600">
            Review active roles, revoked access and invitations for this
            hospital.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>
          Refresh team
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {members.isPending ? (
        <p role="status">Loading staff access…</p>
      ) : members.isError ? (
        <p role="alert">
          Staff access could not be loaded.{" "}
          <button className="underline" onClick={() => void members.refetch()}>
            Retry staff access
          </button>
        </p>
      ) : (
        <div className="divide-y rounded-xl border bg-white">
          {members.data.items.length ? (
            members.data.items.map((row) => (
              <div key={row.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {row.name ||
                        (row.user_id === useAuthStore.getState().user?.id
                          ? "Your account"
                          : "MedApp account")}
                    </p>
                    <p className="mt-1 break-all text-sm text-slate-600">
                      {row.email || row.user_id}
                    </p>
                    <p className="mt-2 text-sm capitalize">
                      {roleLabel(row.hms_role)} ·{" "}
                      {row.is_active ? "Access active" : "Access revoked"}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    {row.staff_id && (
                      <Link
                        className="text-sm underline"
                        href={`/staff/${row.staff_id}`}
                      >
                        Staff record
                      </Link>
                    )}
                    {row.is_active && (
                      <Button
                        variant="outline"
                        disabled={!!editing}
                        onClick={() => setEditing(row)}
                      >
                        Change access
                      </Button>
                    )}
                  </div>
                </div>
                {editing?.id === row.id && (
                  <MembershipEditor
                    key={`${editing.id}:${editing.version}`}
                    row={editing}
                    close={() => setEditing(null)}
                    saved={refresh}
                  />
                )}
              </div>
            ))
          ) : (
            <p className="p-5 text-sm">No staff memberships on this page.</p>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={memberPage === 0 || members.isFetching}
          onClick={() => {
            setEditing(null);
            setMemberPage((p) => p - 1);
          }}
        >
          Previous staff
        </Button>
        <span className="text-sm">Page {memberPage + 1}</span>
        <Button
          variant="outline"
          disabled={!members.data?.has_more || members.isFetching}
          onClick={() => {
            setEditing(null);
            setMemberPage((p) => p + 1);
          }}
        >
          Next staff
        </Button>
      </div>
      <h2 className="text-xl font-semibold">Invitations</h2>
      {invitations.isPending ? (
        <p role="status">Loading invitations…</p>
      ) : invitations.isError ? (
        <p role="alert">
          Invitations could not be loaded.{" "}
          <button
            className="underline"
            onClick={() => void invitations.refetch()}
          >
            Retry invitations
          </button>
        </p>
      ) : (
        <div className="divide-y rounded-xl border bg-white">
          {invitations.data.items.length ? (
            invitations.data.items.map((row) => (
              <div key={row.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="break-all font-medium">{row.email}</p>
                    <p className="mt-1 text-sm capitalize">
                      {roleLabel(row.hms_role)} · {row.status}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Expires {new Date(row.expires_at).toLocaleString()}
                    </p>
                  </div>
                  {row.status === "pending" && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setCancelling(row.id)}
                    >
                      Cancel invitation
                    </Button>
                  )}
                </div>
                {cancelling === row.id && (
                  <div className="mt-4 space-y-3 rounded-md bg-amber-50 p-4">
                    <p className="text-sm">
                      Cancel this code for {row.email}? They will need a new
                      invitation to join.
                    </p>
                    <div className="flex gap-3">
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await teamRepository.cancel(row.id);
                            setCancelling(null);
                            await invitations.refetch();
                            await cache.invalidateQueries({
                              queryKey: ["team-history"],
                            });
                          } catch (failure) {
                            setError(teamError(failure));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Confirm cancellation
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setCancelling(null)}
                      >
                        Keep invitation
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="p-5 text-sm text-slate-600">
              No invitations yet. Invite a staff member to begin.
            </p>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={invitePage === 0 || invitations.isFetching}
          onClick={() => setInvitePage((p) => p - 1)}
        >
          Previous invitations
        </Button>
        <span className="text-sm">Page {invitePage + 1}</span>
        <Button
          variant="outline"
          disabled={!invitations.data?.has_more || invitations.isFetching}
          onClick={() => setInvitePage((p) => p + 1)}
        >
          Next invitations
        </Button>
      </div>
      <AccessHistory />
    </section>
  );
}
