"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

import {
  fieldLabels,
  managedPhotoId,
  pharmacyProfileRepository,
} from "@/lib/repositories/pharmacy-profile.repository";
const actions: Record<string, string> = {
  "draft.saved": "Draft saved",
  "photo.uploaded": "Photo uploaded to draft",
  "profile.published": "Profile published",
  "profile.withdrawn": "Listing withdrawn",
};
const valueLabel = (value: unknown): string =>
  value === null || value === undefined || value === ""
    ? "Not set"
    : Array.isArray(value)
      ? value.join(", ") || "None"
      : typeof value === "object"
        ? Object.entries(value)
            .map(([day, hours]) => day + ": " + hours)
            .join("; ")
        : typeof value === "boolean"
          ? value
            ? "Yes"
            : "No"
          : typeof value === "string" && managedPhotoId(value)
            ? "Uploaded pharmacy photo"
            : String(value);
export function ProfileHistory() {
  const [page, setPage] = useState(0);

  const history = useQuery({
    queryKey: ["pharmacy-profile-history", page],
    queryFn: ({ signal }) =>
      pharmacyProfileRepository.history(page * 20, signal),
  });
  return (
    <section aria-label="Profile history" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Profile history</h2>
        <Button
          className="min-h-11"
          variant="outline"
          disabled={history.isFetching}
          onClick={() => void history.refetch()}
        >
          Refresh history
        </Button>
      </div>
      {history.isPending ? (
        <p role="status">Loading profile history…</p>
      ) : history.isError ? (
        <p role="alert">
          Profile history could not be loaded. Use Refresh history to try again.
        </p>
      ) : (
        <ol className="divide-y rounded-xl border bg-white">
          {history.data.items.length ? (
            history.data.items.map((event) => (
              <li key={event.id} className="space-y-2 p-5">
                <p className="font-medium">
                  {actions[event.action] || "Profile updated"}
                </p>
                <p className="break-all text-xs text-slate-500">
                  Pharmacy owner · {new Date(event.created_at).toLocaleString()}{" "}
                  · Revision {event.version}
                </p>
                <details>
                  <summary className="min-h-11 cursor-pointer py-3 text-sm text-teal-800">
                    View changed details
                  </summary>
                  <dl className="space-y-3 text-sm">
                    {event.changed_fields.map((field) => (
                      <div key={field}>
                        <dt className="font-medium">
                          {fieldLabels[field] || field}
                        </dt>
                        <dd className="break-words text-slate-600">
                          {valueLabel(event.before[field])} →{" "}
                          {valueLabel(event.after[field])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </li>
            ))
          ) : (
            <li className="p-5 text-sm text-slate-600">
              No profile changes recorded yet.
            </li>
          )}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          className="min-h-11"
          variant="outline"
          disabled={!page || history.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous changes
        </Button>
        <span className="text-sm">Page {page + 1}</span>
        <Button
          className="min-h-11"
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
