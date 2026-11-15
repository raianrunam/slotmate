import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS, resourceUsageLabel } from "@/lib/plans";

// Shown when the plan's resource limit stops a create. The database trigger is
// the real guard; this is the friendly face of it (A6).
export function ResourceLimitNotice({ used, max }: { used?: number; max?: number }) {
  const pro = PLANS.pro;
  return (
    <div
      role="status"
      data-testid="resource-limit-notice"
      className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm"
    >
      <p className="flex items-center gap-2 font-medium">
        <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
        You have reached your resource limit
        {used !== undefined && max !== undefined ? ` (${resourceUsageLabel(used, max)})` : ""}
      </p>
      <p className="text-muted-foreground">
        Upgrade to {pro.name} to create up to {pro.limits.maxResources} resources, or delete a
        resource you no longer need. The limit counts all your workspaces together.
      </p>
      <div>
        <Button asChild className="h-10 sm:h-8">
          <Link href="/dashboard/billing">See Pro</Link>
        </Button>
      </div>
    </div>
  );
}
