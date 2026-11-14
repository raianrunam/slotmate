import type { Metadata } from "next";
import Link from "next/link";
import { ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { PublicHeader } from "@/components/public-header";
import { StatusBadge } from "@/components/status-badge";

// The private status page of one booking request (A8). The secret code is the
// last part of the address. This shell deliberately does NOT read or show it,
// and tells search engines not to list the page and browsers not to pass its
// address on to other websites (ARCHITECTURE.md section 6.2).
export const metadata: Metadata = {
  title: "Booking status",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const DETAILS = [
  ["Resource", "Meeting room"],
  ["Date", "Tuesday (sample)"],
  ["Time", "10:00 to 11:00 (London time)"],
  ["Name", "Sample visitor"],
] as const;

export default function BookingStatusPage() {
  return (
    <>
      <PublicHeader />
      <main id="main-content" className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:py-12">
        <div className="grid gap-6">
          <PlaceholderNotice phase="Phase 11">
            The details below are sample text. The real page shows only the resource, the time, your name and the status.
          </PlaceholderNotice>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="font-heading text-xl font-semibold">Your booking request</h1>
                <StatusBadge status="pending" />
              </div>
              <CardDescription className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Waiting for the owner to approve or reject it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
                {DETAILS.map(([term, value]) => (
                  <div key={term} className="grid grid-cols-subgrid sm:col-span-2">
                    <dt className="text-muted-foreground">{term}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
            <CardFooter className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                Save this page&apos;s address. It is the only way to come back to your booking, and anyone who has it can see this status.
              </p>
              <Button asChild variant="outline" className="h-10 w-full sm:w-fit">
                <Link href="/">About SlotMate</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </main>
    </>
  );
}
