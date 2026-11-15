import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  analyticsAccess,
  buildAnalytics,
  rangeBounds,
  type AnalyticsAccess,
  type AnalyticsData,
  type BookingFact,
  type DateRange,
} from "@/features/analytics/aggregate";

// Reads for the analytics page. They use the OWNER's own session (RLS), never the secret key, so an owner
// only ever counts their own bookings (ISO-01). Callers must already have passed the owner check
// (OwnerGate / requireOwner). Only the columns the charts need are read (no visitor details).

export interface AnalyticsWorkspace {
  id: string;
  name: string;
  timeZone: string;
}

/** The owner's own workspaces, oldest first (RLS). The first one is the default. */
export async function listAnalyticsWorkspaces(): Promise<AnalyticsWorkspace[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, time_zone")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(50);
  if (error) {
    console.error("listAnalyticsWorkspaces failed", { code: error.code });
    throw new Error("Could not load your workspaces.");
  }
  return (data ?? []).map((w) => ({ id: w.id, name: w.name, timeZone: w.time_zone }));
}

/** What this owner may see (DB7 rule through effectivePlan). A failed read is an error, never a guess of Pro. */
export async function getAnalyticsAccess(): Promise<AnalyticsAccess> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("subscriptions").select("plan, status").maybeSingle();
  if (error) {
    console.error("getAnalyticsAccess failed", { code: error.code });
    throw new Error("Could not load your plan.");
  }
  return analyticsAccess(data);
}

const PAGE = 1000; // PostgREST returns at most 1000 rows per request, so the rows are read in pages.
const MAX_PAGES = 20; // 20 000 rows: a Pro workspace gets at most 1000 requests a month (DB6), a range is at most 366 days.

export interface AnalyticsResult {
  data: AnalyticsData;
  /** True when more rows existed than the safety cap reads (the numbers are then a lower bound). */
  truncated: boolean;
}

/**
 * The analytics of ONE workspace for a range. The workspace id must come from the owner's own list
 * (listAnalyticsWorkspaces); RLS would show nothing for a foreign id anyway. The Pro datasets are only
 * built when `access` allows them (buildAnalytics), and resource ids are only read for Pro.
 */
export async function getAnalytics(input: {
  workspace: AnalyticsWorkspace;
  range: DateRange;
  access: AnalyticsAccess;
}): Promise<AnalyticsResult> {
  const { workspace, range, access } = input;
  const supabase = await createClient();
  const bounds = rangeBounds(range, workspace.timeZone);
  const columns = access.resources ? "status, created_at, resource_id, resources!inner(workspace_id)" : "status, created_at, resources!inner(workspace_id)";

  const facts: BookingFact[] = [];
  let truncated = false;
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      truncated = true;
      break;
    }
    const res = await supabase
      .from("bookings")
      .select(columns)
      .eq("resources.workspace_id", workspace.id)
      .gte("created_at", bounds.from.toISOString())
      .lt("created_at", bounds.until.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (res.error) {
      console.error("getAnalytics bookings failed", { code: res.error.code });
      throw new Error("Could not load your analytics.");
    }
    const rows = (res.data ?? []) as unknown as { status: string; created_at: string; resource_id?: string }[];
    for (const r of rows) facts.push({ status: r.status, createdAt: r.created_at, resourceId: r.resource_id });
    if (rows.length < PAGE) break;
  }

  let resources: { id: string; name: string }[] = [];
  if (access.resources) {
    const res = await supabase.from("resources").select("id, name").eq("workspace_id", workspace.id).order("name", { ascending: true }).limit(100);
    if (res.error) {
      console.error("getAnalytics resources failed", { code: res.error.code });
      throw new Error("Could not load your analytics.");
    }
    resources = res.data ?? [];
  }

  return { data: buildAnalytics({ facts, resources, timeZone: workspace.timeZone, range, access }), truncated };
}
