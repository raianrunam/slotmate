import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Pagination, PAGE_SIZE } from "@/components/pagination";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { StatusBadge, type BookingStatus } from "@/components/status-badge";
import { TableSkeleton } from "@/components/loading-skeletons";

export const metadata: Metadata = { title: "Bookings" };

const STATUSES = ["all", "pending", "approved", "rejected", "cancelled"] as const;
const SAMPLE_TOTAL = 135; // sample number, to show more than one page
const ROTATION: readonly BookingStatus[] = ["pending", "approved", "rejected", "cancelled"];

// The page number lives in the address (?page=2). Reading it is a "runtime API"
// access, so with Cache Components it happens inside <Suspense>.
async function BookingsTable({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;
  const requested = Number.parseInt(raw ?? "1", 10);
  const totalPages = Math.ceil(SAMPLE_TOTAL / PAGE_SIZE);
  const page = Math.min(Math.max(Number.isNaN(requested) ? 1 : requested, 1), totalPages);

  // Five sample rows (a real page would show up to 20, D21).
  const rows = Array.from({ length: 5 }, (_, i) => {
    const n = (page - 1) * PAGE_SIZE + i + 1;
    return {
      n,
      visitor: `Sample visitor ${n}`,
      resource: i % 2 === 0 ? "Meeting room" : "Desk 4",
      when: `Tue ${10 + i}:00`,
      status: ROTATION[(n - 1) % ROTATION.length],
    };
  });

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Visitor</TableHead>
            <TableHead className="hidden sm:table-cell">Resource</TableHead>
            <TableHead className="hidden md:table-cell">When</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.n}>
              <TableCell className="font-medium">
                {row.visitor}
                {/* On a phone the Resource and When columns are hidden, so their
                    content moves under the name: the time is essential. */}
                <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                  {row.resource} · {row.when}
                </span>
              </TableCell>
              <TableCell className="hidden sm:table-cell">{row.resource}</TableCell>
              <TableCell className="hidden md:table-cell">{row.when}</TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        page={page}
        totalItems={SAMPLE_TOTAL}
        buildHref={(p) => `/dashboard/bookings?page=${p}`}
      />
    </>
  );
}

export default function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every booking request, newest first. Approve, reject or cancel from here."
      />
      <PlaceholderNotice phase="Phase 12">
        The rows and the total below are sample text. Paging works so you can see the 20-per-page layout.
      </PlaceholderNotice>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        {/* Status filter (BOOK-07). A placeholder: it does not filter yet. */}
        {/* A group of toggle buttons (not tabs: there are no tab panels). */}
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <Button
              key={status}
              type="button"
              variant={status === "all" ? "default" : "outline"}
              aria-pressed={status === "all"}
              className="h-10 capitalize sm:h-8"
            >
              {status}
            </Button>
          ))}
        </div>
        {/* Search (BOOK-08). A placeholder: it does not search yet. */}
        <div className="grid gap-1.5 sm:w-64">
          <Label htmlFor="booking-search" className="sr-only">
            Search by visitor or resource
          </Label>
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="booking-search"
              type="search"
              placeholder="Search visitor or resource"
              className="h-10 pl-9 text-base md:text-sm"
              disabled
            />
          </div>
        </div>
      </div>
      <Suspense fallback={<TableSkeleton />}>
        <BookingsTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}
