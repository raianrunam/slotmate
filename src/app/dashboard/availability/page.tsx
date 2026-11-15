import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClockIcon, PackageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { getAvailabilityFor } from "@/features/availability/queries";
import { clockText, WEEKDAYS } from "@/features/availability/schema";
import { ResourceBadges, ResourceThumb } from "@/features/resources/components/resource-summary";
import { listResources } from "@/features/resources/queries";

export const metadata: Metadata = { title: "Availability" };

type SearchParams = Promise<{ page?: string }>;

async function AvailabilityOverview({ searchParams }: { searchParams: SearchParams }) {
  const { page } = await searchParams;
  const list = await listResources(Number.parseInt(page ?? "1", 10));
  const rows = await getAvailabilityFor(list.rows.map((r) => r.id));

  return (
    <>
      <PageHeader
        title="Availability"
        description="Choose the days a resource can be booked and its opening hours. Times are in the workspace's time zone."
      />
      {list.total === 0 ? (
        <EmptyState
          icon={PackageIcon}
          title="No resources yet"
          description="Create a resource first, then set the days and hours it can be booked."
          action={
            <Button asChild className="h-10">
              <Link href="/dashboard/resources/new">New resource</Link>
            </Button>
          }
        />
      ) : (
        <section aria-label="Resources" className="grid gap-3">
          <ul className="grid gap-3">
            {list.rows.map((resource) => {
              const mine = rows.filter((r) => r.resource_id === resource.id);
              const summary =
                mine.length === 0
                  ? "No days open yet"
                  : mine.map((r) => `${WEEKDAYS[r.weekday - 1].name.slice(0, 3)} ${clockText(r.opens_at)}–${clockText(r.closes_at)}`).join(" · ");
              return (
                <li key={resource.id}>
                  <Card data-testid="availability-card">
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <ResourceThumb resource={resource} />
                        <div className="grid min-w-0 gap-1">
                          <CardTitle className="flex flex-wrap items-center gap-2">
                            <h2 className="font-heading text-base font-medium">{resource.name}</h2>
                            <ResourceBadges resource={resource} />
                          </CardTitle>
                          <CardDescription>
                            {resource.workspaces ? `${resource.workspaces.name} · ${resource.workspaces.time_zone} time` : null}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-start justify-between gap-3">
                      <p className="min-w-0 max-w-prose text-sm text-muted-foreground">{summary}</p>
                      <Button asChild variant="outline" className="h-10 sm:h-8">
                        <Link
                          href={`/dashboard/resources/${resource.id}/availability`}
                          aria-label={`${resource.is_locked ? "View" : "Edit"} hours of ${resource.name}`}
                        >
                          <CalendarClockIcon aria-hidden="true" /> {resource.is_locked ? "View hours" : "Edit hours"}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
          <Pagination page={list.page} totalItems={list.total} buildHref={(p) => `/dashboard/availability?page=${p}`} />
        </section>
      )}
    </>
  );
}

// Every dashboard page checks the owner first (A3 layer 2). A unit test enforces this.
export default function AvailabilityPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerGate>
      <AvailabilityOverview searchParams={searchParams} />
    </OwnerGate>
  );
}
