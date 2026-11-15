import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DateRange } from "@/features/analytics/aggregate";
import { MIN_DATE } from "@/features/analytics/aggregate";

// The workspace selector, and for Pro the date range. One plain GET form, so it works without JavaScript and the
// choice lives in the address (?workspace=&from=&to=): the back button and a copied link work.
// The selector lists the owner's own workspaces only (the list comes from the owner's session, RLS).
export function AnalyticsFilters({
  workspaces,
  selectedId,
  rangeFilter,
  range,
  custom,
  maxDate,
}: {
  workspaces: { id: string; name: string }[];
  selectedId: string;
  rangeFilter: boolean;
  range: DateRange;
  custom: boolean;
  maxDate: string;
}) {
  return (
    <form method="get" action="/dashboard/analytics" aria-label="Analytics filters" data-testid="analytics-filters" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="analytics-workspace">Workspace</Label>
        <select
          id="analytics-workspace"
          name="workspace"
          defaultValue={selectedId}
          className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8 sm:w-64 md:text-sm"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      {rangeFilter ? (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-from">From</Label>
            <Input id="analytics-from" name="from" type="date" min={MIN_DATE} max={maxDate} defaultValue={custom ? range.from : ""} className="h-10 sm:h-8 sm:w-40" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-to">To</Label>
            <Input id="analytics-to" name="to" type="date" min={MIN_DATE} max={maxDate} defaultValue={custom ? range.to : ""} className="h-10 sm:h-8 sm:w-40" />
          </div>
        </>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" className="h-10 sm:h-8">
          Show
        </Button>
        {rangeFilter && custom ? (
          <Button asChild variant="outline" className="h-10 sm:h-8">
            <Link href={`/dashboard/analytics?workspace=${selectedId}`}>Last 30 days</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
