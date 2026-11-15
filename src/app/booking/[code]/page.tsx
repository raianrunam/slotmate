import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/loading-skeletons";
import { PublicHeader } from "@/components/public-header";
import { StatusBadge, type BookingStatus } from "@/components/status-badge";
import { StatusLink } from "@/features/public-booking/components/status-link";
import { getBookingStatus } from "@/features/public-booking/queries";
import { STATUS_CODE } from "@/features/public-booking/schema";
import { clockIn, dateIn, dateLabel, zoneLabel } from "@/lib/time/format";

// The private status page of one booking request (A8, NOTIF-03). The secret code
// is the last part of the address; only its SHA-256 hash is looked up. The page
// tells search engines not to list it and browsers not to pass its address on to
// other websites; next.config.ts also sends "Cache-Control: no-store" and
// "Referrer-Policy: no-referrer" for /booking/* (ARCHITECTURE 6.2).
export const metadata: Metadata = {
  title: "Booking status",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// What each status means, in plain words (PUB-07, NOTIF-03).
const MEANING: Record<BookingStatus, string> = {
  pending: "Waiting for the owner to approve or reject your request. The time is held for you meanwhile.",
  approved: "Approved. The owner has confirmed this booking.",
  rejected: "Rejected. The owner could not accept this request. You can book another time.",
  cancelled: "Cancelled. This booking will not take place. You can book another time.",
};

async function StatusContent({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { code } = await params;
  if (!STATUS_CODE.test(code)) notFound();
  const booking = await getBookingStatus(code);
  if (!booking) notFound();
  const justSent = (await searchParams).submitted === "1";

  const day = dateIn(booking.startsAt, booking.timeZone);
  const details: [string, string][] = [
    ["Resource", booking.resourceName],
    ["Workspace", booking.workspaceName],
    ["Date", dateLabel(day, true)],
    ["Time", `${clockIn(booking.startsAt, booking.timeZone)} to ${clockIn(booking.endsAt, booking.timeZone)} (${zoneLabel(booking.timeZone)})`],
    ["Name", booking.visitorName],
  ];

  return (
    <div className="grid gap-6">
      {justSent ? (
        // NOTIF-01: the success message, shown once.
        <div role="status" className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4" data-testid="success-message">
          <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">Your request was sent.</p>
            <p className="text-sm text-muted-foreground">The owner will approve or reject it. Come back to this page to see the answer.</p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-heading text-xl font-semibold">Your booking request</h1>
            <StatusBadge status={booking.status} />
          </div>
          <CardDescription data-testid="status-meaning">{MEANING[booking.status]}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
            {details.map(([term, value]) => (
              <div key={term} className="grid grid-cols-subgrid sm:col-span-2">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="font-medium [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
        <CardFooter className="grid gap-3">
          {justSent ? (
            <StatusLink code={code} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Keep this page&apos;s address. It is the only way to come back to your booking, and anyone who has it can see this status.
            </p>
          )}
          <Button asChild variant="outline" className="h-11 w-full sm:w-fit">
            <Link href={`/book/${booking.workspaceSlug}`}>Book another time</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function BookingStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <>
      <PublicHeader />
      <main id="main-content" className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:py-12">
        <Suspense fallback={<PageSkeleton />}>
          <StatusContent params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
