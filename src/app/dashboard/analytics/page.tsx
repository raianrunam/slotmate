import type { Metadata } from "next";
import Link from "next/link";
import { LockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata: Metadata = { title: "Analytics" };

// Bar heights are sample values, not data.
const BARS = [30, 55, 40, 70, 50, 85, 60] as const;

function ChartSketch() {
  return (
    <div
      aria-hidden="true"
      className="flex h-40 items-end gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3"
    >
      {BARS.map((h, i) => (
        <span key={i} className="flex-1 rounded-t bg-primary/60" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

// A Pro-only area: locked, with an upgrade prompt (ANLT-03/04/06).
function LockedCard({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title} <Badge variant="secondary">Pro</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
          <LockIcon className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="max-w-xs text-sm text-muted-foreground">
            This chart is part of the Pro plan. Free owners see this locked area instead of data.
          </p>
          <Button asChild className="h-10 sm:h-8">
            <Link href="/dashboard/billing">Upgrade to Pro</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Booking requests per day and by status. Pro adds monthly and per-resource views."
      />
      <PlaceholderNotice phase="Phase 13">
        The charts are sketches: they are drawn with sample bar heights and read no data.
      </PlaceholderNotice>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Requests per day</CardTitle>
            <CardDescription>The last 30 days (Free plan).</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartSketch />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Requests by status</CardTitle>
            <CardDescription>Pending, approved, rejected and cancelled.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartSketch />
          </CardContent>
        </Card>
        <LockedCard title="Requests per month" description="One bar per month." />
        <LockedCard title="Resource usage" description="Which resources get the most requests, with date filters." />
      </div>
    </>
  );
}
