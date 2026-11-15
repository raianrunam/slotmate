import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ownerNeedsSelection } from "@/features/billing/queries";

// Shown on every dashboard page while the owner is over the Free limits and has not yet
// chosen what stays active (A18). Until they choose, everything is locked. Never decides for them.
export async function DowngradeBanner() {
  if (!(await ownerNeedsSelection())) return null;
  return (
    <div
      role="alert"
      data-testid="downgrade-banner"
      className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex gap-2">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Your Pro plan has ended and you have more than the Free plan allows. Your workspaces and resources are
          locked until you choose which ones stay active.
        </span>
      </p>
      <Button asChild className="h-10 sm:h-8">
        <Link href="/dashboard/billing/downgrade">Choose what to keep</Link>
      </Button>
    </div>
  );
}
