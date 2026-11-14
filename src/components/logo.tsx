import Link from "next/link";
import { cn } from "@/lib/utils";

// The SlotMate mark: three stacked "slots" on a rounded accent square.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <rect x="7" y="9" width="18" height="4" rx="2" className="fill-primary-foreground" />
      <rect
        x="7"
        y="15"
        width="11"
        height="4"
        rx="2"
        className="fill-primary-foreground"
        fillOpacity="0.85"
      />
      <rect
        x="7"
        y="21"
        width="15"
        height="4"
        rx="2"
        className="fill-primary-foreground"
        fillOpacity="0.7"
      />
    </svg>
  );
}

// Mark + wordmark as a link to the home page.
export function Logo({
  href = "/",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-md text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label="SlotMate home"
    >
      <LogoMark />
      <span>SlotMate</span>
    </Link>
  );
}
