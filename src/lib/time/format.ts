// Words for times and zones on the public pages (WORK-04, ARCHITECTURE 5.3).
// Every time is shown in the WORKSPACE's zone, and the zone is always named.
// Pure: no secrets, no database, safe on both sides.

/** "London time (Europe/London)", "New York time (America/New_York)"; "UTC" for UTC. */
export function zoneLabel(timeZone: string): string {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return "UTC";
  const city = (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ");
  return `${city} time (${timeZone})`;
}

/** "Tuesday 17 November" (or with the year) for a calendar date such as 2026-11-17 (already the workspace's date). */
export function dateLabel(date: string, withYear = false): string {
  // Built from parts so the wording is the same on every server and browser (ICU puts a comma in some forms).
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatToParts(
    new Date(`${date}T00:00:00Z`),
  );
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const text = `${get("weekday")} ${get("day")} ${get("month")}`;
  return withYear ? `${text} ${get("year")}` : text;
}

/** The clock time of an exact moment in a zone, "10:00" (24-hour). */
export function clockIn(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(instant));
}

/** The calendar date of an exact moment in a zone, "2026-11-17". */
export function dateIn(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
