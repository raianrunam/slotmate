import { DashboardMobileNav } from "@/components/dashboard-mobile-nav";
import { Logo } from "@/components/logo";
import { NotificationBadge } from "@/components/notification-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Suspense } from "react";
import { OwnerUserMenu } from "@/components/owner-user-menu";
import { getPendingCount } from "@/features/bookings/queries";
import { getOwnerPlan } from "@/features/billing/queries";

// These two read the login cookie (the pending count), so each streams in inside <Suspense>.
async function MobileNavWithCount() {
  const [pendingCount, plan] = await Promise.all([getPendingCount(), getOwnerPlan()]);
  return <DashboardMobileNav pendingCount={pendingCount} plan={plan} />;
}
async function HeaderBadge() {
  return <NotificationBadge count={await getPendingCount()} />;
}

// The top bar of the dashboard: the menu button (phones and tablets), the
// logo (when the sidebar is hidden), the notification badge, the theme toggle
// and the account menu.
export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6">
      <div className="flex items-center gap-2">
        <Suspense fallback={<DashboardMobileNav />}>
          <MobileNavWithCount />
        </Suspense>
        <div className="lg:hidden">
          <Logo href="/dashboard" />
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <Suspense fallback={<div className="size-10 md:size-8" aria-hidden="true" />}>
          <HeaderBadge />
        </Suspense>
        <ThemeToggle />
        {/* Reads the login cookie, so it sits inside <Suspense> (Cache Components). */}
        <Suspense fallback={<div className="size-10 md:size-8" aria-hidden="true" />}>
          <OwnerUserMenu />
        </Suspense>
      </div>
    </header>
  );
}
