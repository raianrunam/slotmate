"use client";

import { useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DashboardNav } from "@/components/dashboard-nav";
import { Logo } from "@/components/logo";
import { UpgradePrompt } from "@/components/upgrade-prompt";

// The dashboard menu on phones and tablets: a button in the header that opens
// the navigation in a side sheet (below 1024 px). The sheet closes when a link is chosen.
export function DashboardMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 lg:hidden"
          aria-label="Open menu"
        >
          <MenuIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>
      {/* showCloseButton={false}: the generated close button is only 28 px, so a
          larger one (40 px on phones) is added below. */}
      <SheetContent side="left" showCloseButton={false} className="w-72 gap-6 p-4">
        <SheetHeader className="flex-row items-center justify-between p-0">
          <SheetTitle className="sr-only">Main menu</SheetTitle>
          <SheetDescription className="sr-only">
            Choose a section of the dashboard.
          </SheetDescription>
          <Logo href="/dashboard" />
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="size-10" aria-label="Close menu">
              <XIcon aria-hidden="true" />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <DashboardNav onNavigate={() => setOpen(false)} />
        </div>
        <UpgradePrompt />
      </SheetContent>
    </Sheet>
  );
}
