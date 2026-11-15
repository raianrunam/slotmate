import { cn } from "@/lib/utils";

// A short message above or below a form: a problem (announced at once) or a
// success / information notice (announced politely).
export function FormMessage({
  tone,
  children,
  testId,
}: {
  tone: "error" | "success" | "info";
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-testid={testId}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "success" && "border-border bg-muted text-foreground",
        tone === "info" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}
