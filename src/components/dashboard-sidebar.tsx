import { Suspense } from "react";
import { DashboardNav } from "@/components/dashboard-nav";
import { Logo } from "@/components/logo";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { getPendingCount } from "@/features/bookings/queries";

// The navigation with the pending-request count (NOTIF-02). It reads the login cookie, so it streams in.
async function SidebarNav() {
  return <DashboardNav pendingCount={await getPendingCount()} />;
}

// The fixed sidebar of the dashboard on desktop (1024 px and wider).
// Below that width the same navigation opens from the header in a sheet.
export function DashboardSidebar() {
  return (
    <aside
      aria-label="Sidebar"
      className="hidden w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 lg:flex"
    >
      <div className="flex h-10 items-center px-1">
        <Logo href="/dashboard" />
      </div>
      <div className="flex-1">
        {/* usePathname() needs the address, which is not known while a dynamic
            route (/dashboard/workspaces/[id]) is prerendered, so it streams in. */}
        <Suspense fallback={null}>
          <SidebarNav />
        </Suspense>
      </div>
      <UpgradePrompt />
    </aside>
  );
}
