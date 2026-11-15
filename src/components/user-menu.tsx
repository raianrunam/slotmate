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
import { logOut } from "@/features/auth/actions";

// The account menu in the dashboard header: the owner's email (shown next to
// the button on wider screens and at the top of the menu), Billing and Log out.
// Log out is a POST form (a Server Action), never a link (CSRF).
export function UserMenu({ email }: { email: string }) {
  return (
    <div className="flex items-center gap-1">
      <span
        data-testid="owner-email"
        className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline"
        title={email}
      >
        {email}
      </span>
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
          <DropdownMenuLabel className="truncate font-normal" title={email}>
            {email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/billing">
              <CreditCardIcon aria-hidden="true" /> Billing
            </Link>
          </DropdownMenuItem>
          <form action={logOut}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full cursor-default">
                <LogOutIcon aria-hidden="true" /> Log out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
