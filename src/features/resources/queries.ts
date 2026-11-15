import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { PAGE_SIZE } from "@/components/pagination";
import { effectivePlan, PLAN_LIMITS, type PlanId } from "@/lib/plans";

// Reads for the resource pages. They use the owner's own session (RLS), never
// the secret key. Callers must already have passed the owner check.

export interface ResourceRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  is_available: boolean;
  is_locked: boolean;
  slot_minutes: number;
  capacity: number;
  created_at: string;
  /** The workspace this resource is in (joined). */
  workspaces: { id: string; name: string; is_locked: boolean } | null;
}

const COLUMNS =
  "id, workspace_id, name, description, image_path, is_available, is_locked, slot_minutes, capacity, created_at, workspaces(id, name, is_locked)";

/** The public address of a stored image (the bucket is public, S1). */
export function publicImageUrl(path: string | null): string | null {
  if (!path) return null;
  const base = getEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/resource-images/${encoded}`;
}

export interface ResourceUsage {
  plan: PlanId;
  used: number;
  max: number;
  atLimit: boolean;
}

// "2 of 3 resources" across the WHOLE account (D2), locked ones included, like
// the database trigger. The DB7 rule is repeated here (Q12).
export const getResourceUsage = cache(async (): Promise<ResourceUsage> => {
  const supabase = await createClient();
  const [subscription, count] = await Promise.all([
    supabase.from("subscriptions").select("plan, status").maybeSingle(),
    supabase.from("resources").select("id", { count: "exact", head: true }),
  ]);
  if (subscription.error || count.error) {
    console.error("getResourceUsage failed", { code: (subscription.error ?? count.error)?.code ?? null });
    throw new Error("Could not load your plan usage.");
  }
  const plan = effectivePlan(subscription.data);
  const limits = await supabase.from("plan_limits").select("max_resources").eq("plan", plan).maybeSingle();
  const max = limits.data?.max_resources ?? PLAN_LIMITS[plan].maxResources;
  const used = count.count ?? 0;
  return { plan, used, max, atLimit: used >= max };
});

export interface ResourcePage {
  rows: ResourceRow[];
  total: number;
  page: number;
}

/** A page of the owner's resources, newest last; optionally only one workspace's. */
export async function listResources(requestedPage: number, workspaceId?: string): Promise<ResourcePage> {
  const supabase = await createClient();
  const base = () => {
    const q = supabase.from("resources");
    return q;
  };
  let countQuery = base().select("id", { count: "exact", head: true });
  if (workspaceId) countQuery = countQuery.eq("workspace_id", workspaceId);
  const counted = await countQuery;
  const total = counted.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), lastPage);

  let rowsQuery = base().select(COLUMNS);
  if (workspaceId) rowsQuery = rowsQuery.eq("workspace_id", workspaceId);
  const result = await rowsQuery
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (result.error) {
    console.error("listResources failed", { code: result.error.code });
    throw new Error("Could not load your resources.");
  }
  return { rows: (result.data ?? []) as unknown as ResourceRow[], total, page };
}

export async function getResource(id: string): Promise<ResourceRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("resources").select(COLUMNS).eq("id", id).maybeSingle();
  return (data as unknown as ResourceRow | null) ?? null;
}

/** The owner's workspaces a resource can be created in (unlocked ones only, RLS shows only the owner's). */
export async function listWorkspaceChoices(): Promise<{ id: string; name: string; is_locked: boolean }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspaces")
    .select("id, name, is_locked")
    .order("created_at", { ascending: true })
    .limit(100);
  return data ?? [];
}
