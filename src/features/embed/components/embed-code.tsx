"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildEmbedCode } from "@/features/embed/schema";

// The snippet to paste into another website, with a copy button (EMBED-01, EMBED-07). It holds only the
// public address of the widget and its size. The address starts with SlotMate's own configured address
// (NEXT_PUBLIC_APP_URL, ARCHITECTURE 7), not with whatever address the owner happens to be on (a preview
// deployment or localhost would give a code that points at the wrong site: Phase 14 review).
export function EmbedCode({ slug, appUrl }: { slug: string; appUrl: string }) {
  const code = buildEmbedCode(appUrl, slug);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false); // no clipboard permission: the code can still be selected and copied by hand
    }
  }

  return (
    <div className="grid gap-3">
      <pre
        tabIndex={0}
        role="region"
        aria-label="Embed code"
        data-testid="embed-code"
        className="overflow-x-auto rounded-lg border border-border bg-muted p-4 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <code>{code}</code>
      </pre>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" className="h-10 sm:h-8" onClick={copy}>
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          {copied ? "Copied" : "Copy code"}
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {copied ? "Code copied" : ""}
        </p>
      </div>
    </div>
  );
}
