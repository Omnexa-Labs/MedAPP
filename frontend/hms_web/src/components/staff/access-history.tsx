"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { teamRepository, roleLabel } from "@/lib/repositories/team.repository";
import { useAuthStore } from "@/lib/stores/auth.store";
import { Button } from "@/components/ui/button";
const actions: Record<string, string> = {
  "invitation.created": "Invitation created",
  "invitation.superseded": "Invitation replaced",
  "invitation.cancelled": "Invitation cancelled",
  "invitation.accepted": "Invitation accepted",
  "membership.changed": "Staff access changed",
};
export function AccessHistory() {
  const [page, setPage] = useState(0);
  const userId = useAuthStore((s) => s.user?.id);
  const history = useQuery({
    queryKey: ["team-history", page],
    queryFn: ({ signal }) => teamRepository.history(page * 50, signal),
  });
  return (
    <section className="space-y-4" aria-label="Staff access history">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Access history</h2>
        <Button
          variant="outline"
          disabled={history.isFetching}
          onClick={() => void history.refetch()}
        >
          Refresh history
        </Button>
      </div>
      {history.isPending ? (
        <p role="status">Loading access history…</p>
      ) : history.isError ? (
        <p role="alert">
          Access history could not be loaded.{" "}
          <button className="underline" onClick={() => void history.refetch()}>
            Retry access history
          </button>
        </p>
      ) : (
        <ol className="divide-y rounded-xl border bg-white">
          {history.data.items.length ? (
            history.data.items.map((event) => (
              <li key={event.id} className="space-y-2 p-5">
                <p className="font-medium">
                  {actions[event.action] || "Access event"}
                </p>
                <p className="break-all text-sm text-slate-600">
                  {event.recipient_email ||
                    event.details.user_id ||
                    "Hospital team"}
                </p>
                {event.details.after ? (
                  <p className="text-sm capitalize">
                    {roleLabel(event.details.after.hms_role)} ·{" "}
                    {event.details.after.is_active
                      ? "Access active"
                      : "Access revoked"}
                  </p>
                ) : event.details.hms_role ? (
                  <p className="text-sm capitalize">
                    {roleLabel(event.details.hms_role)}
                  </p>
                ) : null}
                <p className="break-all text-xs text-slate-500">
                  {event.actor_id === userId
                    ? "You"
                    : event.actor_name || event.actor_id}{" "}
                  · {new Date(event.created_at).toLocaleString()}
                </p>
              </li>
            ))
          ) : (
            <li className="p-5 text-sm text-slate-600">
              No recorded access changes yet.
            </li>
          )}
        </ol>
      )}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={!page || history.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous changes
        </Button>
        <span className="text-sm">Page {page + 1}</span>
        <Button
          variant="outline"
          disabled={!history.data?.has_more || history.isFetching}
          onClick={() => setPage((p) => p + 1)}
        >
          Next changes
        </Button>
      </div>
    </section>
  );
}
