import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/plans";

// A small card that nudges a Free owner towards Pro. Placeholder: it does not
// know the owner's real plan yet (that needs the database, Phase 15).
export function UpgradePrompt() {
  const { free, pro } = PLANS;
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
        You are on the {free.name} plan
      </p>
      <p className="text-muted-foreground">
        {pro.name} gives you {pro.limits.maxWorkspaces} workspaces,{" "}
        {pro.limits.maxResources} resources and{" "}
        {pro.limits.maxMonthlyBookings.toLocaleString("en-US")} booking requests a month.
      </p>
      <Button asChild className="h-10 w-full sm:h-8">
        <Link href="/dashboard/billing">See Pro</Link>
      </Button>
      <p className="text-xs text-muted-foreground">Placeholder: plan shown is sample text.</p>
    </div>
  );
}
