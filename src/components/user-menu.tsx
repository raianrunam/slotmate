"use client";

import Link from "next/link";
import { CreditCardIcon, LogOutIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The account menu in the dashboard header. Placeholder: no real account yet,
// and "Log out" does nothing until authentication is built (Phase 7).
export function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-full md:size-8"
          aria-label="Account menu"
        >
          <UserIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Owner (placeholder)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/billing">
            <CreditCardIcon aria-hidden="true" /> Billing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <LogOutIcon aria-hidden="true" /> Log out (Phase 7)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
