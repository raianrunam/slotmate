import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/form-message";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { PlanCard } from "@/components/plan-card";
import { PLANS } from "@/lib/plans";
import { openCustomerPortal, startCheckout } from "@/features/billing/actions";
import { ConfirmingPayment } from "@/features/billing/components/confirming-payment";
import { getBillingSummary, getDowngradeState } from "@/features/billing/queries";

export const metadata: Metadata = { title: "Billing" };

const ERRORS: Record<string, string> = {
  checkout: "We could not start the payment page. Please try again in a moment.",
  portal: "We could not open the subscription page. Please try again in a moment.",
  already_pro: "You already have a Pro subscription. Use Manage subscription to change or cancel it.",
  no_customer: "There is no payment account to manage yet. Upgrade to Pro first.",
};

const NOTICES: Record<string, string> = {
  selection_saved: "Your choice is saved. The rest stays locked until you delete it or upgrade.",
};

function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
}

type SearchParams = Promise<{ checkout?: string; error?: string; notice?: string }>;

async function BillingContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [summary, downgrade] = await Promise.all([getBillingSummary(), getDowngradeState()]);
  const isPro = summary.plan === "pro";
  const until = dateLabel(summary.currentPeriodEnd);

  const usage = [
    { label: "Workspaces", used: summary.workspaces, max: summary.limits.workspaces },
    { label: "Resources", used: summary.resources, max: summary.limits.resources },
    { label: "Requests this month", used: summary.requestsThisMonth, max: summary.limits.requests },
  ];

  let planLine: string;
  if (isPro && summary.cancelAtPeriodEnd) planLine = until ? `Pro until ${until}. It will not renew.` : "Pro. It will not renew.";
  else if (isPro) planLine = until ? `Renews on ${until}.` : "Active.";
  else if (summary.hasSubscription) planLine = "Your last payment did not go through, so you are on the Free limits until it is fixed. Open Manage subscription to update your card.";
  else planLine = "Free forever. Upgrade any time.";

  const showManage = summary.hasSubscription && summary.hasCustomer;

  return (
    <>
      <PageHeader title="Billing" description="Your plan, what you have used, and how to upgrade." />

      {params.error && ERRORS[params.error] ? <FormMessage tone="error" testId="billing-error">{ERRORS[params.error]}</FormMessage> : null}
      {params.notice && NOTICES[params.notice] ? <FormMessage tone="success" testId="billing-notice">{NOTICES[params.notice]}</FormMessage> : null}
      {params.checkout === "cancelled" ? (
        <FormMessage tone="info" testId="checkout-cancelled">Checkout was cancelled. You were not charged and your plan has not changed.</FormMessage>
      ) : null}
      {params.checkout === "success" && !isPro ? <ConfirmingPayment /> : null}
      {params.checkout === "success" && isPro ? (
        <FormMessage tone="success" testId="checkout-success">Payment confirmed. Your Pro plan is active.</FormMessage>
      ) : null}

      {downgrade.needed ? (
        <FormMessage tone="error" testId="billing-selection-needed">
          You have more than the Free plan allows, so your items are locked.{" "}
          <Link href="/dashboard/billing/downgrade" className="font-medium underline">Choose what to keep</Link>.
        </FormMessage>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Current plan</CardTitle>
            <Badge data-testid="current-plan">{isPro ? "Pro" : "Free"}</Badge>
            {summary.status ? <Badge variant="outline" data-testid="plan-status">{summary.status.replaceAll("_", " ")}</Badge> : null}
          </div>
          <CardDescription data-testid="plan-line">{planLine}</CardDescription>
        </CardHeader>
        {showManage ? (
          <CardContent>
            <form action={openCustomerPortal}>
              <Button type="submit" variant="outline" className="h-11 w-full sm:h-9 sm:w-fit">Manage subscription</Button>
            </form>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>Compared with the {isPro ? "Pro" : "Free"} plan limits.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-5">
            {usage.map((item) => {
              const percent = Math.min(100, Math.round((item.used / item.max) * 100));
              return (
                <li key={item.label} className="grid gap-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-muted-foreground">{item.used} of {item.max}</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={item.label}
                    aria-valuemin={0}
                    aria-valuemax={item.max}
                    aria-valuenow={Math.min(item.used, item.max)}
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
        <PlanCard plan={PLANS.free} badge={isPro ? undefined : "Your plan"} />
        <PlanCard
          plan={PLANS.pro}
          highlighted
          badge={isPro ? "Your plan" : undefined}
          action={
            isPro || summary.hasSubscription ? (
              showManage ? (
                <form action={openCustomerPortal}>
                  <Button type="submit" className="h-11 w-full sm:h-9">Manage subscription</Button>
                </form>
              ) : null
            ) : params.checkout === "success" ? (
              <p className="text-sm text-muted-foreground" data-testid="upgrade-waiting">
                Your payment is being confirmed. Please do not pay again.
              </p>
            ) : (
              <form action={startCheckout}>
                <Button type="submit" className="h-11 w-full sm:h-9" data-testid="upgrade-button">Upgrade to Pro</Button>
              </form>
            )
          }
        />
      </div>
    </>
  );
}

// Every dashboard page checks the owner first (A3 layer 2). A unit test enforces this.
export default function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerGate>
      <BillingContent searchParams={searchParams} />
    </OwnerGate>
  );
}
