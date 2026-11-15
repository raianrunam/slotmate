import "server-only";
import { cache } from "react";
import { getOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { effectivePlan, PLAN_LIMITS, type PlanId } from "@/lib/plans";
import { selectionNeeded, type SelResource, type SelWorkspace } from "@/features/billing/schema";

// Reads for the billing screens. Owner session only (RLS): an owner sees only their own rows.
// Callers must already have passed the owner check.

export interface BillingSummary {
  plan: PlanId;
  status: string | null;
  hasCustomer: boolean;
  hasSubscription: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  workspaces: number;
  resources: number;
  requestsThisMonth: number;
  limits: { workspaces: number; resources: number; requests: number };
}

function fail(step: string, error: { code?: string | null }): never {
  console.error("billing read failed", { step, code: error.code ?? null });
  throw new Error("Could not load your billing details.");
}

export async function getBillingSummary(now = new Date()): Promise<BillingSummary> {
  const supabase = await createClient();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const [sub, ws, res, usage] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end")
      .maybeSingle(),
    supabase.from("workspaces").select("id", { count: "exact", head: true }),
    supabase.from("resources").select("id", { count: "exact", head: true }),
    supabase.from("monthly_usage").select("booking_count").eq("month", month).maybeSingle(),
  ]);
  if (sub.error) fail("subscription", sub.error);
  if (ws.error) fail("workspaces", ws.error);
  if (res.error) fail("resources", res.error);
  if (usage.error) fail("usage", usage.error);
  const plan = effectivePlan(sub.data);
  const limits = await supabase
    .from("plan_limits")
    .select("max_workspaces, max_resources, max_monthly_bookings")
    .eq("plan", plan)
    .maybeSingle();
  return {
    plan,
    status: sub.data?.status ?? null,
    hasCustomer: Boolean(sub.data?.stripe_customer_id),
    hasSubscription: Boolean(sub.data?.stripe_subscription_id),
    cancelAtPeriodEnd: sub.data?.cancel_at_period_end ?? false,
    currentPeriodEnd: sub.data?.current_period_end ?? null,
    workspaces: ws.count ?? 0,
    resources: res.count ?? 0,
    requestsThisMonth: usage.data?.booking_count ?? 0,
    limits: {
      workspaces: limits.data?.max_workspaces ?? PLAN_LIMITS[plan].maxWorkspaces,
      resources: limits.data?.max_resources ?? PLAN_LIMITS[plan].maxResources,
      requests: limits.data?.max_monthly_bookings ?? PLAN_LIMITS[plan].maxMonthlyBookings,
    },
  };
}

export interface DowngradeState {
  needed: boolean;
  workspaces: SelWorkspace[];
  resources: SelResource[];
}

// For the selection screen and the banner. `needed` follows DATABASE.md 7.8 exactly.
export async function getDowngradeState(): Promise<DowngradeState> {
  const supabase = await createClient();
  const [sub, ws, res] = await Promise.all([
    supabase.from("subscriptions").select("plan, status").maybeSingle(),
    supabase.from("workspaces").select("id, name, is_locked").order("created_at"),
    supabase.from("resources").select("id, name, workspace_id, is_locked").order("created_at"),
  ]);
  if (sub.error) fail("downgrade_subscription", sub.error);
  if (ws.error) fail("downgrade_workspaces", ws.error);
  if (res.error) fail("downgrade_resources", res.error);
  const workspaces = ws.data ?? [];
  const resources = res.data ?? [];
  return { needed: selectionNeeded(effectivePlan(sub.data), workspaces, resources), workspaces, resources };
}

// Banner check: signed-out visitors and read failures simply show nothing.
export const ownerNeedsSelection = cache(async (): Promise<boolean> => {
  if (!(await getOwner())) return false;
  try {
    return (await getDowngradeState()).needed;
  } catch {
    return false;
  }
});

/** The owner's effective plan for the small upgrade card. null when it cannot be read (then no card is shown). */
export const getOwnerPlan = cache(async (): Promise<PlanId | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("subscriptions").select("plan, status").maybeSingle();
  if (error) {
    console.error("getOwnerPlan failed", { code: error.code });
    return null;
  }
  return effectivePlan(data);
});
