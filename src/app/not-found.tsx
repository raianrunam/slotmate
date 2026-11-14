import type { Metadata } from "next";
import Link from "next/link";
import { FileQuestionIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Page not found" };

// Shown for every address that does not exist (HTTP 404).
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center"
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileQuestionIcon className="size-7" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-muted-foreground">Error 404</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">
          The page you are looking for does not exist, or the link is out of date.
        </p>
        <Button asChild className="mt-2 h-10">
          <Link href="/">Go to the home page</Link>
        </Button>
      </main>
      <SiteFooter />
    </>
  );
}
