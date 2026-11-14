import { DashboardNav } from "@/components/dashboard-nav";
import { Logo } from "@/components/logo";
import { UpgradePrompt } from "@/components/upgrade-prompt";

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
        <DashboardNav />
      </div>
      <UpgradePrompt />
    </aside>
  );
}
