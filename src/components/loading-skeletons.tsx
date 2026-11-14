import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading placeholders. Each one tells screen readers that content is loading.

function LoadingStatus({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </CardHeader>
      <CardContent className="grid gap-2">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-3 w-full" />
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <LoadingStatus>
      <div aria-hidden="true" className="grid gap-2 rounded-xl border border-border p-4">
        <Skeleton className="h-5 w-1/3" />
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </LoadingStatus>
  );
}

// A whole dashboard page while it loads: title, a row of cards, a table.
export function PageSkeleton() {
  return (
    <LoadingStatus>
      <div aria-hidden="true" className="grid gap-6">
        <div className="grid gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid gap-2 rounded-xl border border-border p-4">
          <Skeleton className="h-5 w-1/3" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </LoadingStatus>
  );
}
