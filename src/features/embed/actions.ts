"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withDeadlockRetry } from "@/features/workspaces/db-errors";
import { MESSAGES, mapEmbedError, parseEmbedUpdate, workspaceIdSchema } from "@/features/embed/schema";
import type { WidgetFormState } from "@/features/embed/state";

// The Server Action that saves the widget options (EMBED-03, EMBED-04).
//  * requireOwner() runs first. The owner comes from the verified login, never from the form.
//  * The database is reached with the owner's OWN session, so row level security applies:
//    another owner's workspace, or a locked one, is simply not changed. The secret key is not
//    used here (A4).
//  * Only theme, layout and background colour are written, after validation. A Free owner who
//    sends a Pro-only value (a forged request: the form disables those fields) is refused by the
//    database trigger enforce_embed_plan_rules ("pro_only_embed_option"), shown as a fixed
//    upgrade message. The UI is never the guard.
//  * Raw database text is never returned: only the fixed sentences. Only error codes are logged.

export async function saveWidgetOptions(_prev: WidgetFormState, formData: FormData): Promise<WidgetFormState> {
  await requireOwner();

  const workspaceId = workspaceIdSchema.safeParse(formData.get("workspaceId"));
  if (!workspaceId.success) return { status: "error", message: MESSAGES.workspace };

  const parsed = parseEmbedUpdate({
    theme: formData.get("theme"),
    layout: formData.get("layout"),
    backgroundColor: formData.get("backgroundColor"),
  });
  if (!parsed.ok) return { status: "error", message: MESSAGES.invalidValues, fieldErrors: parsed.errors };
  const { theme, layout, backgroundColor } = parsed.data;

  const changes: { theme: typeof theme; layout?: typeof layout; background_color?: string | null } = { theme };
  if (layout !== undefined) changes.layout = layout;
  if (backgroundColor !== undefined) changes.background_color = backgroundColor;

  const supabase = await createClient();
  const result = await withDeadlockRetry(() =>
    supabase.from("embed_configurations").update(changes).eq("workspace_id", workspaceId.data).select("workspace_id"),
  );
  if (result.error) {
    console.error("saveWidgetOptions failed", { code: result.error.code ?? null });
    const message = mapEmbedError(result.error);
    return { status: "error", message, proOnly: message === MESSAGES.proOnly };
  }
  if (!result.data || result.data.length === 0) {
    // Nothing changed: hidden by row level security (not yours, or locked) or gone. Find out which, with the owner's session.
    const workspace = await supabase.from("workspaces").select("is_locked").eq("id", workspaceId.data).maybeSingle();
    if (workspace.error) return { status: "error", message: MESSAGES.generic };
    if (!workspace.data) return { status: "error", message: MESSAGES.notAllowed };
    return { status: "error", message: workspace.data.is_locked ? MESSAGES.locked : MESSAGES.generic };
  }

  revalidatePath("/dashboard/widget");
  return { status: "saved", message: MESSAGES.saved };
}
