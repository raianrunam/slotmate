import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getWorkspaceUsage } from "@/features/workspaces/queries";
import { getResourceUsage } from "@/features/resources/queries";
import { whenLabel } from "@/features/bookings/format";
import { getOverviewStats, getPendingRequests, getRecentActivity, type BookingListRow } from "@/features/bookings/queries";
import { PLANS } from "@/lib/plans";
import { getOverviewTrend } from "@/features/analytics/queries";
import { dayLabel } from "@/features/analytics/aggregate";
import { CountBarChart } from "@/features/analytics/components/bar-chart";
import { DataTable } from "@/features/analytics/components/analytics-view";

export const metadata: Metadata = { title: "Overview" };

// Real numbers from the database (Phase 8 workspaces, Phase 12 bookings), read with the owner's own
// session, so they only ever count this owner's rows.
async function WorkspacesStatCard() {
  const usage = await getWorkspaceUsage();
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>Workspaces</CardDescription>
        <CardTitle className="text-3xl font-semibold" data-testid="overview-workspaces-count">
          {usage.used}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1 text-sm text-muted-foreground">
        <span>
          of {usage.max} on the {PLANS[usage.plan].name} plan
        </span>
        <Link href="/dashboard/workspaces" className="font-medium text-foreground underline underline-offset-4">
          Manage workspaces
        </Link>
      </CardContent>
    </Card>
  );
}

// DASH-02: all resources across all workspaces (locked ones included, like the plan limit).
async function ResourcesStatCard() {
  const usage = await getResourceUsage();
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>Resources</CardDescription>
        <CardTitle className="text-3xl font-semibold" data-testid="overview-resources-count">
          {usage.used}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1 text-sm text-muted-foreground">
        <span>
          of {usage.max} on the {PLANS[usage.plan].name} plan
        </span>
        <Link href="/dashboard/resources" className="font-medium text-foreground underline underline-offset-4">
          Manage resources
        </Link>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, note, testId }: { label: string; value: string | number; note: string; testId: string }) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold" data-testid={testId}>
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{note}</CardContent>
    </Card>
  );
}

// Near the monthly limit (D19): a prompt from 80% of the allowance. Free owners are pointed to Pro;
// a Pro owner at the limit is told the count restarts on the 1st (UTC).
const NEAR_LIMIT = 0.8;

async function BookingStatCards() {
  const stats = await getOverviewStats();
  const near = stats.usedThisMonth >= Math.ceil(stats.maxPerMonth * NEAR_LIMIT);
  const atLimit = stats.usedThisMonth >= stats.maxPerMonth;
  return (
    <>
      <StatCard label="Total booking requests" value={stats.total} note="in every status" testId="overview-total-bookings" />
      <StatCard label="Waiting for a decision" value={stats.pending} note="pending requests" testId="overview-pending" />
      <Card>
        <CardHeader className="gap-1">
          <CardDescription>Requests by status</CardDescription>
          <CardTitle className="sr-only">Pending, approved and rejected</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Pending</dt>
              <dd className="text-2xl font-semibold" data-testid="overview-status-pending">{stats.pending}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Approved</dt>
              <dd className="text-2xl font-semibold" data-testid="overview-status-approved">{stats.approved}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rejected</dt>
              <dd className="text-2xl font-semibold" data-testid="overview-status-rejected">{stats.rejected}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <StatCard label="Approved this month" value={stats.approvedThisMonth} note="approved since the 1st (UTC)" testId="overview-approved-month" />
      <Card className="sm:col-span-2 lg:col-span-1">
        <CardHeader className="gap-1">
          <CardDescription>Requests this month</CardDescription>
          <CardTitle className="text-3xl font-semibold" data-testid="overview-usage">
            {stats.usedThisMonth} of {stats.maxPerMonth.toLocaleString("en-US")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground">
          <span>
            on the {PLANS[stats.plan].name} plan. Deleted requests still count; the count restarts on the 1st (UTC).
          </span>
          {near ? (
            <div role="status" data-testid="overview-limit-prompt" className="grid gap-2 rounded-lg border border-border bg-muted p-3 text-foreground">
              <p className="font-medium">
                {atLimit
                  ? "You have reached this month's limit. Your public page is not accepting new requests."
                  : "You are close to this month's limit of booking requests."}
              </p>
              {stats.plan === "free" ? (
                <div>
                  <Button asChild className="h-10 sm:h-8">
                    <Link href="/dashboard/billing">See Pro</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

function ActivityList({ rows, label, testId }: { rows: BookingListRow[]; label: string; testId: string }) {
  return (
    <ul className="divide-y divide-border" aria-label={label} data-testid={testId}>
      {rows.map((item) => {
        const when = whenLabel(item.starts_at, item.ends_at, item.timeZone);
        return (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <Link href={`/dashboard/bookings/${item.id}`} className="block truncate text-sm font-medium underline-offset-4 hover:underline">
                {item.visitor_name}
              </Link>
              <p className="truncate text-sm text-muted-foreground">
                {item.resourceName} · {when.date}, {when.range} ({when.zone})
              </p>
            </div>
            <StatusBadge status={item.status} />
          </li>
        );
      })}
    </ul>
  );
}

async function ActivitySections() {
  const [recent, pending] = await Promise.all([getRecentActivity(5), getPendingRequests(5)]);
  return (
    <>
      <section aria-labelledby="pending-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="pending-heading" className="font-heading text-base font-medium">
                Waiting for your decision
              </h2>
            </CardTitle>
            <CardDescription>Pending requests, the longest waiting first.</CardDescription>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="pending-empty">
                Nothing is waiting for a decision.
              </p>
            ) : (
              <ActivityList rows={pending} label="Pending requests" testId="pending-list" />
            )}
          </CardContent>
        </Card>
      </section>
      <section aria-labelledby="recent-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="recent-heading" className="font-heading text-base font-medium">
                Recent activity
              </h2>
            </CardTitle>
            <CardDescription>The 5 latest booking requests.</CardDescription>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="recent-empty">
                No booking requests yet.
              </p>
            ) : (
              <ActivityList rows={recent} label="Recent activity" testId="recent-list" />
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

// DASH-05: requests per day for the last 30 days across all workspaces. Same chart and table as the Analytics page.
async function TrendSection() {
  const trend = await getOverviewTrend();
  const data = trend.daily.map((d) => ({ label: d.label, value: d.count }));
  return (
    <section aria-labelledby="trend-heading" data-testid="overview-trend">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id="trend-heading" className="font-heading text-base font-medium">
              Booking requests, last 30 days
            </h2>
          </CardTitle>
          <CardDescription>Requests received each day, across all your workspaces.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {trend.total === 0 ? (
            <p data-testid="overview-trend-empty" className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              No data yet. No booking requests were received in the last 30 days.
            </p>
          ) : (
            <CountBarChart data={data} valueName="Requests" ariaLabel="Bar chart of booking requests received per day over the last 30 days, all workspaces. The same numbers are in the table below." />
          )}
          <DataTable testId="overview-trend-table" caption="Booking requests received per day, all workspaces" head={["Day", "Requests"]} rows={trend.daily.map((d) => [`${dayLabel(d.date)} (${d.date})`, d.count])} />
          <p className="mt-3 text-sm text-muted-foreground" data-testid="overview-trend-note">
            The 30 days end on the latest local today among your workspaces. Each request is counted on the day it was received in its own workspace&apos;s time zone. Deleted requests are not counted.
          </p>
          {trend.truncated ? <p className="mt-2 text-sm text-muted-foreground">Very many requests: the numbers cover the first 20,000 only.</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}

function DashboardOverviewContent() {
  return (
    <>
      <PageHeader title="Overview" description="A summary of your workspaces and booking requests." />
      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <WorkspacesStatCard />
        <ResourcesStatCard />
        <BookingStatCards />
      </section>
      <TrendSection />
      <ActivitySections />
    </>
  );
}

// Every dashboard page checks the owner first (A3 layer 2). A unit test enforces this.
export default function DashboardOverviewPage() {
  return (
    <OwnerGate>
      <DashboardOverviewContent />
    </OwnerGate>
  );
}
