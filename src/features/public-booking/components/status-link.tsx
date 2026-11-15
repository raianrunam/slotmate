"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown ONCE, right after a booking was sent (PUB-07, NOTIF-03): the private status
// link with a copy button and a "save this link" note. The link is built from the
// address the visitor is on, so it also works from a phone on the local network.
//
// "Once": the address carries "?submitted=1" only after a booking was sent. Right
// away this component takes it out of the address bar (replaceState), so a refresh
// or a later visit shows the plain status page without this panel. The link itself
// stays in the address bar, which is how it is kept.
export function StatusLink({ code }: { code: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Reading the browser's own address is only possible here, after the page loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLink(`${window.location.origin}/booking/${code}`);
    window.history.replaceState(window.history.state, "", `/booking/${code}`);
  }, [code]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // No clipboard permission: select the text so it can be copied by hand.
      const field = document.getElementById("status-link-field") as HTMLInputElement | null;
      field?.select();
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4" data-testid="status-link-panel">
      <h2 className="font-heading text-base font-medium">Save this link</h2>
      <p className="text-sm text-muted-foreground">
        This private link is the only way to come back to your request and see whether it was approved. We do not send
        emails, so please save it now. Anyone who has the link can see this status.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="status-link-field"
          readOnly
          aria-label="Your private status link"
          value={link ?? `/booking/${code}`}
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 font-mono text-base md:text-sm"
        />
        <Button type="button" variant="outline" className="h-11" onClick={copy} disabled={!link}>
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {copied ? "Link copied" : ""}
      </p>
    </div>
  );
}
