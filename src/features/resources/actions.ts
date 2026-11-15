"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, readFields } from "@/features/auth/schema";
import { withDeadlockRetry } from "@/features/workspaces/db-errors";
import { FRIENDLY, mapResourceError } from "@/features/resources/db-errors";
import { checkImageBytes, IMAGE_MESSAGES, MAX_IMAGE_BYTES } from "@/features/resources/image-validation";
import { removeResourceFiles, removeResourceImage, saveResourceImage, sweepResourceFilesAfterDelete } from "@/features/resources/images";
import { getResourceUsage } from "@/features/resources/queries";
import {
  createResourceSchema,
  MESSAGES,
  resourceFieldsSchema,
  resourceIdSchema,
} from "@/features/resources/schema";
import type { ResourceFormState } from "@/features/resources/state";

// Server Actions for resources (RES-01 to RES-08).
//
// Rules for every action here (same as the workspace actions, plus Storage):
//  * requireOwner() runs first; the owner id comes from the verified login only.
//  * Data is read and written with the owner's own session (RLS). The admin
//    connection is used ONLY inside images.ts, and only AFTER the resource was
//    found through the owner's session (so it is the owner's) and checked for
//    locks.
//  * Only fields on an allow-list are read from the form: a forged owner_id,
//    is_locked, image_path or workspace_id (on update) is simply ignored.
//  * Database errors become fixed friendly messages. Only error codes are logged.
//  * A write cancelled by a deadlock (40P01) is retried once (Q10).

const FIELDS = ["name", "description", "slotMinutes", "capacity", "isAvailable"] as const;

function failure(error: ReturnType<typeof mapResourceError>): ResourceFormState {
  return { status: "error", message: error.message, limitReached: error.kind === "limit" };
}

function logFailure(action: string, error: { code?: string | null }) {
  console.error(`${action} failed`, { code: error.code ?? null });
}

// Finds a resource through the owner's own session. RLS only shows the owner's
// rows, so "found" means "this owner's". Includes the lock flags.
async function findOwnedResource(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("resources")
    .select("id, workspace_id, image_path, is_locked, workspaces(is_locked)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const workspace = data.workspaces as unknown as { is_locked: boolean } | null;
  return {
    id: data.id,
    imagePath: data.image_path,
    locked: data.is_locked || (workspace?.is_locked ?? false),
  };
}

export async function createResource(_prev: ResourceFormState, formData: FormData): Promise<ResourceFormState> {
  const owner = await requireOwner();

  const parsed = createResourceSchema.safeParse(readFields(formData, [...FIELDS, "workspaceId"]));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  // Friendly pre-check (A6); the database trigger is the real guard.
  const usage = await getResourceUsage();
  if (usage.atLimit) return failure(mapResourceError({ message: "resource_limit_reached" }));

  const supabase = await createClient();
  const { name, description, slotMinutes, capacity, isAvailable, workspaceId } = parsed.data;
  const result = await withDeadlockRetry(() =>
    supabase
      .from("resources")
      .insert({
        owner_id: owner.id,
        workspace_id: workspaceId,
        name,
        description,
        slot_minutes: slotMinutes,
        capacity,
        is_available: isAvailable,
      })
      .select("id")
      .single(),
  );
  if (result.error || !result.data) {
    logFailure("createResource", result.error ?? {});
    return failure(mapResourceError(result.error ?? {}));
  }

  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/resources/${result.data.id}?notice=created`);
}

export async function updateResource(_prev: ResourceFormState, formData: FormData): Promise<ResourceFormState> {
  await requireOwner();

  const id = resourceIdSchema.safeParse(readFields(formData, ["id"]).id);
  if (!id.success) return { status: "error", message: MESSAGES.id };
  const parsed = resourceFieldsSchema.safeParse(readFields(formData, FIELDS));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { name, description, slotMinutes, capacity, isAvailable } = parsed.data;
  const result = await withDeadlockRetry(() =>
    supabase
      .from("resources")
      .update({ name, description, slot_minutes: slotMinutes, capacity, is_available: isAvailable })
      .eq("id", id.data)
      .select("id"),
  );
  if (result.error) {
    logFailure("updateResource", result.error);
    return failure(mapResourceError(result.error));
  }
  // RLS hides other owners' rows and locked rows from an update: no row changed.
  if (!result.data || result.data.length === 0) return { status: "error", message: FRIENDLY.notAllowed };

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/resources?notice=saved");
}

export async function deleteResource(_prev: ResourceFormState, formData: FormData): Promise<ResourceFormState> {
  const owner = await requireOwner();

  const id = resourceIdSchema.safeParse(readFields(formData, ["id"]).id);
  if (!id.success) return { status: "error", message: MESSAGES.id };

  const resource = await findOwnedResource(id.data);
  if (!resource) return { status: "error", message: FRIENDLY.notAllowed };

  // DB15: stored files first. If Storage fails, stop: nothing is deleted.
  if (!(await removeResourceFiles([resource.id]))) {
    return {
      status: "error",
      message: "We could not delete this resource's image files, so nothing was deleted. Please try again.",
    };
  }

  const supabase = await createClient();
  const result = await withDeadlockRetry(() => supabase.from("resources").delete().eq("id", resource.id).select("id"));
  if (result.error || !result.data || result.data.length === 0) {
    logFailure("deleteResource", result.error ?? {});
    // The files are gone, so clear the recorded path (best effort) rather than leave a broken image.
    await removeResourceImage({ ownerId: owner.id, resourceId: resource.id, previousPath: null });
    return result.error ? failure(mapResourceError(result.error)) : { status: "error", message: FRIENDLY.notAllowed };
  }

  await sweepResourceFilesAfterDelete([resource.id]); // best-effort second sweep
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/resources?notice=deleted");
}

// ---------------------------------------------------------------------------
// Image (RES-05, D9, S1)
// ---------------------------------------------------------------------------
export async function uploadResourceImage(_prev: ResourceFormState, formData: FormData): Promise<ResourceFormState> {
  const owner = await requireOwner();

  const id = resourceIdSchema.safeParse(readFields(formData, ["id"]).id);
  if (!id.success) return { status: "error", message: MESSAGES.id };

  // 1. Ownership and lock, through the owner's own session, before anything else.
  const resource = await findOwnedResource(id.data);
  if (!resource) return { status: "error", message: FRIENDLY.notAllowed };
  if (resource.locked) return { status: "error", message: FRIENDLY.locked };

  // 2. Validate the file: size first (cheap), then the real bytes (size + signature).
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: IMAGE_MESSAGES.missing };
  if (file.size > MAX_IMAGE_BYTES) return { status: "error", message: IMAGE_MESSAGES.tooLarge };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = checkImageBytes(bytes);
  if (!checked.ok) return { status: "error", message: checked.message };

  // 3. Upload, record the path, delete the previous file (images.ts).
  const saved = await saveResourceImage({
    ownerId: owner.id,
    resourceId: resource.id,
    bytes,
    image: checked.image,
    previousPath: resource.imagePath,
  });
  if (!saved.ok) {
    if (saved.reason === "database") return failure(mapResourceError(saved.error));
    return { status: "error", message: "We could not store the image. Please try again." };
  }

  revalidatePath("/dashboard", "layout");
  return { status: "success", message: "Image saved." };
}

export async function removeImage(_prev: ResourceFormState, formData: FormData): Promise<ResourceFormState> {
  const owner = await requireOwner();

  const id = resourceIdSchema.safeParse(readFields(formData, ["id"]).id);
  if (!id.success) return { status: "error", message: MESSAGES.id };

  const resource = await findOwnedResource(id.data);
  if (!resource) return { status: "error", message: FRIENDLY.notAllowed };
  if (resource.locked) return { status: "error", message: FRIENDLY.locked };

  const removed = await removeResourceImage({
    ownerId: owner.id,
    resourceId: resource.id,
    previousPath: resource.imagePath,
  });
  if (!removed.ok) {
    return removed.reason === "database"
      ? failure(mapResourceError(removed.error))
      : { status: "error", message: FRIENDLY.generic };
  }

  revalidatePath("/dashboard", "layout");
  return { status: "success", message: "Image removed." };
}
