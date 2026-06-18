"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot, LayoutDashboard, Wrench, Shield, CreditCard,
  Settings, LogOut, Zap, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  tenantId: string;
  tenantName: string;
  tenantPlan: string;
}

const navItems = (tenantId: string) => [
  {
    label: "Overview",
    href: `/dashboard/${tenantId}`,
    icon: LayoutDashboard,
  },
  {
    label: "Agents",
    href: `/dashboard/${tenantId}/agents`,
    icon: Bot,
  },
  {
    label: "Tools",
    href: `/dashboard/${tenantId}/tools`,
    icon: Wrench,
  },
  {
    label: "Compliance",
    href: `/dashboard/${tenantId}/compliance`,
    icon: Shield,
  },
  {
    label: "Billing",
    href: `/dashboard/${tenantId}/billing`,
    icon: CreditCard,
  },
  {
    label: "Settings",
    href: `/dashboard/${tenantId}/settings`,
    icon: Settings,
  },
];

const planColors: Record<string, string> = {
  FREE: "bg-slate-100 text-slate-700",
  STARTER: "bg-blue-100 text-blue-700",
  PROFESSIONAL: "bg-violet-100 text-violet-700",
  ENTERPRISE: "bg-amber-100 text-amber-700",
};

export function Sidebar({ tenantId, tenantName, tenantPlan }: SidebarProps) {
  const pathname = usePathname();
  const items = navItems(tenantId);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      {/* Brand */}
      <div className="flex items-center gap-2 border-b p-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{tenantName}</p>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-xs font-medium",
              planColors[tenantPlan] ?? planColors.FREE
            )}
          >
            {tenantPlan}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== `/dashboard/${tenantId}` && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
              {isActive && <ChevronRight className="ml-auto h-3 w-3" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
