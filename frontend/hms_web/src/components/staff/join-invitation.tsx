"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  sessionRequest,
  useAuthStore,
  SessionError,
} from "@/lib/stores/auth.store";
import { roleLabel } from "@/lib/repositories/team.repository";
interface Preview {
  hospital_id: string;
  hospital_name: string;
  email: string;
  hms_role: string;
  expires_at: string;
  accepted: boolean;
}
export async function invitationRequest(
  action: "inspect" | "accept",
  code: string,
) {
  const scope = useAuthStore.getState().scope;
  if (!scope) throw new Error("Sign in before joining a hospital.");
  try {
    const result = await sessionRequest(`/invitation/${action}`, {
      method: "POST",
      headers: { "X-Session-Scope": scope },
      body: JSON.stringify({ code }),
    });
    if (scope !== useAuthStore.getState().scope)
      throw new Error("Your account changed. Enter the invitation again.");
    return result;
  } catch (error) {
    if (
      scope === useAuthStore.getState().scope &&
      error instanceof SessionError &&
      (error.status === 401 || error.code === "session_changed")
    )
      void useAuthStore.getState().invalidate();
    throw error;
  }
}
export function JoinInvitation() {
  const [code, setCode] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [joined, setJoined] = useState("");
  async function submit() {
    setError("");
    setBusy(true);
    try {
      if (!preview) setPreview(await invitationRequest("inspect", code.trim()));
      else {
        await invitationRequest("accept", code.trim());
        setJoined(preview.hospital_name);
        setPreview(null);
        setCode("");
        await useAuthStore.getState().hydrate();
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The invitation could not be checked.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-8 rounded-xl border bg-white p-6"
      aria-label="Join a hospital"
    >
      <h2 className="text-lg font-semibold">Join a hospital</h2>
      <p className="mt-2 text-sm text-slate-600">
        Enter the invitation code from your hospital administrator. Use the
        MedApp account with the verified email address they invited.
      </p>
      {joined && (
        <p
          role="status"
          className="mt-4 rounded-md bg-emerald-50 p-3 text-emerald-900"
        >
          You joined {joined}. Choose its workspace above to continue.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {preview ? (
          <div className="rounded-lg bg-slate-50 p-4">
            <h3 className="font-semibold">{preview.hospital_name}</h3>
            <p className="mt-1 text-sm">{preview.email}</p>
            <p className="mt-2 text-sm capitalize">
              Role: {roleLabel(preview.hms_role)}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Accepting creates your staff record and grants this hospital role.
              Your MedApp account role stays the same.
            </p>
          </div>
        ) : (
          <div>
            <label
              htmlFor="hospital-invitation-code"
              className="mb-1 block text-sm font-medium"
            >
              Invitation code
            </label>
            <Input
              id="hospital-invitation-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setJoined("");
              }}
              required
              minLength={43}
              maxLength={43}
              pattern="[A-Za-z0-9_-]{43}"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} type="submit">
            {busy
              ? "Please wait…"
              : preview
                ? "Accept invitation"
                : "Review invitation"}
          </Button>
          {preview && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setError("");
              }}
            >
              Use another code
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
