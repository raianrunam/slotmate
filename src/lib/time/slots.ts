import { tzOffset } from "@date-fns/tz";

// Slot rules (AVAIL-01 to AVAIL-05, D5 to D8, ARCHITECTURE 5.2 and 5.4).
//
// These pure functions must follow EXACTLY the same rules as the database
// function submit_booking (docs/DATABASE.md 7.2 and 7.2.1), so the dashboard
// preview and (Phase 11) the public page never offer a time the database would
// refuse, and never hide one it would accept. Test T10 compares them with the
// live database.
//
// No secrets, no database, no browser or server specific code: safe everywhere.
//
// Words used below:
//  * "wall time" = the clock on the wall in the workspace's time zone. It is
//    stored as a number of milliseconds as if it were UTC ("wall ms").
//  * "instant" = an exact moment (milliseconds since 1970, UTC).
//  * On the day clocks go BACK an hour repeats: that wall time belongs to two
//    instants. Only the FIRST copy is bookable (owner decision Q7).
//  * On the day clocks go FORWARD an hour is skipped: a wall time inside it
//    belongs to no instant, so no slot can start there.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** D8: slots more than this many days ahead (in the workspace's zone) are not offered. */
export const MAX_DAYS_AHEAD = 90;

/** One open weekday of a resource: a row of resource_availability. Weekday 1 = Monday ... 7 = Sunday (DB9). */
export interface AvailabilityWindow {
  weekday: number;
  /** "HH:MM" or "HH:MM:SS". */
  opensAt: string;
  /** "HH:MM" or "HH:MM:SS"; "24:00" means the end of the day. */
  closesAt: string;
}

export interface Slot {
  /** The exact start moment. */
  startsAt: Date;
  /** The exact end moment, computed like the database (first copy of a repeated hour). */
  endsAt: Date;
  /** The local calendar date, "YYYY-MM-DD", in the workspace's zone. */
  date: string;
  /** The local start time, "HH:MM". */
  start: string;
  /** The local end time, "HH:MM" (wall clock, may be "24:00"). */
  end: string;
}

// ---------------------------------------------------------------------------
// Clock text
// ---------------------------------------------------------------------------

/** "09:30" -> 34200, "24:00" -> 86400, "09:30:15" -> 34215 (seconds since midnight). NaN if not a time. */
export function parseClock(value: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return Number.NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3] ?? 0);
  if (min > 59 || s > 59) return Number.NaN;
  if (h > 24 || (h === 24 && (min !== 0 || s !== 0))) return Number.NaN;
  return h * 3600 + min * 60 + s;
}

/** 34200 -> "09:30", 86400 -> "24:00". */
export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Zones: instants <-> wall time
// ---------------------------------------------------------------------------

function offsetMs(timeZone: string, instant: number): number {
  return tzOffset(timeZone, new Date(instant)) * MINUTE;
}

/** The wall time (as "wall ms") of an instant in a zone. */
export function wallMsOf(instant: number, timeZone: string): number {
  return instant + offsetMs(timeZone, instant);
}

/**
 * Every instant that shows this wall time in this zone, earliest first:
 * none (a skipped hour), one (normal), or two (a repeated hour).
 */
export function instantsForWall(wall: number, timeZone: string): number[] {
  // Offsets a day and a half before and after are certainly on either side of any
  // clock change near this wall time (changes are months apart).
  const candidates = new Set([offsetMs(timeZone, wall - 36 * HOUR), offsetMs(timeZone, wall + 36 * HOUR)]);
  const found: number[] = [];
  for (const offset of candidates) {
    const instant = wall - offset;
    if (offsetMs(timeZone, instant) === offset) found.push(instant);
  }
  return found.sort((a, b) => a - b);
}

/** The first instant that shows this wall time, or null when the wall time is skipped. */
export function firstInstantForWall(wall: number, timeZone: string): number | null {
  const all = instantsForWall(wall, timeZone);
  return all.length > 0 ? all[0] : null;
}

/**
 * The END of a slot, as the database computes it (submit_booking step 5):
 * the wall end converted to an instant; a repeated hour uses the FIRST copy; a
 * skipped hour is resolved like PostgreSQL does (the offset from before the change).
 */
export function endInstantForWall(wall: number, timeZone: string): number {
  const all = instantsForWall(wall, timeZone);
  if (all.length > 0) return all[0];
  return wall - offsetMs(timeZone, wall - 36 * HOUR);
}

// ---------------------------------------------------------------------------
// Dates ("YYYY-MM-DD" strings in the workspace's zone)
// ---------------------------------------------------------------------------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight of a calendar date as wall ms. NaN if the text is not a real date. */
function dateToWall(date: string): number {
  const m = DATE.exec(date);
  if (!m) return Number.NaN;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const back = new Date(ms).toISOString().slice(0, 10);
  return back === date ? ms : Number.NaN;
}

function wallToDate(wall: number): string {
  return new Date(wall).toISOString().slice(0, 10);
}

/** ISO weekday of a calendar date: 1 = Monday ... 7 = Sunday (DB9). */
export function isoWeekday(date: string): number {
  const day = new Date(dateToWall(date)).getUTCDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

/** Today's calendar date in the zone. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return wallToDate(wallMsOf(now.getTime(), timeZone));
}

/** The date `days` after (or before) another date. */
export function addDaysToDate(date: string, days: number): string {
  // Plain UTC arithmetic on the calendar date: independent of the server's own time zone.
  return new Date(dateToWall(date) + days * DAY).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export interface SlotsInput {
  /** The resource's fixed slot length (RES-07). */
  slotMinutes: number;
  /** The resource's open weekdays (one window per weekday, DB9). */
  windows: readonly AvailabilityWindow[];
  /** The workspace's time zone name (D7). */
  timeZone: string;
  /** "Now"; the database uses its own clock. Default: the current time. */
  now?: Date;
}

/**
 * The bookable slots of one calendar day (AVAIL-03):
 *  * wall-clock slots from opens_at in steps of slot_minutes, each ending by closes_at;
 *  * a wall time that is skipped (clocks forward) gives no slot;
 *  * a repeated wall time (clocks back) gives only its first copy (Q7);
 *  * slots that already started, and days more than 90 days ahead, are not offered.
 */
export function slotsForDay(input: SlotsInput & { date: string }): Slot[] {
  const { slotMinutes, windows, timeZone, date } = input;
  const now = (input.now ?? new Date()).getTime();
  const midnight = dateToWall(date);
  if (Number.isNaN(midnight) || !Number.isInteger(slotMinutes) || slotMinutes < 1) return [];

  const window = windows.find((w) => w.weekday === isoWeekday(date));
  if (!window) return [];
  const opens = parseClock(window.opensAt);
  const closes = parseClock(window.closesAt);
  if (Number.isNaN(opens) || Number.isNaN(closes) || closes <= opens) return [];

  // D8: no more than 90 days ahead, counted in the workspace's zone.
  const todayWall = dateToWall(todayInZone(timeZone, new Date(now)));
  if (midnight > todayWall + MAX_DAYS_AHEAD * DAY) return [];

  const slotSeconds = slotMinutes * 60;
  const slots: Slot[] = [];
  for (let s = opens; s + slotSeconds <= closes; s += slotSeconds) {
    const startWall = midnight + s * SECOND;
    const start = firstInstantForWall(startWall, timeZone);
    if (start === null) continue; // inside a skipped hour
    if (start <= now) continue; // already started or past
    const end = endInstantForWall(startWall + slotSeconds * SECOND, timeZone);
    if (end <= start) continue; // the database refuses this too (safety net)
    slots.push({
      startsAt: new Date(start),
      endsAt: new Date(end),
      date,
      start: formatClock(s),
      end: formatClock(s + slotSeconds),
    });
  }
  return slots;
}

export interface DaySlots {
  date: string;
  weekday: number;
  slots: Slot[];
}

/** The slots of `days` consecutive calendar days starting at `fromDate`. */
export function slotsForRange(input: SlotsInput & { fromDate: string; days: number }): DaySlots[] {
  const out: DaySlots[] = [];
  for (let i = 0; i < input.days; i++) {
    const date = addDaysToDate(input.fromDate, i);
    out.push({ date, weekday: isoWeekday(date), slots: slotsForDay({ ...input, date }) });
  }
  return out;
}

export type StartCheck =
  | { ok: true; endsAt: Date }
  | { ok: false; reason: "invalid_slot" | "past" | "too_far" };

/**
 * Would submit_booking accept this start? Same order of checks as the database
 * (steps 3 to 6): invalid_slot first, then past, then too_far. (Availability of
 * the resource, attendees, the monthly limit and overlaps are other checks.)
 */
export function isBookableStart(input: SlotsInput & { startsAt: Date }): StartCheck {
  const { slotMinutes, windows, timeZone } = input;
  const now = (input.now ?? new Date()).getTime();
  const start = input.startsAt.getTime();
  if (Number.isNaN(start)) return { ok: false, reason: "invalid_slot" };

  // Step 3: the wall time of the start; the second copy of a repeated hour is refused.
  const startWall = wallMsOf(start, timeZone);
  const first = firstInstantForWall(startWall, timeZone);
  if (first === null || first !== start) return { ok: false, reason: "invalid_slot" };

  // Step 4: a window for that local date's weekday; start on the grid; slot ends by closing time.
  const date = wallToDate(startWall);
  const window = windows.find((w) => w.weekday === isoWeekday(date));
  if (!window) return { ok: false, reason: "invalid_slot" };
  const opensMs = parseClock(window.opensAt) * SECOND;
  const closesMs = parseClock(window.closesAt) * SECOND;
  const slotMs = slotMinutes * MINUTE;
  const timeOfDay = startWall - dateToWall(date);
  if (
    Number.isNaN(opensMs) ||
    Number.isNaN(closesMs) ||
    timeOfDay < opensMs ||
    timeOfDay + slotMs > closesMs ||
    (timeOfDay - opensMs) % slotMs !== 0
  ) {
    return { ok: false, reason: "invalid_slot" };
  }

  // Step 5: the end, computed like the database; it must be after the start.
  const end = endInstantForWall(startWall + slotMs, timeZone);
  if (end <= start) return { ok: false, reason: "invalid_slot" };

  // Step 6: not in the past, not more than 90 days ahead (in the workspace's zone).
  if (start <= now) return { ok: false, reason: "past" };
  const todayWall = dateToWall(todayInZone(timeZone, new Date(now)));
  if (dateToWall(date) > todayWall + MAX_DAYS_AHEAD * DAY) return { ok: false, reason: "too_far" };

  return { ok: true, endsAt: new Date(end) };
}
