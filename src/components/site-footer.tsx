import Link from "next/link";
import { Logo } from "@/components/logo";

// The footer of the public marketing pages. The credit line is intentional.
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="grid gap-2">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            Booking and resource management for small teams.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link
            href="/login"
            className="inline-block rounded-sm py-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-block rounded-sm py-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign up
          </Link>
          <Link
            href="/#pricing"
            className="inline-block rounded-sm py-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Pricing
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-4 text-sm text-muted-foreground sm:px-6">
          © 2026 SlotMate · by{" "}
          <a
            href="https://github.com/raianrunam"
            className="rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            rel="noopener noreferrer"
          >
            raianrunam
          </a>
        </p>
      </div>
    </footer>
  );
}
