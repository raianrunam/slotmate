"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3Icon,
  Building2Icon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  PackageIcon,
  PanelsTopLeftIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// The dashboard's sections. Bookings shows how many requests wait for a decision (NOTIF-02).
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/dashboard/workspaces", label: "Workspaces", icon: Building2Icon },
  { href: "/dashboard/resources", label: "Resources", icon: PackageIcon },
  { href: "/dashboard/availability", label: "Availability", icon: CalendarClockIcon },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarCheckIcon },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3Icon },
  { href: "/dashboard/widget", label: "Widget", icon: PanelsTopLeftIcon },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCardIcon },
];

export function DashboardNav({ onNavigate, pendingCount = 0 }: { onNavigate?: () => void; pendingCount?: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard">
      <ul className="grid gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          // "Overview" is active only on /dashboard itself.
          const active =
            href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {label}
                {href === "/dashboard/bookings" && pendingCount > 0 ? (
                  <span
                    data-testid="nav-pending-count"
                    className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs leading-none font-semibold text-primary-foreground"
                  >
                    {pendingCount > 99 ? "99+" : pendingCount}
                    <span className="sr-only"> pending requests</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
