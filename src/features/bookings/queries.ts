import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE } from "@/components/pagination";
import { effectivePlan, PLAN_LIMITS, type PlanId } from "@/lib/plans";
import { containsPattern, postgrestQuote, type StatusFilter } from "@/features/bookings/schema";
import type { BookingStatus } from "@/components/status-badge";

// Reads for the booking pages. They use the OWNER's own session (RLS), never the secret key, so an
// owner only ever sees their own bookings (BOOK-01, ISO-01). Callers must already have passed
// the owner check (OwnerGate / requireOwner). Visitor details are read here for the owner only.

export interface BookingListRow {
  id: string;
  visitor_name: string;
  attendees: number;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  created_at: string;
  resourceName: string;
  workspaceName: string;
  timeZone: string;
}

export interface BookingDetail extends BookingListRow {
  visitor_email: string;
  visitor_phone: string | null;
  note: string | null;
  updated_at: string;
  resourceId: string;
  workspaceId: string;
  /** The resource or its workspace is locked after a downgrade: the booking is read-only (Q9). */
  locked: boolean;
}

const LIST_COLUMNS = "id, visitor_name, attendees, starts_at, ends_at, status, created_at, resources!inner(name, workspaces!inner(name, time_zone))";
const DETAIL_COLUMNS =
  "id, visitor_name, visitor_email, visitor_phone, note, attendees, starts_at, ends_at, status, created_at, updated_at, resource_id, resources!inner(name, is_locked, workspace_id, workspaces!inner(name, time_zone, is_locked))";

interface RawRow {
  id: string;
  visitor_name: string;
  attendees: number;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  created_at: string;
  resources: RawResource | RawResource[];
}
interface RawResource {
  name: string;
  is_locked?: boolean;
  workspace_id?: string;
  workspaces: RawWorkspace | RawWorkspace[];
}
interface RawWorkspace {
  name: string;
  time_zone: string;
  is_locked?: boolean;
}

// An embedded to-one relation can come back typed as an object or a one-element array; take the object.
function one<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function toRow(r: RawRow): BookingListRow {
  const resource = one(r.resources);
  const workspace = one(resource.workspaces);
  return {
    id: r.id,
    visitor_name: r.visitor_name,
    attendees: r.attendees,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    status: r.status,
    created_at: r.created_at,
    resourceName: resource.name,
    workspaceName: workspace.name,
    timeZone: workspace.time_zone,
  };
}

export interface BookingPage {
  rows: BookingListRow[];
  total: number;
  /** The page actually shown (the requested one, clamped to the last page). */
  page: number;
}

export async function listBookings(params: { status: StatusFilter; q: string; page: number }): Promise<BookingPage> {
  const supabase = await createClient();

  // Search (BOOK-08, DB13): visitor name, visitor email or resource name, ignoring case. The text is
  // escaped for ILIKE ("%" and "_" are letters) and quoted for the filter list (commas etc. are text).
  // Resource names live in another table, so the matching resource ids are looked up first (RLS: the
  // owner's resources only).
  let orFilter: string | null = null;
  if (params.q) {
    const pattern = postgrestQuote(containsPattern(params.q));
    const matching = await supabase.from("resources").select("id").ilike("name", containsPattern(params.q)).limit(200);
    if (matching.error) {
      console.error("listBookings resource search failed", { code: matching.error.code });
      throw new Error("Could not load your bookings.");
    }
    const parts = [`visitor_name.ilike.${pattern}`, `visitor_email.ilike.${pattern}`];
    const ids = (matching.data ?? []).map((r) => r.id);
    if (ids.length > 0) parts.push(`resource_id.in.(${ids.join(",")})`);
    orFilter = parts.join(",");
  }

  // Count first: a page past the last one returns an error, so the number is clamped before the rows are read.
  let countQuery = supabase.from("bookings").select("id", { count: "exact", head: true });
  if (params.status !== "all") countQuery = countQuery.eq("status", params.status);
  if (orFilter) countQuery = countQuery.or(orFilter);
  const counted = await countQuery;
  if (counted.error) {
    console.error("listBookings count failed", { code: counted.error.code });
    throw new Error("Could not load your bookings.");
  }
  const total = counted.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(params.page) || 1), lastPage);

  let rowQuery = supabase.from("bookings").select(LIST_COLUMNS);
  if (params.status !== "all") rowQuery = rowQuery.eq("status", params.status);
  if (orFilter) rowQuery = rowQuery.or(orFilter);
  const result = await rowQuery
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (result.error) {
    console.error("listBookings failed", { code: result.error.code });
    throw new Error("Could not load your bookings.");
  }
  return { rows: (result.data ?? []).map((r) => toRow(r as unknown as RawRow)), total, page };
}

/** One booking with all its details, or null when it does not exist or is not this owner's (RLS). */
export async function getBooking(id: string): Promise<BookingDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bookings").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    console.error("getBooking failed", { code: error.code });
    throw new Error("Could not load this booking.");
  }
  if (!data) return null;
  const raw = data as unknown as RawRow & {
    visitor_email: string;
    visitor_phone: string | null;
    note: string | null;
    updated_at: string;
    resource_id: string;
  };
  const resource = one(raw.resources);
  const workspace = one(resource.workspaces);
  return {
    ...toRow(raw),
    visitor_email: raw.visitor_email,
    visitor_phone: raw.visitor_phone,
    note: raw.note,
    updated_at: raw.updated_at,
    resourceId: raw.resource_id,
    workspaceId: resource.workspace_id ?? "",
    locked: Boolean(resource.is_locked || workspace.is_locked),
  };
}

/** How many requests wait for a decision (NOTIF-02). The owner's own bookings only (RLS). One query per request. */
export const getPendingCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (error) {
    console.error("getPendingCount failed", { code: error.code });
    return 0; // a badge must never break a page
  }
  return count ?? 0;
});

/** The newest booking requests (DASH-06, D25: five). */
export async function getRecentActivity(limit = 5): Promise<BookingListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getRecentActivity failed", { code: error.code });
    throw new Error("Could not load recent activity.");
  }
  return (data ?? []).map((r) => toRow(r as unknown as RawRow));
}

/** Pending requests that need a decision, longest waiting first. */
export async function getPendingRequests(limit = 5): Promise<BookingListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(LIST_COLUMNS)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("getPendingRequests failed", { code: error.code });
    throw new Error("Could not load pending requests.");
  }
  return (data ?? []).map((r) => toRow(r as unknown as RawRow));
}

export interface OverviewStats {
  total: number;
  pending: number;
  /** All approved and all rejected requests (DASH-04), whatever the month. */
  approved: number;
  rejected: number;
  /** Approved bookings whose approval happened in the current UTC month (updated_at: an approved booking only changes again when it is cancelled). */
  approvedThisMonth: number;
  plan: PlanId;
  /** Requests received this UTC month (monthly_usage, D19: deleted requests still count). */
  usedThisMonth: number;
  maxPerMonth: number;
}

export function firstOfUtcMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function getOverviewStats(now = new Date()): Promise<OverviewStats> {
  const supabase = await createClient();
  const month = firstOfUtcMonth(now);
  const monthStart = `${month}T00:00:00Z`;
  const [total, pending, approved, rejected, approvedMonth, subscription, usage] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true }),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "approved").gte("updated_at", monthStart),
    supabase.from("subscriptions").select("plan, status").maybeSingle(),
    supabase.from("monthly_usage").select("booking_count").eq("month", month).maybeSingle(),
  ]);
  const failed = [total, pending, approved, rejected, approvedMonth, subscription, usage].find((r) => r.error);
  if (failed?.error) {
    console.error("getOverviewStats failed", { code: failed.error.code });
    throw new Error("Could not load the overview numbers.");
  }
  const plan = effectivePlan(subscription.data);
  const limits = await supabase.from("plan_limits").select("max_monthly_bookings").eq("plan", plan).maybeSingle();
  return {
    total: total.count ?? 0,
    pending: pending.count ?? 0,
    approved: approved.count ?? 0,
    rejected: rejected.count ?? 0,
    approvedThisMonth: approvedMonth.count ?? 0,
    plan,
    usedThisMonth: usage.data?.booking_count ?? 0,
    maxPerMonth: limits.data?.max_monthly_bookings ?? PLAN_LIMITS[plan].maxMonthlyBookings,
  };
}
