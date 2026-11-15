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

// A file younger than this might belong to an upload that is still in progress
// (uploaded, but its path not recorded yet). The sweep leaves such files alone, so
// two near-simultaneous uploads cannot delete each other's file (Phase 10 review
// finding 2). The PREVIOUS recorded image is the exception: it is deleted at once.
const YOUNG_FILE_MS = 60_000;

// Deletes files in the resource's folder, except: the one recorded path (re-read from
// the database, so a path recorded by another request meanwhile is kept too), the
// caller's own new file, and files younger than a minute (unless they are the previous
// image). With keepPath === null everything old enough goes. Best effort: returns
// false if Storage failed, but never throws. Strays that are skipped now are removed
// by a later sweep or by the delete of the resource (removeResourceFiles takes them all).
async function sweepFolder(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  resourceId: string,
  keepPath: string | null,
  previousPath: string | null = null,
): Promise<boolean> {
  try {
    const folder = imageFolder(ownerId, resourceId);
    const [listed, current] = await Promise.all([
      admin.storage.from(BUCKET).list(folder, { limit: 100 }),
      admin.from("resources").select("image_path").eq("id", resourceId).maybeSingle(),
    ]);
    if (listed.error || current.error) return false;
    const recorded = current.data?.image_path ?? null;
    const previous = previousPath && previousPath.startsWith(`${folder}/`) && !previousPath.includes("..") ? previousPath : null;
    const now = Date.now();
    const doomed = (listed.data ?? [])
      .filter((f) => f.name)
      .filter((f) => {
        const path = `${folder}/${f.name}`;
        if (path === keepPath || path === recorded) return false; // never the live image
        if (path === previous) return true; // the image this request replaced
        const created = f.created_at ? Date.parse(f.created_at) : Number.NaN;
        return Number.isNaN(created) || now - created > YOUNG_FILE_MS; // old strays only
      })
      .map((f) => `${folder}/${f.name}`);
    if (doomed.length === 0) return true;
    const removed = await admin.storage.from(BUCKET).remove(doomed);
    return !removed.error;
  } catch {
    return false;
  }
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

  // The new image is live. Now delete every OTHER file in the resource's folder:
  // the previous image, and any orphan left by a concurrent upload. Best effort:
  // if it fails the owner still has the right image and the extra files are only
  // wasted space (they are removed by the next sweep or by the delete).
  if (!(await sweepFolder(admin, args.ownerId, args.resourceId, path, args.previousPath))) {
    console.error("image folder sweep failed");
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
  if (!(await sweepFolder(admin, args.ownerId, args.resourceId, null, args.previousPath))) {
    console.error("image folder sweep failed");
  }
  return { ok: true };
}

/** After a successful row delete: a best-effort second sweep (catches a file uploaded during the delete). */
export async function sweepResourceFilesAfterDelete(ownerId: string, resourceIds: readonly string[]): Promise<void> {
  // Everything goes, young files included: the resource row is already deleted.
  try {
    await removeResourceFiles(ownerId, resourceIds);
  } catch {
    // best effort
  }
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
