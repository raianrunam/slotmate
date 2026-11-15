"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectivePlan, PLAN_LIMITS } from "@/lib/plans";
import { withDeadlockRetry } from "@/features/workspaces/db-errors";
import {
  mapSelectionError,
  SELECTION_MESSAGES,
  uuidSchema,
  type SelectionFormState,
} from "@/features/billing/schema";

// The downgrade selection (A18, S2, DB17; ARCHITECTURE A4 "place 6": the admin connection).
//
// The owner chooses exactly ONE workspace and 0-3 resources inside it. Nothing is ever chosen
// automatically. This action:
//  1. requireOwner() (the owner id never comes from the form);
//  2. checks the Free plan applies and parses the ids;
//  3. checks with the OWNER's session (RLS) that the workspace and every resource really
//     belong to this owner and that each resource sits in the chosen workspace;
//  4. only then calls the protected database function with the admin connection, which
//     re-checks everything (the real guard) and refuses the whole selection if anything is off.
// Database text is never shown: errors map to fixed sentences. Only codes are logged.

export async function saveDowngradeSelection(
  _prev: SelectionFormState,
  formData: FormData,
): Promise<SelectionFormState> {
  const owner = await requireOwner();

  const workspace = uuidSchema.safeParse(formData.get("workspaceId"));
  if (!workspace.success) return { status: "error", message: SELECTION_MESSAGES.workspace };
  const parsedIds = formData.getAll("resourceIds").map((v) => uuidSchema.safeParse(v));
  if (parsedIds.some((r) => !r.success)) return { status: "error", message: SELECTION_MESSAGES.invalid };
  const ids = parsedIds.map((r) => (r.success ? r.data : ""));
  if (new Set(ids).size !== ids.length) return { status: "error", message: SELECTION_MESSAGES.invalid };
  if (ids.length > PLAN_LIMITS.free.maxResources) return { status: "error", message: SELECTION_MESSAGES.tooMany };

  const supabase = await createClient();
  const sub = await supabase.from("subscriptions").select("plan, status").maybeSingle();
  if (sub.error) {
    console.error("saveDowngradeSelection failed", { step: "read_subscription", code: sub.error.code });
    return { status: "error", message: SELECTION_MESSAGES.generic };
  }
  if (effectivePlan(sub.data) !== "free") return { status: "error", message: SELECTION_MESSAGES.notNeeded };

  const [ws, res] = await Promise.all([
    supabase.from("workspaces").select("id").eq("id", workspace.data),
    ids.length > 0
      ? supabase.from("resources").select("id, workspace_id").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; workspace_id: string }[], error: null }),
  ]);
  if (ws.error || res.error) {
    console.error("saveDowngradeSelection failed", {
      step: "ownership_check",
      code: (ws.error ?? res.error)?.code ?? null,
    });
    return { status: "error", message: SELECTION_MESSAGES.generic };
  }
  const rows = res.data ?? [];
  if (
    (ws.data ?? []).length !== 1 ||
    rows.length !== ids.length ||
    rows.some((r) => r.workspace_id !== workspace.data)
  ) {
    return { status: "error", message: SELECTION_MESSAGES.invalid };
  }

  const admin = createAdminClient();
  const result = await withDeadlockRetry(() =>
    admin.rpc("apply_downgrade_selection", {
      p_owner_id: owner.id,
      p_workspace_id: workspace.data,
      p_resource_ids: ids,
    }),
  );
  if (result.error) {
    console.error("saveDowngradeSelection failed", { step: "apply", code: result.error.code ?? null });
    return { status: "error", message: mapSelectionError(result.error) };
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/billing?notice=selection_saved");
}
