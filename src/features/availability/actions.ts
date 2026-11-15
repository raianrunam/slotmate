"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readFields } from "@/features/auth/schema";
import { withDeadlockRetry } from "@/features/workspaces/db-errors";
import { FRIENDLY, mapResourceError } from "@/features/resources/db-errors";
import { getResource } from "@/features/resources/queries";
import { resourceIdSchema } from "@/features/resources/schema";
import { ALL_FIELD_NAMES, MESSAGES, parseDays } from "@/features/availability/schema";
import type { AvailabilityFormState } from "@/features/availability/state";

// Server Action for the weekly opening hours (AVAIL-01, AVAIL-02).
//
//  * requireOwner() first; the owner id comes from the verified login only.
//  * The resource is found through the owner's own session (RLS shows only the
//    owner's); a locked resource or workspace is refused here with a clear
//    message, and again by RLS (the policies only allow unlocked resources).
//  * Only the 21 allow-listed form fields are read.
//  * The secret key is not used. Database errors become fixed friendly messages;
//    only error codes are logged. A deadlock (40P01) is retried once (Q10).
//
// Changing the hours never changes existing bookings (they keep their exact
// moment); it only changes which times can be booked from now on.

export async function saveAvailability(_prev: AvailabilityFormState, formData: FormData): Promise<AvailabilityFormState> {
  await requireOwner();

  const id = resourceIdSchema.safeParse(readFields(formData, ["id"]).id);
  if (!id.success) return { status: "error", message: MESSAGES.id };

  const parsed = parseDays(readFields(formData, ALL_FIELD_NAMES));
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.errors };

  const resource = await getResource(id.data); // RLS: only this owner's resources are visible
  if (!resource) return { status: "error", message: FRIENDLY.notAllowed };
  if (resource.is_locked || (resource.workspaces?.is_locked ?? false)) {
    return { status: "error", message: FRIENDLY.locked };
  }

  const supabase = await createClient();

  // The hours are changed day by day (there is no transaction through the API): update
  // the days that exist, add the new ones, remove the closed ones. Nothing is deleted
  // before the new values are written, so a failure part-way never leaves a day empty
  // that the owner meant to keep open; the owner can simply save again.
  const existing = await supabase.from("resource_availability").select("weekday, opens_at, closes_at").eq("resource_id", resource.id);
  if (existing.error) {
    console.error("saveAvailability failed", { code: existing.error.code });
    return { status: "error", message: mapResourceError(existing.error).message };
  }
  const existingDays = new Map((existing.data ?? []).map((r) => [r.weekday, r]));

  const fail = (action: string, error: { code?: string | null; message?: string | null }): AvailabilityFormState => {
    console.error(`saveAvailability ${action} failed`, { code: error.code ?? null });
    return { status: "error", message: mapResourceError(error).message };
  };

  // 1. update days that changed
  for (const day of parsed.open) {
    const old = existingDays.get(day.weekday);
    if (!old) continue;
    if (old.opens_at.slice(0, 5) === day.opens_at && old.closes_at.slice(0, 5) === day.closes_at) continue;
    const res = await withDeadlockRetry(() =>
      supabase
        .from("resource_availability")
        .update({ opens_at: day.opens_at, closes_at: day.closes_at })
        .eq("resource_id", resource.id)
        .eq("weekday", day.weekday)
        .select("weekday"),
    );
    if (res.error) return fail("update", res.error);
    // RLS shows no row to an update that is not allowed (for example a lock that just appeared).
    if (!res.data || res.data.length === 0) return { status: "error", message: FRIENDLY.notAllowed };
  }

  // 2. add new days
  const added = parsed.open
    .filter((d) => !existingDays.has(d.weekday))
    .map((d) => ({ resource_id: resource.id, weekday: d.weekday, opens_at: d.opens_at, closes_at: d.closes_at }));
  if (added.length > 0) {
    const res = await withDeadlockRetry(() => supabase.from("resource_availability").insert(added));
    if (res.error) return fail("insert", res.error);
  }

  // 3. remove days that are now closed
  const removed = parsed.closedDays.filter((n) => existingDays.has(n));
  if (removed.length > 0) {
    const res = await withDeadlockRetry(() =>
      supabase.from("resource_availability").delete().eq("resource_id", resource.id).in("weekday", removed).select("weekday"),
    );
    if (res.error) return fail("delete", res.error);
  }

  revalidatePath("/dashboard", "layout");
  return { status: "success", message: "Opening hours saved." };
}
