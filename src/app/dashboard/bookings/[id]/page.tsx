import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { FormMessage } from "@/components/form-message";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { BookingActions } from "@/features/bookings/components/booking-actions";
import { historyText, momentLabel, whenLabel } from "@/features/bookings/format";
import { getBooking } from "@/features/bookings/queries";
import { bookingIdSchema } from "@/features/bookings/schema";

export const metadata: Metadata = { title: "Booking" };

const NOTICES: Record<string, string> = {
  approved: "Booking approved.",
  rejected: "Booking rejected. The time is free again.",
  cancelled: "Booking cancelled. The time is free again.",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ notice?: string | string[] }>;

async function BookingContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  if (!bookingIdSchema.safeParse(id).success) notFound();
  // RLS: another owner's booking is simply not found (BOOK-02).
  const booking = await getBooking(id);
  if (!booking) notFound();
  const raw = (await searchParams).notice;
  const noticeKey = Array.isArray(raw) ? raw[0] : raw;
  const notice = noticeKey && Object.hasOwn(NOTICES, noticeKey) ? NOTICES[noticeKey] : undefined;
  const when = whenLabel(booking.starts_at, booking.ends_at, booking.timeZone);

  return (
    <>
      <PageHeader
        title={booking.visitor_name}
        description="Booking request"
        actions={
          <Button asChild variant="outline" className="h-10 sm:h-8">
            <Link href="/dashboard/bookings">
              <ArrowLeftIcon aria-hidden="true" /> Bookings
            </Link>
          </Button>
        }
      />
      {notice ? (
        <FormMessage tone="success" testId="booking-notice">
          {notice}
        </FormMessage>
      ) : null}
      <section aria-labelledby="details-heading" className="grid max-w-2xl gap-4">
        <h2 id="details-heading" className="sr-only">
          Details
        </h2>
        <div className="flex items-center gap-2">
          <StatusBadge status={booking.status} />
          {booking.locked ? (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <LockIcon className="size-4" aria-hidden="true" /> Locked (plan limit)
            </span>
          ) : null}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]" data-testid="booking-details">
          <dt className="text-muted-foreground">Visitor</dt>
          <dd>{booking.visitor_name}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="break-all">{booking.visitor_email}</dd>
          <dt className="text-muted-foreground">Phone</dt>
          <dd>{booking.visitor_phone ?? "Not given"}</dd>
          <dt className="text-muted-foreground">Attendees</dt>
          <dd>{booking.attendees}</dd>
          <dt className="text-muted-foreground">Note</dt>
          <dd className="break-words whitespace-pre-wrap">{booking.note ?? "No note"}</dd>
          <dt className="text-muted-foreground">Resource</dt>
          <dd>{booking.resourceName}</dd>
          <dt className="text-muted-foreground">Workspace</dt>
          <dd>{booking.workspaceName}</dd>
          <dt className="text-muted-foreground">Date and time</dt>
          <dd>
            {when.date}, {when.range}
            <span className="block text-muted-foreground">{when.zone}</span>
          </dd>
          <dt className="text-muted-foreground">Submitted</dt>
          <dd>{momentLabel(booking.created_at)}</dd>
        </dl>
        <div>
          <h3 className="mb-1 text-sm font-medium">Status history</h3>
          <ul className="grid gap-1 text-sm text-muted-foreground" data-testid="booking-history">
            {historyText(booking.status, booking.created_at, booking.updated_at).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        {booking.locked ? (
          <FormMessage tone="info" testId="booking-locked-notice">
            This booking is read-only. Its resource or workspace is locked because your plan&apos;s limits were exceeded after a downgrade, and a booking inside a
            locked item cannot be changed or deleted on its own. Deleting the locked resource or workspace removes it.
          </FormMessage>
        ) : (
          <BookingActions id={booking.id} status={booking.status} visitorName={booking.visitor_name} />
        )}
      </section>
    </>
  );
}

// Every dashboard page checks the owner first (A3 layer 2). A unit test enforces this.
export default function BookingPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <OwnerGate>
      <BookingContent params={params} searchParams={searchParams} />
    </OwnerGate>
  );
}
