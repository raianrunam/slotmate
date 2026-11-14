import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Lists show 20 items per page (decision D21). */
export const PAGE_SIZE = 20;

// Previous / next pagination for lists. It only builds links: the page number
// lives in the address (for example ?page=2), so it works without JavaScript
// and the back button behaves.
export function Pagination({
  page,
  totalItems,
  pageSize = PAGE_SIZE,
  buildHref,
  className,
}: {
  /** The current page, starting at 1. Out-of-range values are clamped. */
  page: number;
  totalItems: number;
  pageSize?: number;
  /** The address of a given page, for example (p) => `/dashboard/bookings?page=${p}`. */
  buildHref: (page: number) => string;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const first = totalItems === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, totalItems);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-col items-center gap-3 sm:flex-row sm:justify-between",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        Showing {first}–{last} of {totalItems}
      </p>
      <div className="flex items-center gap-2">
        {current > 1 ? (
          <Button asChild variant="outline" className="h-10 sm:h-8">
            <Link href={buildHref(current - 1)} rel="prev">
              <ChevronLeftIcon aria-hidden="true" /> Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" className="h-10 sm:h-8" disabled>
            <ChevronLeftIcon aria-hidden="true" /> Previous
          </Button>
        )}
        <span className="px-2 text-sm">
          Page {current} of {totalPages}
        </span>
        {current < totalPages ? (
          <Button asChild variant="outline" className="h-10 sm:h-8">
            <Link href={buildHref(current + 1)} rel="next">
              Next <ChevronRightIcon aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" className="h-10 sm:h-8" disabled>
            Next <ChevronRightIcon aria-hidden="true" />
          </Button>
        )}
      </div>
    </nav>
  );
}
