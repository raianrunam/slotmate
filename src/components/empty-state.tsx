import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Shown instead of a list when there is nothing to list yet.
// Say what is missing and what to do about it.
// `headingLevel` keeps the page's heading order correct: use 2 when the state
// sits directly under the page title, 3 or 4 when it sits deeper.
export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  headingLevel = 2,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <Heading className="font-heading text-base font-medium">{title}</Heading>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
