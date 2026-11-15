import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEARCH_MAX, STATUS_FILTERS, type StatusFilter } from "@/features/bookings/schema";

// The status filter and the search box (BOOK-07, BOOK-08). Two plain GET forms, so they work
// without JavaScript and the choice lives in the address (?status=&q=&page=): the back button works.
// A change of filter or search always starts at page 1 (no "page" is sent).
export function BookingFilters({ status, q }: { status: StatusFilter; q: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
      {/* A group of toggle buttons (not tabs: there are no tab panels). The search text is kept. */}
      <form method="get" action="/dashboard/bookings" role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {q ? <input type="hidden" name="q" value={q} /> : null}
        {STATUS_FILTERS.map((value) => (
          <Button
            key={value}
            type="submit"
            name="status"
            value={value}
            variant={value === status ? "default" : "outline"}
            aria-pressed={value === status}
            className="h-10 capitalize sm:h-8"
          >
            {value}
          </Button>
        ))}
      </form>
      {/* The chosen status is kept. */}
      <form method="get" action="/dashboard/bookings" role="search" className="flex gap-2">
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        <div className="grid gap-1.5 sm:w-64">
          <Label htmlFor="booking-search" className="sr-only">
            Search by visitor name, email or resource
          </Label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="booking-search"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={SEARCH_MAX}
              placeholder="Search visitor or resource"
              className="h-10 pl-9 text-base md:text-sm"
              autoComplete="off"
            />
          </div>
        </div>
        <Button type="submit" variant="outline" className="h-10 sm:h-8">
          Search
        </Button>
      </form>
    </div>
  );
}
