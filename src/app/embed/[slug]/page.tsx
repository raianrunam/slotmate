import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TableSkeleton } from "@/components/loading-skeletons";
import { LogoMark } from "@/components/logo";
import { EmbedTheme } from "@/features/embed/components/embed-theme";
import { embedColorVariables } from "@/features/embed/schema";
import { BookingFlow } from "@/features/public-booking/components/booking-flow";
import { getPublicWorkspace } from "@/features/public-booking/queries";
import { SLUG } from "@/features/public-booking/schema";
import { minutesLabel } from "@/features/resources/schema";
import { zoneLabel } from "@/lib/time/format";
import { addDaysToDate, MAX_DAYS_AHEAD, todayInZone } from "@/lib/time/slots";
import { cn } from "@/lib/utils";

// The widget (EMBED-01 to EMBED-07): the public booking flow with minimal chrome, shown
// inside another website's iframe. Same rules as /book/<slug>: only the fields a visitor may
// see (ISO-02), the same rate limit inside the booking action, an unknown or locked workspace
// shows the same "not found" page. The options come from the public-read module, which has
// already dropped the Pro-only values for an owner who is not Pro (EMBED-05).
async function Widget({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length < 3 || slug.length > 40) notFound();
  const workspace = await getPublicWorkspace(slug, { embed: true });
  if (!workspace || !workspace.embed) notFound();
  const { theme, layout, backgroundColor } = workspace.embed;

  const today = todayInZone(workspace.timeZone);
  const label = zoneLabel(workspace.timeZone);

  // backgroundColor is either null or an exact #rrggbb (validated when read). It becomes colour VARIABLES, so every
  // part of the form (cards, panels, borders, muted text) follows it and keeps a readable contrast.
  const style = backgroundColor ? (embedColorVariables(backgroundColor) as React.CSSProperties) : undefined;

  return (
    <div
      className={cn("rounded-lg p-4 text-sm", theme === "dark" ? "dark bg-background text-foreground" : "bg-background text-foreground")}
      style={style}
      data-testid="embed-root"
      data-theme={theme}
      data-layout={layout}
    >
      {/* A tiny static script, run while the page is parsed (before it is shown): the widget follows the OWNER's theme from the
          first paint, not the visitor's system setting. One of two fixed files, chosen from a validated value. */}
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- synchronous on purpose: it must run before the first paint */}
      <script src={theme === "dark" ? "/embed-theme-dark.js" : "/embed-theme-light.js"} />
      <EmbedTheme theme={theme} />
      <div className="grid gap-5">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">{workspace.name}</h1>
          {workspace.description ? <p className="mt-1 text-sm opacity-80 [overflow-wrap:anywhere]">{workspace.description}</p> : null}
          <p className="mt-1 text-xs opacity-80" data-testid="zone-note">
            Times are shown in {label}.
          </p>
        </div>

        {workspace.resources.length === 0 ? (
          <p className="rounded-lg border border-border p-3" data-testid="no-resources">
            Nothing can be booked here right now. Please check back later.
          </p>
        ) : !workspace.acceptingRequests ? (
          <p role="status" className="rounded-lg border border-border p-3" data-testid="not-accepting">
            This workspace is not accepting booking requests right now. Please try again later.
          </p>
        ) : (
          <BookingFlow
            embed={{ layout }}
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
      <p className="mt-5 flex items-center justify-center gap-2 text-xs opacity-70">
        <LogoMark className="size-4" />
        Powered by SlotMate
      </p>
    </div>
  );
}

// With Cache Components the data may only be read inside <Suspense> (same as /book/<slug>).
export default function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 p-2">
      <Suspense fallback={<TableSkeleton rows={2} />}>
        <Widget params={params} />
      </Suspense>
    </main>
  );
}
