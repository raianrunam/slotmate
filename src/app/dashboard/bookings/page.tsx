import type { Metadata } from "next";
import { CalendarCheckIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FormMessage } from "@/components/form-message";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { BookingFilters } from "@/features/bookings/components/booking-filters";
import { BookingTable } from "@/features/bookings/components/booking-table";
import { listBookings } from "@/features/bookings/queries";
import { listHref, parseListParams, type SearchParamValue } from "@/features/bookings/schema";

export const metadata: Metadata = { title: "Bookings" };

const NOTICES: Record<string, string> = { deleted: "Booking deleted." };

type SearchParams = Promise<{ status?: SearchParamValue; q?: SearchParamValue; page?: SearchParamValue; notice?: SearchParamValue }>;

async function BookingsContent({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const params = parseListParams(raw);
  const list = await listBookings(params);
  const noticeKey = Array.isArray(raw.notice) ? raw.notice[0] : raw.notice;
  const notice = noticeKey && Object.hasOwn(NOTICES, noticeKey) ? NOTICES[noticeKey] : undefined;
  const filtered = params.status !== "all" || params.q !== "";

  return (
    <>
      <PageHeader title="Bookings" description="Every booking request, newest first. Open one to approve, reject, cancel or delete it." />
      {notice ? (
        <FormMessage tone="success" testId="booking-notice">
          {notice}
        </FormMessage>
      ) : null}
      <BookingFilters status={params.status} q={params.q} />
      {list.total === 0 ? (
        filtered ? (
          <EmptyState icon={CalendarCheckIcon} title="No bookings match" description="No booking request matches this filter or search. Clear the search or choose All." />
        ) : (
          <EmptyState icon={CalendarCheckIcon} title="No booking requests yet" description="When a visitor books through your public page, the request appears here." />
        )
      ) : (
        <section aria-label="Booking requests" className="grid gap-4">
          <BookingTable rows={list.rows} />
          <Pagination page={list.page} totalItems={list.total} buildHref={(p) => listHref({ status: params.status, q: params.q, page: p })} />
        </section>
      )}
    </>
  );
}

// Every dashboard page checks the owner first (A3 layer 2). A unit test enforces this.
export default function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerGate>
      <BookingsContent searchParams={searchParams} />
    </OwnerGate>
  );
}
