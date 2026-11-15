import { slotsForRange, todayInZone, type AvailabilityWindow } from "@/lib/time/slots";

const DAYS_SHOWN = 7;

// "Mon 16 Nov" for a calendar date such as 2026-11-16 (no time zone involved: it
// is already the date in the workspace's zone).
function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// Preview of the next 7 days of slots, made with the SAME functions the public
// page will use (src/lib/time), in the workspace's time zone. It shows the SAVED
// hours. A server component: it reads no data itself.
export function SlotPreview({
  slotMinutes,
  windows,
  timeZone,
  now = new Date(),
}: {
  slotMinutes: number;
  windows: AvailabilityWindow[];
  timeZone: string;
  now?: Date;
}) {
  const today = todayInZone(timeZone, now);
  const days = slotsForRange({ slotMinutes, windows, timeZone, now, fromDate: today, days: DAYS_SHOWN });

  return (
    <section aria-labelledby="preview-heading" className="grid max-w-2xl gap-3 border-t border-border pt-5">
      <h2 id="preview-heading" className="font-heading text-base font-medium">
        Preview: the next 7 days
      </h2>
      <p className="text-sm text-muted-foreground" data-testid="preview-zone">
        These are the start times visitors will be offered, in the workspace&apos;s time zone,{" "}
        <strong className="font-medium text-foreground">{timeZone}</strong> (today there is{" "}
        {dayLabel(today)}). Slots are {slotMinutes} {slotMinutes === 1 ? "minute" : "minutes"} long. Times that
        have already started are not shown. This shows the hours you last saved.
      </p>
      <ul className="grid gap-2" data-testid="slot-preview">
        {days.map((day) => {
          const window = windows.find((w) => w.weekday === day.weekday);
          return (
            <li key={day.date} className="rounded-lg border border-border p-3 text-sm" data-testid={`preview-${day.date}`}>
              <span className="font-medium">{dayLabel(day.date)}</span>
              {": "}
              {day.slots.length > 0 ? (
                <span>{day.slots.map((s) => s.start).join(", ")}</span>
              ) : !window ? (
                <span className="text-muted-foreground">Closed</span>
              ) : (
                <span className="text-muted-foreground">No bookable slots (none left today, or the opening hours are shorter than one slot)</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
