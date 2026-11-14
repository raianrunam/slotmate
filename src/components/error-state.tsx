import { TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Shown when something failed. Say what happened in plain words and offer a way
// forward (for example a "Try again" button passed as `action`).
// Never put technical details or secrets in `message`.
//
// `live` (default true) makes screen readers announce it immediately, which is
// right for a real failure. Pass `live={false}` when it is only a static sample.
// `headingLevel` keeps the page's heading order correct.
export function ErrorState({
  title = "Something went wrong",
  message = "We could not load this. Please try again.",
  action,
  live = true,
  headingLevel = 2,
  className,
}: {
  title?: string;
  message?: string;
  action?: React.ReactNode;
  live?: boolean;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      role={live ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlertIcon className="size-6" aria-hidden="true" />
      </span>
      <Heading className="font-heading text-base font-medium">{title}</Heading>
      {/* foreground/80 (not muted) keeps the text above 4.5:1 on the red tint. */}
      <p className="max-w-sm text-sm text-foreground/80">{message}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
