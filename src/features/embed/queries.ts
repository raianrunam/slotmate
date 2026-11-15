import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceUsage } from "@/features/workspaces/queries";
import { normalizeEmbedOptions, type EmbedOptions } from "@/features/embed/schema";
import type { PlanId } from "@/lib/plans";

// Reads for the dashboard widget page. They use the owner's own session (RLS), never the
// secret key: an owner can only ever see their own workspaces and their widget options.
// Callers must already have passed the owner check (OwnerGate).

export interface WidgetWorkspace {
  id: string;
  name: string;
  slug: string;
  isLocked: boolean;
}

export async function listWidgetWorkspaces(): Promise<WidgetWorkspace[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("workspaces")
    .select("id, name, slug, is_locked")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (result.error) {
    console.error("listWidgetWorkspaces failed", { code: result.error.code });
    throw new Error("Could not load your workspaces.");
  }
  return (result.data ?? []).map((w) => ({ id: w.id, name: w.name, slug: w.slug, isLocked: w.is_locked }));
}

/** The SAVED options of one of the owner's workspaces (what the live preview shows) and the owner's plan. */
export async function getWidgetOptions(workspaceId: string): Promise<{ options: EmbedOptions; plan: PlanId }> {
  const supabase = await createClient();
  const [config, usage] = await Promise.all([
    supabase.from("embed_configurations").select("theme, layout, background_color").eq("workspace_id", workspaceId).maybeSingle(),
    getWorkspaceUsage(),
  ]);
  if (config.error) {
    console.error("getWidgetOptions failed", { code: config.error.code });
    throw new Error("Could not load the widget options.");
  }
  return { options: normalizeEmbedOptions(config.data), plan: usage.plan };
}
