"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionError, useAuthStore } from "@/lib/stores/auth.store";
export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isHydrating, error: sessionError } = useAuthStore();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{
    scope: string;
    expiresAt: number;
  } | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isAuthenticated) router.replace("/workspaces");
  }, [isAuthenticated, router]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (challenge) {
        if (challenge.expiresAt <= Date.now())
          throw new SessionError("Verification expired. Start sign-in again.");
        await useAuthStore.getState().verify(code, challenge.scope);
      } else {
        const result = await useAuthStore.getState().login(email, password);
        setPassword("");
        if (result) {
          setChallenge({
            scope: result.scope,
            expiresAt: Date.now() + result.expires_in * 1000,
          });
          return;
        }
      }
      router.replace("/workspaces");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Sign-in could not be completed.",
      );
      if (failure instanceof SessionError && failure.code === "session_changed")
        await useAuthStore.getState().hydrate();
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section
        className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm"
        aria-labelledby="signin-title"
      >
        <p className="text-sm font-semibold text-slate-600">
          MedApp · Hospital portal
        </p>
        <h1
          id="signin-title"
          className="mt-3 text-2xl font-bold text-slate-900"
        >
          {challenge ? "Verify your sign-in" : "Sign in to your hospital"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {challenge
            ? "Enter your authenticator code or one of your recovery codes."
            : "Use your MedApp account, then choose a hospital where you are a staff member."}
        </p>
        {isHydrating ? (
          <p role="status" className="mt-6">
            Checking your session…
          </p>
        ) : isAuthenticated ? (
          <Link href="/workspaces" className="mt-6 block underline">
            Continue to your workspaces
          </Link>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {(error || sessionError) && (
              <p
                role="alert"
                className="rounded-md bg-red-50 p-3 text-sm text-red-700"
              >
                {error || sessionError}
              </p>
            )}
            {challenge ? (
              <div>
                <label htmlFor="code" className="text-sm font-medium">
                  Authenticator or recovery code
                </label>
                <input
                  id="code"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </div>
              </>
            )}
            <button
              disabled={busy}
              className="w-full rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-50"
            >
              {busy
                ? "Please wait…"
                : challenge
                  ? "Verify and continue"
                  : "Sign in"}
            </button>
            {challenge && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setChallenge(null);
                  setCode("");
                  setError("");
                }}
                className="w-full py-2 text-sm underline"
              >
                Start sign-in again
              </button>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
