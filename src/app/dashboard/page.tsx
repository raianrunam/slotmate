import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { StatusBadge, type BookingStatus } from "@/components/status-badge";

export const metadata: Metadata = { title: "Overview" };

// Placeholder overview. Every number and name below is sample text.
const STATS = [
  { label: "Workspaces", value: "1", note: "of 1 on the Free plan" },
  { label: "Resources", value: "2", note: "of 3 on the Free plan" },
  { label: "Requests this month", value: "12", note: "of 100 on the Free plan" },
  { label: "Waiting for a decision", value: "3", note: "pending requests" },
] as const;

const ACTIVITY: readonly { who: string; what: string; status: BookingStatus }[] = [
  { who: "Sample visitor A", what: "Meeting room, Tue 10:00", status: "pending" },
  { who: "Sample visitor B", what: "Meeting room, Wed 14:00", status: "approved" },
  { who: "Sample visitor C", what: "Desk 4, Thu 09:00", status: "rejected" },
  { who: "Sample visitor D", what: "Desk 4, Fri 11:00", status: "cancelled" },
];

export default function DashboardOverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="A summary of your workspaces and booking requests." />
      <PlaceholderNotice phase="Phase 13" />
      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="gap-1">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl font-semibold">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{stat.note}</CardContent>
          </Card>
        ))}
      </section>
      <section aria-labelledby="recent-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="recent-heading" className="font-heading text-base font-medium">
                Recent activity
              </h2>
            </CardTitle>
            <CardDescription>The latest booking requests (sample).</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {ACTIVITY.map((item) => (
                <li key={item.who} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.who}</p>
                    <p className="truncate text-sm text-muted-foreground">{item.what}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
