import Link from "next/link";
import { BellIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// The bell in the dashboard header (NOTIF-02, decision D15: notifications are in-app only).
// It shows how many booking requests wait for a decision, and links to the booking list
// filtered to those. The number is read by the caller (the owner's own pending bookings).
export function NotificationBadge({ count = 0 }: { count?: number }) {
  return (
    <Button asChild variant="ghost" size="icon" className="relative size-10 md:size-8">
      <Link
        href={count > 0 ? "/dashboard/bookings?status=pending" : "/dashboard/bookings"}
        aria-label={count === 0 ? "Notifications: no pending booking requests" : `Notifications: ${count} pending booking request${count === 1 ? "" : "s"}`}
        data-testid="header-notifications"
      >
        <BellIcon aria-hidden="true" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            data-testid="header-pending-count"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
