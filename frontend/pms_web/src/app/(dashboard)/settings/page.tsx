"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const apiUrl =
    process.env.NEXT_PUBLIC_PMS_API_URL || "http://localhost:8030";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Pharmacy profile and integration configuration
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signed-in user</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-slate-500">Name</div>
            <div className="font-medium">{user?.fullName || "—"}</div>
          </div>
          <div>
            <div className="text-slate-500">Email</div>
            <div className="font-medium">{user?.email || "—"}</div>
          </div>
          <div>
            <div className="text-slate-500">Role</div>
            <div className="font-medium capitalize">
              {user?.role.replace("_", " ") || "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MedApp integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-slate-600">
            Inbound prescriptions arrive via a signed webhook. Configure these
            on the backend (<code>PMS_*</code> environment variables) and
            restart the service.
          </p>
          <div className="rounded border bg-slate-50 p-3 font-mono text-xs">
            <div>POST {apiUrl}/v1/integrations/medapp/prescriptions</div>
            <div className="text-slate-500">
              Header: x-medapp-signature: sha256=&lt;hmac&gt;
            </div>
          </div>
          <div className="rounded border bg-slate-50 p-3 font-mono text-xs">
            <div>GET {apiUrl}/v1/integrations/medapp/stock-availability</div>
            <div className="text-slate-500">
              Query: ?drug_name=Paracetamol (Bearer auth required)
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Outbound dispense webhook:</span>
            <Badge variant="default">
              Configured via PMS_MEDAPP_DISPENSE_WEBHOOK_URL
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">API URL</span>
            <span className="font-mono">{apiUrl}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Health check</span>
            <span className="font-mono">{apiUrl}/healthz</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
