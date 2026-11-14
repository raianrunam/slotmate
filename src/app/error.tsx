"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/error-state";

// The root error boundary: shown when a page fails while rendering.
// Error boundaries must be Client Components. `retry` (stable since Next.js
// 16.3) re-fetches and re-renders the failed part of the page.
export default function RootError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    // Phase 17 may send this to an error-reporting service.
    // Never show technical details to the visitor.
    console.error(error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16"
    >
      <ErrorState
        title="Something went wrong"
        message="An unexpected error happened. You can try again, and if it keeps happening please come back later."
        action={
          <Button onClick={() => retry()} className="h-10">
            Try again
          </Button>
        }
      />
    </main>
  );
}
