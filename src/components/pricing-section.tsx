import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlanCard } from "@/components/plan-card";
import { PLANS } from "@/lib/plans";

// Free vs Pro side by side. The numbers come from src/lib/plans.ts, which
// mirrors the plan_limits table in the database.
export function PricingSection() {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="pricing-heading"
            className="font-heading text-3xl font-semibold tracking-tight"
          >
            Simple pricing
          </h2>
          <p className="mt-3 text-muted-foreground">
            Start free. Upgrade when you need more workspaces, resources or booking requests.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <PlanCard
            plan={PLANS.free}
            action={
              <Button asChild variant="outline" className="h-11 w-full sm:h-9">
                <Link href="/signup">Get started free</Link>
              </Button>
            }
          />
          <PlanCard
            plan={PLANS.pro}
            highlighted
            badge="Most popular"
            action={
              <Button asChild className="h-11 w-full sm:h-9">
                <Link href="/signup">Start with Pro</Link>
              </Button>
            }
          />
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Paid plans are not available yet: SlotMate is still being built.
        </p>
      </div>
    </section>
  );
}
