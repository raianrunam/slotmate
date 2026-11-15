"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// PUB-01: the owner can copy the full public address of a workspace. The address is built from the
// address the owner is on (so it is right on every host); only the public path is passed in.
export function CopyAddress({ path, name }: { path: string; name: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={`Copy the public address of ${name}`}>
        {state === "copied" ? <CheckIcon aria-hidden="true" data-icon="inline-start" /> : <CopyIcon aria-hidden="true" data-icon="inline-start" />}
        {state === "copied" ? "Copied" : "Copy link"}
      </Button>
      <span role="status" className="text-sm text-muted-foreground">
        {state === "failed" ? "Could not copy. Select the address and copy it by hand." : ""}
      </span>
    </span>
  );
}
