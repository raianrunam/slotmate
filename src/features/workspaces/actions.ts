"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, readFields } from "@/features/auth/schema";
import { FRIENDLY, mapWorkspaceError, withDeadlockRetry } from "@/features/workspaces/db-errors";
import { removeResourceFiles, sweepResourceFilesAfterDelete } from "@/features/resources/images";
import { getWorkspaceUsage } from "@/features/workspaces/queries";
import { MESSAGES, workspaceIdSchema, workspaceSchema } from "@/features/workspaces/schema";
import type { WorkspaceFormState } from "@/features/workspaces/state";

// Server Actions for workspaces (WORK-01 to WORK-04).
//
// Rules for every action here:
//  * requireOwner() runs first. The owner's id comes from the verified login,
//    never from the form (AUTH-05).
//  * The database is reached with the owner's own session client, so RLS
//    applies. The secret key is not used in this feature (A4).
//  * Database errors are mapped to fixed friendly messages (db-errors.ts). Raw
//    database text is never returned or shown.
//  * A write cancelled by a deadlock (40P01) is retried once (Q10).
//  * Only error codes are logged, never form values.

const FIELDS = ["name", "description", "slug", "timeZone"] as const;

function failure(error: ReturnType<typeof mapWorkspaceError>): WorkspaceFormState {
  if (error.field) {
    return { status: "error", fieldErrors: { [error.field]: error.message } };
  }
  return { status: "error", message: error.message, limitReached: error.kind === "limit" };
}

function logFailure(action: string, error: { code?: string | null }) {
  console.error(`${action} failed`, { code: error.code ?? null });
}

export async function createWorkspace(
  _prev: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const owner = await requireOwner();

  const parsed = workspaceSchema.safeParse(readFields(formData, FIELDS));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  // Friendly pre-check (A6). The database trigger below is the real guard.
  const usage = await getWorkspaceUsage();
  if (usage.atLimit) {
    return failure(mapWorkspaceError({ message: "workspace_limit_reached" }));
  }

  const supabase = await createClient();
  const { name, description, slug, timeZone } = parsed.data;
  const result = await withDeadlockRetry(() =>
    supabase.from("workspaces").insert({
      owner_id: owner.id,
      name,
      description,
      slug,
      time_zone: timeZone,
    }),
  );
  if (result.error) {
    logFailure("createWorkspace", result.error);
    return failure(mapWorkspaceError(result.error));
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/workspaces?notice=created");
}

export async function updateWorkspace(
  _prev: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  await requireOwner();

  const id = workspaceIdSchema.safeParse(readFields(formData, ["id"]).id);
  if (!id.success) return { status: "error", message: MESSAGES.id };
  const parsed = workspaceSchema.safeParse(readFields(formData, FIELDS));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { name, description, slug, timeZone } = parsed.data;
  const result = await withDeadlockRetry(() =>
    supabase
      .from("workspaces")
      .update({ name, description, slug, time_zone: timeZone })
      .eq("id", id.data)
      .select("id"),
  );
  if (result.error) {
    logFailure("updateWorkspace", result.error);
    return failure(mapWorkspaceError(result.error));
  }
  // RLS hides other owners' rows and locked rows from an update: no row changed.
  if (!result.data || result.data.length === 0) {
    return { status: "error", message: FRIENDLY.notAllowed };
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/workspaces?notice=saved");
}

export async function deleteWorkspace(
  _prev: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const owner = await requireOwner();

  const id = workspaceIdSchema.safeParse(readFields(formData, ["id"]).id);
  if (!id.success) return { status: "error", message: MESSAGES.id };

  const supabase = await createClient();

  // DB15: delete the stored images of every resource in this workspace BEFORE the
  // workspace (the cascade does not touch Storage). The list is read with the
  // owner's own session, so it only ever holds this owner's resources. If
  // Storage fails, stop: nothing is deleted.
  const inside = await supabase.from("resources").select("id").eq("workspace_id", id.data);
  if (inside.error) {
    logFailure("deleteWorkspace", inside.error);
    return failure(mapWorkspaceError(inside.error));
  }
  if (!(await removeResourceFiles(owner.id, (inside.data ?? []).map((r) => r.id)))) {
    return {
      status: "error",
      message: "We could not delete the image files of this workspace's resources, so nothing was deleted. Please try again.",
    };
  }

  const result = await withDeadlockRetry(() =>
    supabase.from("workspaces").delete().eq("id", id.data).select("id"),
  );
  if (result.error) {
    logFailure("deleteWorkspace", result.error);
    return failure(mapWorkspaceError(result.error));
  }
  if (!result.data || result.data.length === 0) {
    // Already gone, or not this owner's (RLS shows nothing).
    return { status: "error", message: FRIENDLY.notAllowed };
  }

  await sweepResourceFilesAfterDelete(owner.id, (inside.data ?? []).map((r) => r.id)); // best-effort second sweep
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/workspaces?notice=deleted");
}
