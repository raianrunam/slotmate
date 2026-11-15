import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-skeletons";
import { PublicHeader } from "@/components/public-header";
import { BookingFlow } from "@/features/public-booking/components/booking-flow";
import { getPublicWorkspace } from "@/features/public-booking/queries";
import { SLUG } from "@/features/public-booking/schema";
import { minutesLabel } from "@/features/resources/schema";
import { zoneLabel } from "@/lib/time/format";
import { addDaysToDate, MAX_DAYS_AHEAD, todayInZone } from "@/lib/time/slots";

export const metadata: Metadata = { title: "Book a time" };

// The public booking page of one workspace (PUB-01 to PUB-06). Built on the server
// from the admin connection, with only the fields a visitor may see (ISO-02).
// An unknown or locked workspace (BILL-09) shows the "not found" page. (With Cache
// Components the response has already started when this runs, so the HTTP status stays
// 200; the page says "not found" and tells search engines not to list it.)
//
// The route parameter is a Promise in this Next.js version, and with Cache Components
// the data may only be read inside <Suspense>.
async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length < 3 || slug.length > 40) notFound();
  const workspace = await getPublicWorkspace(slug);
  if (!workspace) notFound();

  const today = todayInZone(workspace.timeZone);
  const label = zoneLabel(workspace.timeZone);

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{workspace.name}</h1>
        {workspace.description ? <p className="mt-2 max-w-prose text-muted-foreground [overflow-wrap:anywhere]">{workspace.description}</p> : null}
        {/* WORK-04: the page names the time zone every time is shown in. */}
        <p className="mt-2 text-sm text-muted-foreground" data-testid="zone-note">
          Times are shown in {label}.
        </p>
      </div>

      {workspace.resources.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-muted-foreground" data-testid="no-resources">
          Nothing can be booked here right now. Please check back later.
        </p>
      ) : !workspace.acceptingRequests ? (
        <p role="status" className="rounded-lg border border-border p-4" data-testid="not-accepting">
          This workspace is not accepting booking requests right now. Please try again later.
        </p>
      ) : (
        <BookingFlow
          resources={workspace.resources.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            imageUrl: r.imageUrl,
            capacity: r.capacity,
            slotMinutes: r.slotMinutes,
            facts: `${minutesLabel(r.slotMinutes)} per booking · up to ${r.capacity} ${r.capacity === 1 ? "person" : "people"}`,
          }))}
          zoneLabel={label}
          minDate={today}
          maxDate={addDaysToDate(today, MAX_DAYS_AHEAD)}
        />
      )}
    </div>
  );
}

export default function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <>
      <PublicHeader />
      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Suspense fallback={<PageSkeleton />}>
          <BookingPage params={params} />
        </Suspense>
      </main>
    </>
  );
}
