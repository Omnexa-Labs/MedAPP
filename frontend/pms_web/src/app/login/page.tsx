"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth.store";
import type { Challenge } from "@/lib/session-types";

export default function LoginPage() {
  const router = useRouter();
  const {
    login,
    verify,
    hydrate,
    isAuthenticated,
    isHydrating,
    error: sessionError,
  } = useAuthStore();
  const [mode, setMode] = useState<"medapp" | "local">("medapp");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null),
    [code, setCode] = useState("");
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (isAuthenticated && !sessionError) router.replace("/dashboard");
  }, [isAuthenticated, sessionError, router]);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (challenge) await verify(code.trim(), challenge.scope);
      else {
        const next = await login(email.trim(), password, mode);
        if (alive.current) {
          setPassword("");
          setChallenge(next);
        }
      }
    } catch (error) {
      if (alive.current)
        setError(
          error instanceof Error
            ? error.message
            : "Sign-in could not be completed.",
        );
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  const changeMode = (value: "medapp" | "local") => {
    setMode(value);
    setPassword("");
    setCode("");
    setChallenge(null);
    setError("");
  };
  const inputClass =
    "mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700";
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <section
        aria-labelledby="login-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <h1 id="login-title" className="text-2xl font-bold text-brand-800">
          MedApp Pharmacy
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {challenge
            ? "Confirm your MedApp sign-in."
            : mode === "medapp"
              ? "Use the MedApp account approved for this pharmacy."
              : "Use the staff account created by your pharmacy administrator."}
        </p>
        {isHydrating ? (
          <p role="status" className="mt-6">
            Checking your session…
          </p>
        ) : sessionError ? (
          <div className="mt-6">
            <p role="alert" className="text-sm text-red-700">
              {sessionError}
            </p>
            <button
              className="mt-3 min-h-11 underline"
              onClick={() => void hydrate()}
            >
              Retry session check
            </button>
          </div>
        ) : (
          !isAuthenticated && (
            <>
              {!challenge && (
                <fieldset
                  disabled={loading}
                  className="my-6 flex gap-4 text-sm"
                >
                  <legend className="mb-2 font-medium">Sign-in account</legend>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === "medapp"}
                      onChange={() => changeMode("medapp")}
                    />
                    MedApp account
                  </label>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === "local"}
                      onChange={() => changeMode("local")}
                    />
                    Local staff account
                  </label>
                </fieldset>
              )}
              <form
                onSubmit={handleSubmit}
                className="mt-6 space-y-4"
                aria-busy={loading}
              >
                {error && (
                  <p
                    role="alert"
                    className="rounded-md bg-red-50 p-3 text-sm text-red-700"
                  >
                    {error}
                  </p>
                )}
                <fieldset disabled={loading} className="space-y-4">
                  {challenge ? (
                    <div>
                      <label
                        htmlFor="verification-code"
                        className="block text-sm font-medium text-slate-700"
                      >
                        Authenticator or recovery code
                      </label>
                      <input
                        id="verification-code"
                        autoComplete="one-time-code"
                        autoFocus
                        required
                        minLength={6}
                        maxLength={32}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className={inputClass}
                        aria-describedby="code-help"
                      />
                      <p id="code-help" className="mt-2 text-sm text-slate-600">
                        Enter the code from your authenticator app, or an unused
                        recovery code.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label
                          htmlFor="email"
                          className="block text-sm font-medium text-slate-700"
                        >
                          Email
                        </label>
                        <input
                          id="email"
                          type="email"
                          autoComplete="username"
                          required
                          maxLength={254}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="password"
                          className="block text-sm font-medium text-slate-700"
                        >
                          Password
                        </label>
                        <input
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          required
                          maxLength={128}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}
                  <button
                    type="submit"
                    className="min-h-11 w-full rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {loading
                      ? "Signing in…"
                      : challenge
                        ? "Verify and sign in"
                        : mode === "medapp"
                          ? "Sign in with MedApp"
                          : "Sign in as local staff"}
                  </button>
                  {challenge && (
                    <button
                      type="button"
                      className="min-h-11 w-full text-sm underline"
                      onClick={() => changeMode(mode)}
                    >
                      Start sign-in again
                    </button>
                  )}
                </fieldset>
              </form>
              <p className="mt-6 text-sm text-slate-600">
                {mode === "medapp"
                  ? "Your pharmacy application must be approved and account setup completed before you can enter."
                  : "MedApp-linked accounts use MedApp sign-in. Contact your pharmacy administrator if you need local staff access."}
              </p>
            </>
          )
        )}
      </section>
    </main>
  );
}
