import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { withDeadlockRetry, type DbError } from "@/features/workspaces/db-errors";
import { imageFolder, imagePath, type DetectedImage } from "@/features/resources/image-validation";

// The resource image Storage functions (RES-05, D9, S1, A4 "place 5") and the
// clean-up before deletes (DB15). This is the ONLY file that imports the admin
// connection (a unit test checks it). Every function here must be called AFTER
// the caller has proved, with the owner's own session (RLS), that the resource
// belongs to the logged-in owner. The database function set_resource_image
// checks ownership and the lock again, so a mistake in a caller still cannot
// change a foreign or locked resource's recorded image.

const BUCKET = "resource-images";

export type SaveImageResult =
  | { ok: true }
  | { ok: false; reason: "storage" }
  | { ok: false; reason: "database"; error: DbError };

function ownsPath(ownerId: string, resourceId: string, path: string): boolean {
  return path.startsWith(`${imageFolder(ownerId, resourceId)}/`) && !path.includes("..");
}

/**
 * Upload the new file, record its path, then delete the previous file.
 * Order (decided in Phase 9): file first, then set_resource_image. A locked or
 * foreign resource is refused by the caller's checks before this runs; if the
 * database still refuses (for example a lock that appeared a moment ago), the
 * file just uploaded is deleted again, so no orphan stays behind.
 */
export async function saveResourceImage(args: {
  ownerId: string;
  resourceId: string;
  bytes: Uint8Array;
  image: DetectedImage;
  previousPath: string | null;
}): Promise<SaveImageResult> {
  const admin = createAdminClient();
  const path = imagePath(args.ownerId, args.resourceId, randomUUID(), args.image.ext);

  const upload = await admin.storage.from(BUCKET).upload(path, args.bytes, {
    contentType: args.image.contentType, // from the detected signature, not from the browser
    upsert: false,
    cacheControl: "31536000",
  });
  if (upload.error) {
    console.error("image upload failed", { name: upload.error.name });
    return { ok: false, reason: "storage" };
  }

  const record = await withDeadlockRetry(() =>
    admin.rpc("set_resource_image", {
      p_owner_id: args.ownerId,
      p_resource_id: args.resourceId,
      p_path: path,
    }),
  );
  if (record.error) {
    console.error("set_resource_image failed", { code: record.error.code });
    await admin.storage.from(BUCKET).remove([path]); // clean up the new file
    return { ok: false, reason: "database", error: record.error };
  }

  // The new image is live. Removing the old file is best effort: if it fails the
  // owner still has the right image, and the old file is only wasted space.
  if (args.previousPath && args.previousPath !== path && ownsPath(args.ownerId, args.resourceId, args.previousPath)) {
    const removed = await admin.storage.from(BUCKET).remove([args.previousPath]);
    if (removed.error) console.error("old image removal failed", { name: removed.error.name });
  }
  return { ok: true };
}

/** Clear the recorded path, then delete the file. */
export async function removeResourceImage(args: {
  ownerId: string;
  resourceId: string;
  previousPath: string | null;
}): Promise<SaveImageResult> {
  const admin = createAdminClient();
  const record = await withDeadlockRetry(() =>
    admin.rpc("set_resource_image", {
      p_owner_id: args.ownerId,
      p_resource_id: args.resourceId,
      p_path: null as unknown as string, // NULL removes the image
    }),
  );
  if (record.error) {
    console.error("set_resource_image (remove) failed", { code: record.error.code });
    return { ok: false, reason: "database", error: record.error };
  }
  if (args.previousPath && ownsPath(args.ownerId, args.resourceId, args.previousPath)) {
    const removed = await admin.storage.from(BUCKET).remove([args.previousPath]);
    if (removed.error) console.error("image removal failed", { name: removed.error.name });
  }
  return { ok: true };
}

/**
 * DB15: delete every stored file of the given resources, BEFORE their database
 * rows are deleted. Lists each resource's folder (so stray files are removed
 * too, not only the recorded path). Returns false if Storage failed, and the
 * caller must then stop and NOT delete the rows.
 */
export async function removeResourceFiles(ownerId: string, resourceIds: readonly string[]): Promise<boolean> {
  if (resourceIds.length === 0) return true;
  const admin = createAdminClient();
  const storage = admin.storage.from(BUCKET);
  try {
    for (const resourceId of resourceIds) {
      const folder = imageFolder(ownerId, resourceId);
      // A resource has at most a couple of files; loop in case a folder holds more than one page.
      let empty = false;
      for (let guard = 0; guard < 20 && !empty; guard++) {
        const listed = await storage.list(folder, { limit: 100 });
        if (listed.error) throw new Error("list failed");
        const names = (listed.data ?? []).filter((f) => f.name).map((f) => `${folder}/${f.name}`);
        if (names.length === 0) {
          empty = true;
          break;
        }
        const removed = await storage.remove(names);
        if (removed.error) throw new Error("remove failed");
      }
      // Never report success while files may remain (the caller would delete the rows).
      if (!empty) throw new Error("folder not empty");
    }
    return true;
  } catch {
    console.error("storage clean-up before delete failed");
    return false;
  }
}
