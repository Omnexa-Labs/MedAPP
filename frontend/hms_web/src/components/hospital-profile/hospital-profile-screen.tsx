"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/stores/auth.store";
import {
  fieldLabels,
  HospitalDetails,
  HospitalProfile,
  hospitalProfileRepository as repository,
  profileError,
} from "@/lib/repositories/hospital-profile.repository";
import { ProfilePreview } from "./profile-preview";
import { ProfileHistory } from "./profile-history";

type Form = Record<keyof HospitalDetails, string>;
const fields: {
  name: keyof HospitalDetails;
  max?: number;
  multiline?: boolean;
  type?: string;
  hint?: string;
}[] = [
  { name: "name", max: 255, hint: "The name patients see in the directory." },
  { name: "description", max: 4000, multiline: true },
  { name: "specialty", max: 255 },
  {
    name: "insurance_accepted",
    multiline: true,
    hint: "One insurer per line, up to 50. Leave blank if coverage needs to be confirmed.",
  },
  { name: "address_line1", max: 255 },
  { name: "city", max: 128 },
  { name: "country", max: 128 },
  { name: "contact_phone", max: 64, type: "tel" },
  { name: "contact_email", max: 255, type: "email" },
  {
    name: "website_url",
    max: 512,
    type: "url",
    hint: "Use a complete https:// or http:// address.",
  },
  {
    name: "latitude",
    type: "number",
    hint: "Optional. Add both coordinates, or leave both blank.",
  },
  { name: "longitude", type: "number" },
];
function toForm(details: HospitalDetails): Form {
  return Object.fromEntries(
    fields.map(({ name }) => [
      name,
      Array.isArray(details[name])
        ? details[name].join("\n")
        : String(details[name] ?? ""),
    ]),
  ) as Form;
}
function changesFrom(
  form: Form,
  saved: HospitalDetails,
): Partial<HospitalDetails> {
  const baseline = toForm(saved);
  return Object.fromEntries(
    fields
      .filter(({ name }) => form[name] !== baseline[name])
      .map(({ name }) => {
        const text = form[name].trim();
        if (name === "insurance_accepted")
          return [
            name,
            text
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean),
          ];
        if (name === "latitude" || name === "longitude") {
          if (text && !Number.isFinite(Number(text)))
            throw new Error("Enter valid map coordinates.");
          return [name, text ? Number(text) : null];
        }
        return [name, name === "name" ? text : text || null];
      }),
  );
}

export function HospitalProfileScreen() {
  const scope = useAuthStore((s) => s.scope);
  const role = useAuthStore((s) => s.user?.hmsRole);
  const profile = useQuery({
    queryKey: ["hospital-profile", scope],
    queryFn: ({ signal }) => repository.get(signal),
    enabled: !!scope && role === "hospital_admin",
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (role !== "hospital_admin" || !scope)
    return (
      <p role="alert">Only a hospital administrator can manage this profile.</p>
    );
  if (profile.isPending) return <p role="status">Loading hospital profile…</p>;
  if (profile.isError)
    return (
      <section className="space-y-4 rounded-xl border bg-white p-6">
        <h1 className="text-2xl font-semibold">Hospital profile</h1>
        <div role="alert">
          {profileError(profile.error).messages.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
        </div>
        <Button
          className="min-h-11"
          onClick={() => void profile.refetch()}
          disabled={profile.isFetching}
        >
          Retry profile
        </Button>
      </section>
    );
  return (
    <ProfileEditor
      key={`${scope}:${profile.data.hospital_id}`}
      initial={profile.data}
      scope={scope}
    />
  );
}

function ProfileEditor({
  initial,
  scope,
}: {
  initial: HospitalProfile;
  scope: string;
}) {
  const client = useQueryClient();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(() => toForm(initial.draft));
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false);
  const [confirmation, setConfirmation] = useState<
    "publish" | "withdraw" | "reload" | null
  >(null);
  const request = useRef<AbortController | null>(null);
  const baseline = toForm(saved.draft);
  const dirty = fields.some(({ name }) => form[name] !== baseline[name]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function perform(action: "save" | "publish" | "withdraw" | "reload") {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessages([]);
    setNotice("");
    try {
      const result =
        action === "save"
          ? await repository.save(
              saved.version,
              changesFrom(form, saved.draft),
              controller.signal,
            )
          : action === "reload"
            ? await repository.get(controller.signal)
            : await repository[action](saved.version, controller.signal);
      if (controller.signal.aborted || useAuthStore.getState().scope !== scope)
        return;
      setSaved(result);
      if (action !== "withdraw" || !dirty) setForm(toForm(result.draft));
      setReloadRequired(false);
      setConfirmation(null);
      client.setQueryData(["hospital-profile", scope], result);
      void client.invalidateQueries({ queryKey: ["hospital-profile-history"] });
      setNotice(
        {
          save: "Draft saved. Publish it when you are ready for patients to see these details.",
          publish: "Hospital profile published to the patient directory.",
          withdraw: "Hospital listing withdrawn from the patient directory.",
          reload: "Latest saved profile loaded.",
        }[action],
      );
    } catch (error) {
      if (controller.signal.aborted || useAuthStore.getState().scope !== scope)
        return;
      const failure = profileError(error);
      setMessages(failure.messages);
      setReloadRequired(failure.reloadRequired || action === "reload");
      setConfirmation(null);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const canPublish =
    !dirty &&
    !reloadRequired &&
    !saved.publication_issues.length &&
    (!saved.is_listed || saved.has_unpublished_changes);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-medium text-teal-700">
            Patient directory
          </p>
          <h1 className="text-3xl font-semibold">Hospital profile</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Keep your hospital details up to date. Save a draft, review it, then
            publish it for patients.
          </p>
        </div>
        <span
          className={`rounded-full px-4 py-2 text-sm font-medium ${saved.is_listed ? "bg-teal-100 text-teal-900" : "bg-slate-200 text-slate-700"}`}
        >
          {saved.is_listed ? "Published" : "Private"}
        </span>
      </header>
      <section
        className="space-y-3 rounded-xl border bg-white p-5"
        aria-label="Publication status"
      >
        <p className="font-medium">
          {saved.is_listed
            ? saved.has_unpublished_changes
              ? "Your saved draft has unpublished changes."
              : "Patients can see your published hospital profile."
            : "This hospital is not listed in the patient directory."}
        </p>
        {dirty && (
          <p className="text-sm text-amber-800">
            You have unsaved changes. Save them before reviewing publication.
          </p>
        )}
        {saved.last_published_at && (
          <p className="text-sm text-slate-500">
            Last published {new Date(saved.last_published_at).toLocaleString()}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            className="min-h-11 bg-teal-700 hover:bg-teal-800"
            disabled={!canPublish || busy || !!confirmation}
            onClick={() => setConfirmation("publish")}
          >
            Review and publish
          </Button>
          {saved.is_listed && (
            <Button
              className="min-h-11"
              variant="outline"
              disabled={busy || reloadRequired || !!confirmation}
              onClick={() => setConfirmation("withdraw")}
            >
              Withdraw listing
            </Button>
          )}
          <Button
            className="min-h-11"
            variant="outline"
            disabled={busy || !!confirmation}
            onClick={() =>
              dirty ? setConfirmation("reload") : void perform("reload")
            }
          >
            Reload saved profile
          </Button>
        </div>
      </section>
      {!!messages.length && (
        <div
          role="alert"
          className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          {messages.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
          {reloadRequired && (
            <p>
              Reload the saved profile before making another change. Your
              current inputs are preserved until you reload.
            </p>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-teal-50 p-4 text-teal-900">
          {notice}
        </p>
      )}
      {confirmation && (
        <section
          aria-label="Confirm profile action"
          className="space-y-4 rounded-xl border-2 border-teal-700 bg-white p-6"
        >
          <h2
            tabIndex={-1}
            ref={(node) => {
              node?.focus();
            }}
            className="text-xl font-semibold"
          >
            {confirmation === "publish"
              ? "Publish this saved draft?"
              : confirmation === "withdraw"
                ? "Withdraw this hospital listing?"
                : "Discard unsaved changes and reload?"}
          </h2>
          <p className="text-sm text-slate-600">
            {confirmation === "publish"
              ? "Review the saved draft preview below. These details will become visible in patient search and the hospital directory."
              : confirmation === "withdraw"
                ? "Patients will no longer find this hospital in the directory. Your saved draft is kept for future publication."
                : "The latest saved draft will replace the unsaved changes in this editor."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={() => void perform(confirmation)}
            >
              {busy
                ? "Please wait…"
                : confirmation === "publish"
                  ? "Confirm publication"
                  : confirmation === "withdraw"
                    ? "Confirm withdrawal"
                    : "Discard and reload"}
            </Button>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Keep editing
            </Button>
          </div>
        </section>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <form
          className="space-y-5 rounded-xl border bg-white p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty && !busy && !reloadRequired && !confirmation)
              void perform("save");
          }}
        >
          <div>
            <h2 className="text-xl font-semibold">Edit draft</h2>
            <p className="mt-1 text-sm text-slate-600">
              Only the hospital name is required to save. Publication also needs
              a complete address and a phone number or email.
            </p>
          </div>
          <fieldset disabled={busy || !!confirmation} className="space-y-4">
            <legend className="sr-only">Hospital directory details</legend>
            {fields.map(({ name, max, multiline, type, hint }) => (
              <div key={name} className="space-y-1.5">
                <label
                  className="block text-sm font-medium"
                  htmlFor={`profile-${name}`}
                >
                  {fieldLabels[name]}
                  {name === "name" ? " (required)" : ""}
                </label>
                {multiline ? (
                  <textarea
                    id={`profile-${name}`}
                    value={form[name]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [name]: event.target.value,
                      }))
                    }
                    maxLength={max}
                    rows={name === "description" ? 5 : 3}
                    aria-describedby={hint ? `hint-${name}` : undefined}
                    className="w-full rounded-md border border-slate-300 p-3 text-sm focus-visible:outline-teal-700"
                  />
                ) : (
                  <input
                    id={`profile-${name}`}
                    value={form[name]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [name]: event.target.value,
                      }))
                    }
                    type={type || "text"}
                    step={type === "number" ? "any" : undefined}
                    min={
                      name === "latitude"
                        ? -90
                        : name === "longitude"
                          ? -180
                          : undefined
                    }
                    max={
                      name === "latitude"
                        ? 90
                        : name === "longitude"
                          ? 180
                          : undefined
                    }
                    maxLength={max}
                    required={name === "name"}
                    aria-describedby={hint ? `hint-${name}` : undefined}
                    className="min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline-teal-700"
                  />
                )}
                {hint && (
                  <p id={`hint-${name}`} className="text-xs text-slate-500">
                    {hint}
                  </p>
                )}
              </div>
            ))}
          </fieldset>
          <Button
            type="submit"
            className="min-h-11 bg-teal-700 hover:bg-teal-800"
            disabled={!dirty || busy || reloadRequired || !!confirmation}
          >
            {busy ? "Please wait…" : "Save draft"}
          </Button>
        </form>
        <div className="space-y-5">
          <ProfilePreview details={saved.draft} title="Saved draft preview" />
          {!!saved.publication_issues.length && (
            <section
              aria-label="Before publication"
              className="space-y-2 rounded-xl bg-amber-50 p-5"
            >
              <h2 className="font-semibold">Before publication</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {saved.publication_issues.map((issue, index) => (
                  <li key={`${issue.field}-${index}`}>{issue.message}</li>
                ))}
              </ul>
              <p className="text-xs text-slate-600">
                This checklist updates when you save your draft.
              </p>
            </section>
          )}
          {saved.published && (
            <ProfilePreview
              details={saved.published}
              title="Current public details"
            />
          )}
          <section
            aria-label="Approval details"
            className="rounded-xl border bg-white p-5 text-sm"
          >
            <h2 className="mb-2 font-semibold">Approval details</h2>
            <p>Accreditation: {saved.accreditation || "Not provided"}</p>
            <p className="mt-1">
              Accreditation status:{" "}
              {saved.accreditation_status.replaceAll("_", " ")}
            </p>
            <p className="mt-3 text-slate-500">
              Contact support to correct approval details. The public hospital
              name can differ from your workspace name.
            </p>
          </section>
        </div>
      </div>
      <ProfileHistory key={saved.version} />
    </div>
  );
}
