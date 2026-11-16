import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  analyticsAccess,
  buildAnalytics,
  collectPages,
  overviewDailySeries,
  overviewRange,
  type DayPoint,
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

  // How many rows the range holds (an exact count), then the rows page by page. The same filters in both.
  const counted = await supabase
    .from("bookings")
    .select("id, resources!inner(workspace_id)", { count: "exact", head: true })
    .eq("resources.workspace_id", workspace.id)
    .gte("created_at", bounds.from.toISOString())
    .lt("created_at", bounds.until.toISOString());
  if (counted.error) {
    console.error("getAnalytics count failed", { code: counted.error.code });
    throw new Error("Could not load your analytics.");
  }
  const collected = await collectPages<BookingFact>(
    async (offset) => {
      const res = await supabase
        .from("bookings")
        .select(columns)
        .eq("resources.workspace_id", workspace.id)
        .gte("created_at", bounds.from.toISOString())
        .lt("created_at", bounds.until.toISOString())
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (res.error) {
        console.error("getAnalytics bookings failed", { code: res.error.code });
        throw new Error("Could not load your analytics.");
      }
      const rows = (res.data ?? []) as unknown as { status: string; created_at: string; resource_id?: string }[];
      return rows.map((r) => ({ status: r.status, createdAt: r.created_at, resourceId: r.resource_id }));
    },
    counted.count ?? 0,
    MAX_PAGES * PAGE,
  );
  const facts = collected.rows;
  const truncated = collected.truncated;

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

export interface OverviewTrend {
  range: DateRange;
  daily: DayPoint[];
  total: number;
  truncated: boolean;
}

/**
 * DASH-05: requests per day for the last 30 days across ALL of the owner's workspaces, each booking on its own
 * workspace's local date. Owner session (RLS); only created_at and the workspace id are read. The query window is
 * the widest instant span of the workspaces' days; the exact local-day split is done by overviewDailySeries.
 */
export async function getOverviewTrend(): Promise<OverviewTrend> {
  const workspaces = await listAnalyticsWorkspaces();
  const range = overviewRange(workspaces.map((w) => w.timeZone));
  if (workspaces.length === 0) {
    return { range, daily: overviewDailySeries([], range), total: 0, truncated: false };
  }
  const zoneOf = new Map(workspaces.map((w) => [w.id, w.timeZone]));
  const bounds = workspaces.map((w) => rangeBounds(range, w.timeZone));
  const from = new Date(Math.min(...bounds.map((b) => b.from.getTime()))).toISOString();
  const until = new Date(Math.max(...bounds.map((b) => b.until.getTime()))).toISOString();
  const supabase = await createClient();

  const counted = await supabase
    .from("bookings")
    .select("id, resources!inner(workspace_id)", { count: "exact", head: true })
    .gte("created_at", from)
    .lt("created_at", until);
  if (counted.error) {
    console.error("getOverviewTrend count failed", { code: counted.error.code });
    throw new Error("Could not load your booking trend.");
  }
  const collected = await collectPages<{ createdAt: string; timeZone: string }>(
    async (offset) => {
      const res = await supabase
        .from("bookings")
        .select("created_at, resources!inner(workspace_id)")
        .gte("created_at", from)
        .lt("created_at", until)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (res.error) {
        console.error("getOverviewTrend bookings failed", { code: res.error.code });
        throw new Error("Could not load your booking trend.");
      }
      const rows = (res.data ?? []) as unknown as { created_at: string; resources: { workspace_id: string } | { workspace_id: string }[] }[];
      return rows.flatMap((r) => {
        const resource = Array.isArray(r.resources) ? r.resources[0] : r.resources;
        const timeZone = resource ? zoneOf.get(resource.workspace_id) : undefined;
        return timeZone ? [{ createdAt: r.created_at, timeZone }] : [];
      });
    },
    counted.count ?? 0,
    MAX_PAGES * PAGE,
  );
  const daily = overviewDailySeries(collected.rows, range);
  return { range, daily, total: daily.reduce((sum, d) => sum + d.count, 0), truncated: collected.truncated };
}
