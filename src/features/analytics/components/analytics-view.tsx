import Link from "next/link";
import { BarChart3Icon, LockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { FormMessage } from "@/components/form-message";
import { StatusBadge, type BookingStatus } from "@/components/status-badge";
import { CountBarChart, type BarDatum } from "@/features/analytics/components/bar-chart";
import { BOOKING_STATUSES, dayLabel, type AnalyticsAccess, type AnalyticsData } from "@/features/analytics/aggregate";

// The analytics sections. Server components: the numbers are already computed; only plain numbers reach the
// chart (a small client component). Every chart sits beside a text table (details), and a Pro section a Free owner
// may not see is replaced by a locked card that carries NO data.

const STATUS_LABEL: Record<BookingStatus, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" };

function DataTable({ caption, head, rows, testId }: { caption: string; head: [string, string]; rows: [string, number][]; testId: string }) {
  return (
    <details data-testid={testId} className="mt-3 rounded-md border border-border text-sm">
      <summary className="cursor-pointer px-3 py-2 font-medium">View as a table</summary>
      <div className="max-h-72 overflow-auto px-3 pb-3">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{head[0]}</TableHead>
              <TableHead scope="col" className="text-right">
                {head[1]}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([label, value], i) => (
              <TableRow key={`${i}-${label}`}>
                <TableCell>{label}</TableCell>
                <TableCell className="text-right tabular-nums">{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}

function Section({ title, description, testId, children }: { title: string; description: string; testId: string; children: React.ReactNode }) {
  return (
    <Card data-testid={testId} className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function NoData({ text }: { text: string }) {
  return (
    <p data-testid="no-data" className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

export function LockedSection({ title, description, testId }: { title: string; description: string; testId: string }) {
  return (
    <Card data-testid={testId} className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <h2>{title}</h2> <Badge variant="secondary">Pro</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
          <LockIcon className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="max-w-xs text-sm text-muted-foreground">This view is part of the Pro plan.</p>
          <Button asChild className="h-10 sm:h-8">
            <Link href="/dashboard/billing">Upgrade to Pro</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading analytics" data-testid="analytics-loading">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
    </div>
  );
}

export function AnalyticsView({
  data,
  access,
  rangeError,
  truncated,
  periodText,
}: {
  data: AnalyticsData;
  access: AnalyticsAccess;
  rangeError: string | null;
  truncated: boolean;
  periodText: string;
}) {
  const { totals, daily } = data;
  const empty = totals.total === 0;
  const dailyData: BarDatum[] = daily.map((d) => ({ label: d.label, value: d.count }));
  const statusData: BarDatum[] = BOOKING_STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: totals[s] }));
  const percent = (n: number) => (totals.total === 0 ? "0%" : `${Math.round((n / totals.total) * 100)}%`);

  return (
    <div className="grid gap-4">
      {rangeError ? (
        <FormMessage tone="error" testId="range-error">
          {rangeError} Showing the last 30 days instead.
        </FormMessage>
      ) : null}
      {truncated ? (
        <FormMessage tone="info" testId="analytics-truncated">
          This period has a very large number of requests. The numbers cover the first 20,000 only. Choose a shorter period.
        </FormMessage>
      ) : null}
      <p className="text-sm text-muted-foreground" data-testid="analytics-period">
        {periodText} Requests are counted by the day they were received, in this workspace&apos;s time zone. Numbers count the bookings that still exist, so a deleted booking is not counted.
      </p>

      <section aria-label="Totals" data-testid="analytics-totals" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-sm text-muted-foreground">Total requests</p>
          <p className="text-2xl font-semibold tabular-nums" data-testid="total-all">
            {totals.total}
          </p>
        </div>
        {BOOKING_STATUSES.map((s) => (
          <div key={s} className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm">
              <StatusBadge status={s} />
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid={`total-${s}`}>
              {totals[s]}
            </p>
          </div>
        ))}
      </section>

      {empty ? (
        <EmptyState
          icon={BarChart3Icon}
          title="No data yet"
          description="No booking requests were received in this period. When visitors book through your public page, the charts fill in."
          headingLevel={2}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          testId="chart-daily"
          title="Requests per day"
          description={access.rangeFilter ? "Booking requests received each day of the chosen period." : "Booking requests received each day of the last 30 days."}
        >
          {empty ? (
            <NoData text="No data yet." />
          ) : (
            <>
              <CountBarChart data={dailyData} valueName="Requests" ariaLabel="Bar chart of booking requests received per day. The same numbers are in the table below." />
              <DataTable testId="table-daily" caption="Booking requests received per day" head={["Day", "Requests"]} rows={daily.map((d) => [`${dayLabel(d.date)} (${d.date})`, d.count])} />
            </>
          )}
        </Section>

        <Section testId="chart-status" title="Requests by status" description="How the requests in this period are split between statuses.">
          {empty ? (
            <NoData text="No data yet." />
          ) : (
            <>
              <CountBarChart horizontal data={statusData} valueName="Requests" ariaLabel="Bar chart of booking requests by status. The same numbers are in the table below." />
              <DataTable
                testId="table-status"
                caption="Booking requests by status"
                head={["Status", "Requests (share)"]}
                rows={BOOKING_STATUSES.map((s) => [`${STATUS_LABEL[s]} (${percent(totals[s])})`, totals[s]])}
              />
            </>
          )}
        </Section>

        {data.monthly ? (
          <Section testId="chart-monthly" title="Requests per month" description="Booking requests received in each calendar month of the period.">
            {empty ? (
              <NoData text="No data yet." />
            ) : (
              <>
                <CountBarChart data={data.monthly.map((m) => ({ label: m.label, value: m.count }))} valueName="Requests" ariaLabel="Bar chart of booking requests received per month. The same numbers are in the table below." />
                <DataTable testId="table-monthly" caption="Booking requests received per month" head={["Month", "Requests"]} rows={data.monthly.map((m) => [m.label, m.count])} />
              </>
            )}
          </Section>
        ) : (
          <LockedSection testId="locked-monthly" title="Requests per month" description="One bar per month." />
        )}

        {data.resources ? (
          <Section testId="chart-resources" title="Resource usage" description="Booking requests per resource in this period, most used first.">
            {data.resources.length === 0 ? (
              <NoData text="This workspace has no resources yet." />
            ) : (
              <>
                {empty ? null : (
                  <CountBarChart horizontal data={data.resources.map((r) => ({ label: r.name, value: r.count }))} valueName="Requests" ariaLabel="Bar chart of booking requests per resource. The same numbers are in the table below." />
                )}
                <DataTable testId="table-resources" caption="Booking requests per resource" head={["Resource", "Requests"]} rows={data.resources.map((r) => [r.name, r.count])} />
              </>
            )}
          </Section>
        ) : (
          <LockedSection testId="locked-resources" title="Resource usage" description="Which resources get the most requests." />
        )}
      </div>
    </div>
  );
}
