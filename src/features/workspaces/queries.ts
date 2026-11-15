import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE } from "@/components/pagination";
import { effectivePlan, PLAN_LIMITS, type PlanId } from "@/lib/plans";

// Reads for the workspace pages. They use the owner's own session (RLS), never
// the secret key, so an owner can only ever see their own rows.
// Callers must already have passed the owner check (OwnerGate / requireOwner).

export interface WorkspaceRow {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  time_zone: string;
  is_locked: boolean;
  created_at: string;
}

const COLUMNS = "id, name, description, slug, time_zone, is_locked, created_at";

export interface WorkspaceUsage {
  plan: PlanId;
  used: number;
  max: number;
  atLimit: boolean;
}

// Usage "1 of 1 workspaces" (DB7 rule repeated in the app, Q12). The count
// includes locked workspaces, like the database trigger does.
export const getWorkspaceUsage = cache(async (): Promise<WorkspaceUsage> => {
  const supabase = await createClient();
  const [subscription, count] = await Promise.all([
    supabase.from("subscriptions").select("plan, status").maybeSingle(),
    supabase.from("workspaces").select("id", { count: "exact", head: true }),
  ]);
  if (subscription.error || count.error) {
    // Never guess a limit from a failed read (it could block a Pro owner).
    console.error("getWorkspaceUsage failed", { code: (subscription.error ?? count.error)?.code ?? null });
    throw new Error("Could not load your plan usage.");
  }
  const plan = effectivePlan(subscription.data);
  const limits = await supabase
    .from("plan_limits")
    .select("max_workspaces")
    .eq("plan", plan)
    .maybeSingle();
  // If the limits row cannot be read, fall back to the display copy (DB6).
  const max = limits.data?.max_workspaces ?? PLAN_LIMITS[plan].maxWorkspaces;
  const used = count.count ?? 0;
  return { plan, used, max, atLimit: used >= max };
});

export interface WorkspacePage {
  rows: WorkspaceRow[];
  total: number;
  page: number;
}

export async function listWorkspaces(requestedPage: number): Promise<WorkspacePage> {
  const supabase = await createClient();
  const fetchPage = (page: number) =>
    supabase
      .from("workspaces")
      .select(COLUMNS, { count: "exact" })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // Count first: a request past the last page returns no count, so the page
  // number is clamped before the rows are read.
  const counted = await supabase.from("workspaces").select("id", { count: "exact", head: true });
  const total = counted.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), lastPage);
  const result = await fetchPage(page);
  if (result.error) {
    console.error("listWorkspaces failed", { code: result.error.code });
    throw new Error("Could not load your workspaces.");
  }
  return { rows: result.data ?? [], total, page };
}

export async function getWorkspace(id: string): Promise<WorkspaceRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("workspaces").select(COLUMNS).eq("id", id).maybeSingle();
  return data ?? null;
}
