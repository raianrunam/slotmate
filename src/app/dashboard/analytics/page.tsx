import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LayoutDashboardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { AnalyticsFilters } from "@/features/analytics/components/analytics-filters";
import { AnalyticsSkeleton, AnalyticsView } from "@/features/analytics/components/analytics-view";
import {
  dayLabel,
  defaultRange,
  parseRange,
  parseWorkspaceParam,
  pickWorkspace,
  first,
  type AnalyticsAccess,
  type SearchParamValue,
} from "@/features/analytics/aggregate";
import { getAnalytics, getAnalyticsAccess, listAnalyticsWorkspaces, type AnalyticsWorkspace } from "@/features/analytics/queries";
import { todayInZone } from "@/lib/time/slots";

export const metadata: Metadata = { title: "Analytics" };

type SearchParams = Promise<{ workspace?: SearchParamValue; from?: SearchParamValue; to?: SearchParamValue }>;

// The data part: loaded behind a Suspense boundary so the page frame and the filters show at once.
async function AnalyticsData({
  workspace,
  access,
  rawFrom,
  rawTo,
}: {
  workspace: AnalyticsWorkspace;
  access: AnalyticsAccess;
  rawFrom: string | undefined;
  rawTo: string | undefined;
}) {
  // Only a Pro owner may choose a period (ANLT-06); a Free owner's from/to in the address are ignored.
  const parsed = access.rangeFilter
    ? parseRange(rawFrom, rawTo, workspace.timeZone)
    : { range: defaultRange(workspace.timeZone), error: null, custom: false };
  const result = await getAnalytics({ workspace, range: parsed.range, access });
  const periodText = `${dayLabel(parsed.range.from)} to ${dayLabel(parsed.range.to)} ${parsed.range.to.slice(0, 4)} (${workspace.timeZone}).`;
  return <AnalyticsView data={result.data} access={access} rangeError={parsed.error} truncated={result.truncated} periodText={periodText} />;
}

async function AnalyticsContent({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const workspaces = await listAnalyticsWorkspaces();
  const header = (
    <PageHeader
      title="Analytics"
      description="Booking requests per day and by status. Pro adds monthly and per-resource views and a date range."
    />
  );

  if (workspaces.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={LayoutDashboardIcon}
          title="Create a workspace first"
          description="Analytics are shown for one workspace. Create a workspace and share its booking page to start collecting requests."
          action={
            <Button asChild className="h-10 sm:h-8">
              <Link href="/dashboard/workspaces">Go to workspaces</Link>
            </Button>
          }
        />
      </>
    );
  }

  // Only the owner's own workspaces can be chosen; an unknown or foreign id falls back to the first one.
  const workspace = pickWorkspace(workspaces, parseWorkspaceParam(raw.workspace)) ?? workspaces[0];
  const access = await getAnalyticsAccess();
  const rawFrom = first(raw.from);
  const rawTo = first(raw.to);
  const shown = access.rangeFilter
    ? parseRange(rawFrom, rawTo, workspace.timeZone)
    : { range: defaultRange(workspace.timeZone), custom: false };

  return (
    <>
      {header}
      <AnalyticsFilters
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
        selectedId={workspace.id}
        rangeFilter={access.rangeFilter}
        range={shown.range}
        custom={shown.custom}
        maxDate={todayInZone(workspace.timeZone)}
      />
      <Suspense key={`${workspace.id}|${rawFrom ?? ""}|${rawTo ?? ""}`} fallback={<AnalyticsSkeleton />}>
        <AnalyticsData workspace={workspace} access={access} rawFrom={rawFrom} rawTo={rawTo} />
      </Suspense>
    </>
  );
}

// Every dashboard page checks the owner first (A3 layer 2). A unit test enforces this.
export default function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerGate>
      <AnalyticsContent searchParams={searchParams} />
    </OwnerGate>
  );
}
