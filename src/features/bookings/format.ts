import { clockIn, dateIn, dateLabel, zoneLabel } from "@/lib/time/format";

// Words for a booking's time, always in the WORKSPACE's time zone with the zone named (WORK-04, A10).
// Pure: no server imports.

export interface WhenLabel {
  /** "Tuesday 17 November 2026" */
  date: string;
  /** "10:00 to 11:00" */
  range: string;
  /** "London time (Europe/London)" or "UTC" */
  zone: string;
}

export function whenLabel(startsAt: string, endsAt: string, timeZone: string): WhenLabel {
  return {
    date: dateLabel(dateIn(startsAt, timeZone), true),
    range: `${clockIn(startsAt, timeZone)} to ${clockIn(endsAt, timeZone)}`,
    zone: zoneLabel(timeZone),
  };
}

/** "17 Nov 2026, 14:05 UTC": when something was submitted or changed (an exact moment, in UTC, named). */
export function momentLabel(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).formatToParts(
    new Date(instant),
  );
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} UTC`;
}

/** The plain-words status history shown on the details page. */
export function historyText(status: string, createdAt: string, updatedAt: string): string[] {
  const lines = [`Request received on ${momentLabel(createdAt)}.`];
  const changed = new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 1000;
  if (status === "pending") lines.push("Waiting for your decision.");
  else if (status === "approved") lines.push(`Approved${changed ? ` on ${momentLabel(updatedAt)}` : ""}.`);
  else if (status === "rejected") lines.push(`Rejected${changed ? ` on ${momentLabel(updatedAt)}` : ""}. The time is free again.`);
  else if (status === "cancelled") lines.push(`Cancelled${changed ? ` on ${momentLabel(updatedAt)}` : ""} (it had been approved). The time is free again.`);
  return lines;
}
