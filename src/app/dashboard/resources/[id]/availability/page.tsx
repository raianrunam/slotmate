import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { FormMessage } from "@/components/form-message";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvailabilityEditor, type DayValues } from "@/features/availability/components/availability-editor";
import { SlotPreview } from "@/features/availability/components/slot-preview";
import { getAvailability } from "@/features/availability/queries";
import { clockText, toWindows, WEEKDAYS } from "@/features/availability/schema";
import { getResource } from "@/features/resources/queries";
import { resourceIdSchema } from "@/features/resources/schema";

export const metadata: Metadata = { title: "Opening hours" };

type Props = { params: Promise<{ id: string }> };

async function AvailabilityContent({ params }: Props) {
  const { id } = await params;
  if (!resourceIdSchema.safeParse(id).success) notFound();
  // RLS: another owner's resource is simply not found.
  const resource = await getResource(id);
  if (!resource || !resource.workspaces) notFound();

  const rows = await getAvailability(resource.id);
  const locked = resource.is_locked || resource.workspaces.is_locked;
  const timeZone = resource.workspaces.time_zone;

  // Defaults for a day with no row: closed, with a sensible 09:00-17:00 to start from.
  const initial: Record<number, DayValues> = {};
  for (const { n } of WEEKDAYS) {
    const row = rows.find((r) => r.weekday === n);
    initial[n] = row
      ? { open: true, opens: clockText(row.opens_at), closes: clockText(row.closes_at) }
      : { open: false, opens: "09:00", closes: "17:00" };
  }

  return (
    <>
      <PageHeader
        title={`Opening hours: ${resource.name}`}
        description="Choose the days this resource can be booked and its opening hours."
        actions={
          <Button asChild variant="outline" className="h-10 sm:h-8">
            <Link href={`/dashboard/resources/${resource.id}`}>
              <ArrowLeftIcon aria-hidden="true" /> {resource.name}
            </Link>
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        In workspace{" "}
        <Link href={`/dashboard/workspaces/${resource.workspaces.id}`} className="font-medium text-foreground underline underline-offset-4">
          {resource.workspaces.name}
        </Link>
        .
      </p>
      {locked ? (
        <div className="grid max-w-2xl gap-3">
          <div>
            <Badge variant="secondary">
              <LockIcon aria-hidden="true" data-icon="inline-start" /> Locked (plan limit)
            </Badge>
          </div>
          <FormMessage tone="info">
            Your plan&apos;s limits were exceeded after a downgrade, so this resource is read-only and
            its opening hours cannot be changed.
          </FormMessage>
        </div>
      ) : rows.length === 0 ? (
        <FormMessage tone="info">
          No days are open yet, so visitors cannot book this resource. Switch on the days it is open
          and save.
        </FormMessage>
      ) : null}
      <AvailabilityEditor resourceId={resource.id} initial={initial} timeZone={timeZone} readOnly={locked} />
      <SlotPreview slotMinutes={resource.slot_minutes} windows={toWindows(rows)} timeZone={timeZone} />
    </>
  );
}

export default function AvailabilityPage(props: Props) {
  return (
    <OwnerGate>
      <AvailabilityContent {...props} />
    </OwnerGate>
  );
}
