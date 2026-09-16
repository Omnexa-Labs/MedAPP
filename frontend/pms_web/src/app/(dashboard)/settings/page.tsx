"use client";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  const { user, identity } = useAuthStore();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-600">
          Your pharmacy and account access
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Pharmacy workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {identity?.mode === "medapp" && user?.role === "pharmacy_admin" && (
            <Link
              href="/pharmacy-profile"
              className="inline-flex min-h-11 items-center rounded-md border px-4 font-medium text-brand-700"
            >
              Edit patient directory profile
            </Link>
          )}
          <p className="text-lg font-semibold">{identity?.pharmacy.name}</p>
          <p className="text-slate-600">
            {identity?.pharmacy.deployment_key
              ? "This workspace is linked to an approved MedApp pharmacy."
              : "This workspace uses local pharmacy staff accounts."}
          </p>
          <p className="text-slate-600">
            Contact your pharmacy administrator if the pharmacy or account
            details are incorrect.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Signed-in account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium">{user?.fullName || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="break-words font-medium">{user?.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Role</dt>
              <dd className="font-medium capitalize">
                {user?.role.replaceAll("_", " ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Sign-in method</dt>
              <dd className="font-medium">
                {identity?.mode === "medapp"
                  ? "MedApp account"
                  : "Local staff account"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
