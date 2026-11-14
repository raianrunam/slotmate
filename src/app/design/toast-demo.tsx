"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Buttons that show the three toast styles (sonner). Used only on /design.
export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="h-10 sm:h-8" onClick={() => toast.success("Saved. This is a sample toast.")}>
        Success toast
      </Button>
      <Button variant="outline" className="h-10 sm:h-8" onClick={() => toast.error("Could not save. This is a sample toast.")}>
        Error toast
      </Button>
      <Button variant="outline" className="h-10 sm:h-8" onClick={() => toast("Heads up. This is a sample toast.")}>
        Neutral toast
      </Button>
    </div>
  );
}
