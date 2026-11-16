import { effectivePlan, type PlanId } from "@/lib/plans";
import { dateIn } from "@/lib/time/format";
import { addDaysToDate, endInstantForWall, todayInZone } from "@/lib/time/slots";

// Analytics maths (Phase 13, ANLT-01 to ANLT-06, A12). Pure: no database, no secrets, so it is unit-tested.
//
// Definitions (also shown to the owner on the page):
// - "Requests received" are counted by the day the request was MADE (created_at), as a calendar day in the
//   WORKSPACE's time zone (A12), never the server's or the browser's zone.
// - Status counts are the CURRENT status of the bookings that still exist. A deleted booking is gone from every
//   number here (the monthly plan counter, D19, is a different thing and is not shown).
// - Free owners always see the last 30 days. Pro owners can choose a range (at most 366 days).

export const BOOKING_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type AnalyticsStatus = (typeof BOOKING_STATUSES)[number];
export type StatusCounts = Record<AnalyticsStatus, number>;

export const FREE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;
export const MIN_DATE = "2020-01-01";

// ---------------------------------------------------------------------------
// Plan gate: what the server may compute and send (Free gets none of the Pro datasets)
// ---------------------------------------------------------------------------

export interface AnalyticsAccess {
  plan: PlanId;
  monthly: boolean;
  resources: boolean;
  rangeFilter: boolean;
}

/** The single decision about Pro analytics (ANLT-03, 04, 06). Uses the DB7 rule through effectivePlan. */
export function analyticsAccess(subscription: { plan: string; status: string | null } | null | undefined): AnalyticsAccess {
  const plan = effectivePlan(subscription);
  const pro = plan === "pro";
  return { plan, monthly: pro, resources: pro, rangeFilter: pro };
}

// ---------------------------------------------------------------------------
// Dates and ranges
// ---------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isRealDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** Whole days from one date to another (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export interface DateRange {
  /** First day, inclusive (a calendar date in the workspace's zone). */
  from: string;
  /** Last day, inclusive. */
  to: string;
}

/** The last 30 days including today, in the workspace's zone. */
export function defaultRange(timeZone: string, now: Date = new Date()): DateRange {
  const to = todayInZone(timeZone, now);
  return { from: addDaysToDate(to, -(FREE_DAYS - 1)), to };
}

export type RangeParse = { range: DateRange; error: null; custom: boolean } | { range: DateRange; error: string; custom: false };

/**
 * Reads ?from= and ?to= (ANLT-06). Nothing given: the last 30 days. Only one given: the other end is chosen
 * (to = today, or from = 29 days before to). An end before the start, a text that is not a date, a date before
 * MIN_DATE or a span over 366 days is refused: the default range is used and a message says why.
 * A future end date is moved back to today (requests cannot be received in the future).
 */
export function parseRange(
  rawFrom: string | undefined,
  rawTo: string | undefined,
  timeZone: string,
  now: Date = new Date(),
): RangeParse {
  const fallback = defaultRange(timeZone, now);
  const from = rawFrom?.trim() ?? "";
  const to = rawTo?.trim() ?? "";
  if (!from && !to) return { range: fallback, error: null, custom: false };
  if ((from && !isRealDate(from)) || (to && !isRealDate(to))) {
    return { range: fallback, error: "Use real dates (year-month-day) for the start and the end.", custom: false };
  }
  const today = todayInZone(timeZone, now);
  let end = to || today;
  if (end > today) end = today;
  const start = from || addDaysToDate(end, -(FREE_DAYS - 1));
  if (start < MIN_DATE) return { range: fallback, error: `The start date cannot be before ${MIN_DATE}.`, custom: false };
  if (start > end) return { range: fallback, error: "The end date cannot be before the start date.", custom: false };
  if (daysBetween(start, end) + 1 > MAX_RANGE_DAYS) {
    return { range: fallback, error: `Choose a period of at most ${MAX_RANGE_DAYS} days.`, custom: false };
  }
  return { range: { from: start, to: end }, error: null, custom: true };
}

/** The exact instant a calendar day starts (midnight) in a zone. Handles clock changes. */
export function dayStartInstant(date: string, timeZone: string): Date {
  return new Date(endInstantForWall(Date.parse(`${date}T00:00:00Z`), timeZone));
}

/** The query bounds of a range as instants: starts_at >= from, < until (the start of the day after `to`). */
export function rangeBounds(range: DateRange, timeZone: string): { from: Date; until: Date } {
  return { from: dayStartInstant(range.from, timeZone), until: dayStartInstant(addDaysToDate(range.to, 1), timeZone) };
}

// ---------------------------------------------------------------------------
// Paging (pure, so the loop can be tested without a database)
// ---------------------------------------------------------------------------

/**
 * Reads rows page by page until `total` rows are collected. The next page starts after the rows actually RECEIVED (not after
 * a page size assumed in advance), so a host that returns fewer rows per request than asked (a lower max-rows setting) still
 * gives every row. Stops with `truncated: true` if it reaches `maxRows` or gets an empty page before `total`, so a partial
 * result is never presented as complete (Phase 13 review).
 */
export async function collectPages<T>(fetchPage: (offset: number) => Promise<T[]>, total: number, maxRows: number): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  while (rows.length < total) {
    if (rows.length >= maxRows) return { rows, truncated: true };
    const page = await fetchPage(rows.length);
    if (page.length === 0) return { rows, truncated: true };
    rows.push(...page);
  }
  return { rows, truncated: false };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface BookingFact {
  status: string;
  createdAt: string;
  /** Only read when the Pro resource view is allowed. */
  resourceId?: string;
}

export interface Totals extends StatusCounts {
  total: number;
}

export function emptyCounts(): StatusCounts {
  return { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
}

const isStatus = (value: string): value is AnalyticsStatus => (BOOKING_STATUSES as readonly string[]).includes(value);

export function statusTotals(facts: readonly Pick<BookingFact, "status">[]): Totals {
  const counts = emptyCounts();
  for (const f of facts) if (isStatus(f.status)) counts[f.status] += 1;
  return { ...counts, total: counts.pending + counts.approved + counts.rejected + counts.cancelled };
}

export interface DayPoint {
  /** Calendar date in the workspace's zone, YYYY-MM-DD. */
  date: string;
  label: string;
  count: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "15 Nov" (fixed words, so server and browser agree). */
export function dayLabel(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

/** "Nov 2026" for "2026-11". */
export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** Requests per day, one entry for EVERY day of the range (zero filled), days taken in the workspace's zone (A12). */
export function dailySeries(createdAts: readonly string[], timeZone: string, range: DateRange): DayPoint[] {
  const counts = new Map<string, number>();
  for (const at of createdAts) {
    const day = dateIn(at, timeZone);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const points: DayPoint[] = [];
  const length = daysBetween(range.from, range.to) + 1;
  for (let i = 0; i < length; i++) {
    const date = addDaysToDate(range.from, i);
    points.push({ date, label: dayLabel(date), count: counts.get(date) ?? 0 });
  }
  return points;
}

/**
 * The 30 days of the dashboard overview (DASH-05), across all of an owner's workspaces. The window ends at the LATEST
 * local "today" among the workspaces' zones, so no workspace's today is ever cut off. No workspace: UTC.
 */
export function overviewRange(timeZones: readonly string[], now: Date = new Date()): DateRange {
  const zones = timeZones.length > 0 ? timeZones : ["UTC"];
  const to = zones.map((zone) => todayInZone(zone, now)).reduce((a, b) => (a > b ? a : b));
  return { from: addDaysToDate(to, -(FREE_DAYS - 1)), to };
}

/**
 * Requests per day across workspaces (DASH-05): every booking is placed on the calendar day it was made in ITS OWN
 * workspace's zone (A12), then the days are summed. One entry for every day of the range (zero filled); a booking whose
 * local day falls outside the range is not counted.
 */
export function overviewDailySeries(facts: readonly { createdAt: string; timeZone: string }[], range: DateRange): DayPoint[] {
  const counts = new Map<string, number>();
  for (const f of facts) {
    const day = dateIn(f.createdAt, f.timeZone);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const points: DayPoint[] = [];
  const length = daysBetween(range.from, range.to) + 1;
  for (let i = 0; i < length; i++) {
    const date = addDaysToDate(range.from, i);
    points.push({ date, label: dayLabel(date), count: counts.get(date) ?? 0 });
  }
  return points;
}

export interface MonthPoint {
  /** YYYY-MM, in the workspace's zone. */
  month: string;
  label: string;
  count: number;
}

/** Requests per calendar month from the month of range.from to the month of range.to (zero filled). */
export function monthlySeries(createdAts: readonly string[], timeZone: string, range: DateRange): MonthPoint[] {
  const counts = new Map<string, number>();
  for (const at of createdAts) {
    const month = dateIn(at, timeZone).slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  const points: MonthPoint[] = [];
  let year = Number(range.from.slice(0, 4));
  let month = Number(range.from.slice(5, 7));
  const last = range.to.slice(0, 7);
  for (let guard = 0; guard < 400; guard++) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key > last) break;
    points.push({ month: key, label: monthLabel(key), count: counts.get(key) ?? 0 });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return points;
}

export interface ResourceUsagePoint {
  resourceId: string;
  name: string;
  count: number;
}

/** Bookings per resource, most used first (ties by name). Resources with no bookings are listed with 0. */
export function resourceUsage(
  facts: readonly Pick<BookingFact, "resourceId">[],
  resources: readonly { id: string; name: string }[],
): ResourceUsagePoint[] {
  const counts = new Map<string, number>();
  for (const f of facts) if (f.resourceId) counts.set(f.resourceId, (counts.get(f.resourceId) ?? 0) + 1);
  return resources
    .map((r) => ({ resourceId: r.id, name: r.name, count: counts.get(r.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Everything the page needs, shaped by the plan
// ---------------------------------------------------------------------------

export interface AnalyticsData {
  range: DateRange;
  totals: Totals;
  daily: DayPoint[];
  /** Present ONLY when the plan allows it (Pro). The key does not exist for Free. */
  monthly?: MonthPoint[];
  /** Present ONLY when the plan allows it (Pro). The key does not exist for Free. */
  resources?: ResourceUsagePoint[];
}

/** Builds the datasets the plan allows. A Pro dataset is not even computed for a Free owner. */
export function buildAnalytics(input: {
  facts: readonly BookingFact[];
  resources: readonly { id: string; name: string }[];
  timeZone: string;
  range: DateRange;
  access: AnalyticsAccess;
}): AnalyticsData {
  const { facts, resources, timeZone, range, access } = input;
  const createdAts = facts.map((f) => f.createdAt);
  const data: AnalyticsData = {
    range,
    totals: statusTotals(facts),
    daily: dailySeries(createdAts, timeZone, range),
  };
  if (access.monthly) data.monthly = monthlySeries(createdAts, timeZone, range);
  if (access.resources) data.resources = resourceUsage(facts, resources);
  return data;
}

// ---------------------------------------------------------------------------
// Address parameters
// ---------------------------------------------------------------------------

export type SearchParamValue = string | string[] | undefined;

export function first(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The wanted workspace id, or undefined when it is missing or not a UUID (junk never reaches the database). */
export function parseWorkspaceParam(value: SearchParamValue): string | undefined {
  const v = first(value)?.trim();
  return v && UUID.test(v) ? v.toLowerCase() : undefined;
}

/** The workspace to show: the wanted one if it is the owner's own, otherwise the first. */
export function pickWorkspace<T extends { id: string }>(own: readonly T[], wanted: string | undefined): T | undefined {
  return own.find((w) => w.id === wanted) ?? own[0];
}

export function analyticsHref(params: { workspace: string; from?: string; to?: string }): string {
  const q = new URLSearchParams({ workspace: params.workspace });
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  return `/dashboard/analytics?${q.toString()}`;
}
