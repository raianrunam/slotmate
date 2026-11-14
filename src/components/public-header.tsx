import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

// A small header for pages that visitors see (booking and status pages).
// It has no owner links: visitors do not log in.
export function PublicHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Logo className="text-base" />
        <ThemeToggle />
      </div>
    </header>
  );
}
