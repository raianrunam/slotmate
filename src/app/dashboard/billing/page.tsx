import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { PlanCard } from "@/components/plan-card";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Billing" };

// Sample usage numbers to show the layout (BILL-03). Not real data.
const USAGE = [
  { label: "Workspaces", used: 1, max: PLANS.free.limits.maxWorkspaces },
  { label: "Resources", used: 2, max: PLANS.free.limits.maxResources },
  { label: "Requests this month", used: 12, max: PLANS.free.limits.maxMonthlyBookings },
] as const;

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan, what you have used, and how to upgrade."
      />
      <PlaceholderNotice phase="Phase 15">
        Payments are not connected yet. The plan and the usage below are sample text; the limits are the real ones.
      </PlaceholderNotice>
      <Card>
        <CardHeader>
          <CardTitle>Usage (sample)</CardTitle>
          <CardDescription>Compared with the Free plan limits.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-5">
            {USAGE.map((item) => {
              const percent = Math.round((item.used / item.max) * 100);
              return (
                <li key={item.label} className="grid gap-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-muted-foreground">
                      {item.used} of {item.max}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={item.label}
                    aria-valuemin={0}
                    aria-valuemax={item.max}
                    aria-valuenow={item.used}
                    className="h-2 overflow-hidden rounded-full bg-muted"
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
      <h2 className="sr-only">Plans</h2>
      <div className="grid gap-6 md:grid-cols-2">
        <PlanCard plan={PLANS.free} badge="Your plan (sample)" />
        <PlanCard
          plan={PLANS.pro}
          highlighted
          action={
            <Button className="h-11 w-full sm:h-9" disabled>
              Upgrade to Pro
            </Button>
          }
        />
      </div>
    </>
  );
}
