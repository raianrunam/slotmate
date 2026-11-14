import { InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Marks a screen (or a part of one) as a design shell with sample text only.
// Every Phase 6 page shows one, so nobody mistakes a shell for a working feature.
export function PlaceholderNotice({
  phase,
  children,
  className,
}: {
  /** The phase that will build the real feature, for example "Phase 8". */
  phase: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm",
        className,
      )}
    >
      <InfoIcon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <p>
        <strong className="font-medium">Placeholder.</strong>{" "}
        {children ??
          "This screen is a design shell with sample text only. No data is read or saved."}{" "}
        <span className="text-muted-foreground">The real version is built in {phase}.</span>
      </p>
    </div>
  );
}
