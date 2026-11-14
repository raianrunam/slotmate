import { CheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatPrice, limitLines, type PlanDefinition } from "@/lib/plans";

// One plan (Free or Pro) with its exact limits from src/lib/plans.ts.
export function PlanCard({
  plan,
  highlighted = false,
  action,
  badge,
}: {
  plan: PlanDefinition;
  highlighted?: boolean;
  /** The call-to-action button or link shown at the bottom. */
  action?: React.ReactNode;
  /** A small label next to the name, for example "Your plan" or "Most popular". */
  badge?: string;
}) {
  const headingId = `plan-${plan.id}-name`;

  return (
    <Card
      role="group"
      aria-labelledby={headingId}
      className={cn("h-full flex-col", highlighted && "border-primary ring-1 ring-primary")}
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <h3 id={headingId} className="font-heading text-lg font-semibold">
            {plan.name}
          </h3>
          {badge ? <Badge>{badge}</Badge> : null}
        </div>
        <p className="flex items-baseline gap-1">
          <span className="text-4xl font-semibold tracking-tight">{formatPrice(plan)}</span>
          <span className="text-sm text-muted-foreground">per month</span>
        </p>
        <CardDescription>{plan.tagline}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div>
          <p className="mb-2 text-sm font-medium">Limits</p>
          <ul className="grid gap-2 text-sm">
            {limitLines(plan.limits).map((line) => (
              <li key={line} className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Features</p>
          <ul className="grid gap-2 text-sm">
            {plan.features.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      {/* mt-auto pushes the button to the bottom so the two cards' buttons line up. */}
      {action ? <CardFooter className="mt-auto">{action}</CardFooter> : null}
    </Card>
  );
}
