import Link from "next/link";
import { BellIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// The bell in the dashboard header (decision D15: notifications are in-app only).
// Placeholder: the number is sample text. Later it shows how many booking
// requests are still pending, and links to them.
export function NotificationBadge({ count = 3 }: { count?: number }) {
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative size-10 md:size-8"
    >
      <Link
        href="/dashboard/bookings"
        aria-label={`Notifications: ${count} pending booking requests (placeholder)`}
      >
        <BellIcon aria-hidden="true" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
