import { formatClock, parseClock, type AvailabilityWindow } from "@/lib/time/slots";

// Input rules for the weekly opening hours (AVAIL-01, AVAIL-02, DB9). Pure and
// shared by the form and the Server Action. One window per weekday; weekdays are
// numbered like ISO: 1 = Monday ... 7 = Sunday. Times are in the workspace's zone.

export const WEEKDAYS = [
  { n: 1, name: "Monday" },
  { n: 2, name: "Tuesday" },
  { n: 3, name: "Wednesday" },
  { n: 4, name: "Thursday" },
  { n: 5, name: "Friday" },
  { n: 6, name: "Saturday" },
  { n: 7, name: "Sunday" },
] as const;

export const MESSAGES = {
  opensBad: "Enter the opening time as hours and minutes, for example 09:00 (00:00 to 23:59).",
  closesBad: "Enter the closing time as hours and minutes, for example 17:00. Use 24:00 for the end of the day.",
  order: "The closing time must be later than the opening time.",
  id: "That resource could not be found.",
} as const;

/**
 * Reads a time typed by a person (Phase 10 review finding 10): "09:30", "9:30",
 * "0930" and "930" all mean 09:30; "24:00" or "2400" is the end of the day. The
 * phone keyboard without a colon key can therefore be used. Anything else is NaN.
 * (parseClock itself stays strict: it reads times that come from the database.)
 */
export function parseTypedClock(value: string): number {
  const text = value.trim();
  const digits = /^(\d{1,2})(\d{2})$/.exec(text); // "930" or "0930"
  return parseClock(digits ? `${digits[1]}:${digits[2]}` : text);
}

/** The hint shown under the times and read by screen readers. */
export const TIME_HINT = "Use the 24-hour clock, for example 09:00 or 0900. Use 24:00 as the closing time for the end of the day.";

/** The form field names for one weekday. */
export const fieldNames = (n: number) => ({ open: `open-${n}`, opens: `opens-${n}`, closes: `closes-${n}` });

/** Every field name the form can send (the only ones the action reads). */
export const ALL_FIELD_NAMES: string[] = WEEKDAYS.flatMap(({ n }) => Object.values(fieldNames(n)));

export interface DayRow {
  weekday: number;
  opens_at: string; // "HH:MM"
  closes_at: string; // "HH:MM", or "24:00"
}

export type ParsedDays =
  | { ok: true; open: DayRow[]; closedDays: number[] }
  | { ok: false; errors: Record<string, string> };

/**
 * Reads the seven days from the form's fields. A closed day ignores its times.
 * Opening must be 00:00 to 23:59; closing 00:01 to 24:00 and later than opening.
 * Errors are keyed by the field name that has the problem (for example "closes-3").
 */
export function parseDays(fields: Record<string, string>): ParsedDays {
  const open: DayRow[] = [];
  const closedDays: number[] = [];
  const errors: Record<string, string> = {};

  for (const { n } of WEEKDAYS) {
    const names = fieldNames(n);
    if (fields[names.open] !== "on") {
      closedDays.push(n);
      continue;
    }
    const opens = parseTypedClock(fields[names.opens] ?? "");
    const closes = parseTypedClock(fields[names.closes] ?? "");
    let bad = false;
    if (Number.isNaN(opens) || opens >= 86400 || opens % 60 !== 0) {
      errors[names.opens] = MESSAGES.opensBad;
      bad = true;
    }
    if (Number.isNaN(closes) || closes % 60 !== 0) {
      errors[names.closes] = MESSAGES.closesBad;
      bad = true;
    }
    if (!bad && closes <= opens) {
      errors[names.closes] = MESSAGES.order;
      bad = true;
    }
    if (!bad) open.push({ weekday: n, opens_at: formatClock(opens), closes_at: formatClock(closes) });
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, open, closedDays };
}

/** Database rows to the windows the slot functions use. */
export function toWindows(rows: readonly { weekday: number; opens_at: string; closes_at: string }[]): AvailabilityWindow[] {
  return rows.map((r) => ({ weekday: r.weekday, opensAt: r.opens_at, closesAt: r.closes_at }));
}

/** "09:00:00" -> "09:00"; "24:00:00" -> "24:00". */
export function clockText(value: string): string {
  const seconds = parseClock(value);
  return Number.isNaN(seconds) ? value : formatClock(seconds);
}
