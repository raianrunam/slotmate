import type { Metadata } from "next";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

// Dashboard pages are private owner pages, so search engines must not list them.
export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s | SlotMate" },
  robots: { index: false, follow: false },
};

// The owner area frame: sidebar on desktop (1024 px and wider), header with a
// menu button below that. No data and no login check yet (Phases 7 onwards).
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-1">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader />
        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full max-w-6xl gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
