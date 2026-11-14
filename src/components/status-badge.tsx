import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database.types";

// The four booking statuses (the booking_status enum in the database).
export type BookingStatus = Database["public"]["Enums"]["booking_status"];

const LABEL: Record<BookingStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

// Colours come from the status tokens in globals.css (all above 6:1 contrast).
// The status is always written in words as well, never colour alone.
const STYLE: Record<BookingStatus, string> = {
  pending: "bg-status-pending-bg text-status-pending-fg",
  approved: "bg-status-approved-bg text-status-approved-fg",
  rejected: "bg-status-rejected-bg text-status-rejected-fg",
  cancelled: "bg-status-cancelled-bg text-status-cancelled-fg",
};

export function StatusBadge({
  status,
  className,
}: {
  status: BookingStatus;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn("border-0", STYLE[status], className)}>
      {LABEL[status]}
    </Badge>
  );
}
