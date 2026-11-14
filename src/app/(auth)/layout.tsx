import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

// Shared frame for the four auth screens: a small header and a centered card.
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <ThemeToggle />
        </div>
      </header>
      <main
        id="main-content"
        className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 sm:py-16"
      >
        {children}
      </main>
    </>
  );
}
