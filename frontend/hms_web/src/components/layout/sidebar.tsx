"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useTenantConfigStore } from "@/lib/stores/tenant-config.store";
import { canAccessModule } from "@/lib/utils/permissions";

interface NavItem {
  label: string;
  href: string;
  module: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", module: "dashboard" },
  { label: "Patients", href: "/patients", module: "patients" },
  { label: "Appointments", href: "/appointments", module: "appointments" },
  { label: "Queue", href: "/queue", module: "appointments" },
  { label: "Staff", href: "/staff", module: "staff" },
  { label: "Departments", href: "/departments", module: "staff" },
  { label: "Pharmacy", href: "/pharmacy", module: "pharmacy" },
  { label: "Prescriptions", href: "/prescriptions", module: "pharmacy" },
  { label: "Billing", href: "/billing", module: "billing" },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { config } = useTenantConfigStore();

  const visibleItems = NAV_ITEMS.filter((item) => {
    const moduleEnabled = config.modules[item.module as keyof typeof config.modules] ?? true;
    const hasAccess = canAccessModule(item.module, user?.hmsRole);
    return moduleEnabled && hasAccess;
  });

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-slate-50">
      <div className="border-b px-6 py-4">
        <h2
          className="text-lg font-bold"
          style={{ color: config.branding.primaryColor || "#1A5276" }}
        >
          {config.branding.hospitalName || "HMS"}
        </h2>
        <p className="text-xs text-slate-500">Hospital Management System</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-slate-200 text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t px-4 py-3">
        <p className="truncate text-sm font-medium text-slate-700">{user?.fullName}</p>
        <p className="truncate text-xs text-slate-500">{user?.hmsRole}</p>
      </div>
    </aside>
  );
}
