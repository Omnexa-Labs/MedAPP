"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth.store";

interface NavItem {
  label: string;
  href: string;
  roles?: string[]; // empty/undefined = all roles
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Point of Sale", href: "/pos" },
  { label: "Prescriptions", href: "/prescriptions" },
  { label: "Inventory", href: "/inventory" },
  { label: "Batches", href: "/batches" },
  { label: "Suppliers", href: "/suppliers" },
  { label: "Purchase Orders", href: "/purchase-orders" },
  { label: "Customers", href: "/customers" },
  { label: "Sales", href: "/sales" },
  { label: "Reports", href: "/reports" },
  { label: "Staff", href: "/staff", roles: ["pharmacy_admin"] },
  { label: "Settings", href: "/settings", roles: ["pharmacy_admin"] },
  {
    label: "Pharmacy profile",
    href: "/pharmacy-profile",
    roles: ["pharmacy_admin"],
  },
];

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const mode = useAuthStore((s) => s.identity?.mode);

  const visible = NAV.filter(
    (n) =>
      (n.href !== "/pharmacy-profile" || mode === "medapp") &&
      (!n.roles || (user?.role && n.roles.includes(user.role))),
  );

  return (
    <aside
      className={
        mobile
          ? "w-full bg-white"
          : "hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex"
      }
    >
      {!mobile && (
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-brand-700">MedApp PMS</h2>
          <p className="text-xs text-slate-500">Pharmacy Management</p>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {visible.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-50 text-brand-800"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {!mobile && (
        <div className="border-t border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-medium text-slate-800">
            {user?.fullName}
          </p>
          <p className="truncate text-xs capitalize text-slate-500">
            {user?.role?.replace("_", " ")}
          </p>
        </div>
      )}
    </aside>
  );
}
