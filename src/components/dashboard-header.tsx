import { DashboardMobileNav } from "@/components/dashboard-mobile-nav";
import { Logo } from "@/components/logo";
import { NotificationBadge } from "@/components/notification-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

// The top bar of the dashboard: the menu button (phones and tablets), the
// logo (when the sidebar is hidden), the notification badge, the theme toggle
// and the account menu.
export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6">
      <div className="flex items-center gap-2">
        <DashboardMobileNav />
        <div className="lg:hidden">
          <Logo href="/dashboard" />
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <NotificationBadge />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
