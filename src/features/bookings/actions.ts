"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readFields } from "@/features/auth/schema";
import { withDeadlockRetry } from "@/features/workspaces/db-errors";
import { explainNoChange, FRIENDLY, mapBookingError, type ActionFailure } from "@/features/bookings/db-errors";
import { bookingIdSchema, MESSAGES, TRANSITIONS, type BookingAction } from "@/features/bookings/schema";
import type { BookingActionState } from "@/features/bookings/state";

// Server Actions for bookings (BOOK-03 to BOOK-06, NOTIF-03).
//
// Rules for every action here:
//  * requireOwner() runs first. The owner's id comes from the verified login, never from the form.
//  * The database is reached with the owner's OWN session client, so RLS applies: another owner's
//    booking, or a booking on a locked resource or workspace, is simply not changed. The secret key
//    is not used in this feature (A4).
//  * A status change is "update ... where id = ? and status = <the status this action starts from>",
//    so two tabs (approve in one, reject in the other) cannot both win: the second finds no row.
//    The database trigger enforce_booking_transition is the real guard for the allowed path.
//  * Database errors become fixed friendly sentences (db-errors.ts). Raw text is never returned.
//  * A write cancelled by a deadlock (40P01) is retried once (Q10).
//  * Only error codes are logged, never visitor details.

function fail(reason: ActionFailure): BookingActionState {
  return { status: "error", message: FRIENDLY[reason] };
}

// After a write that changed no row: find out why, with the owner's own session.
async function whyNoChange(id: string, expectedFrom: string | null): Promise<ActionFailure> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("status, resources!inner(is_locked, workspaces!inner(is_locked))")
    .eq("id", id)
    .maybeSingle();
  if (error) return "generic"; // a failed read is not "not found"
  if (!data) return explainNoChange(null, expectedFrom);
  const resource = Array.isArray(data.resources) ? data.resources[0] : data.resources;
  const workspace = Array.isArray(resource.workspaces) ? resource.workspaces[0] : resource.workspaces;
  return explainNoChange({ status: data.status, locked: resource.is_locked || workspace.is_locked }, expectedFrom);
}

async function changeStatus(action: BookingAction, formData: FormData): Promise<BookingActionState> {
  await requireOwner();
  const id = bookingIdSchema.safeParse(readFields(formData, ["id"]).id);
  if (!id.success) return { status: "error", message: MESSAGES.id };

  const { from, to } = TRANSITIONS[action];
  const supabase = await createClient();
  const result = await withDeadlockRetry(() =>
    supabase.from("bookings").update({ status: to }).eq("id", id.data).eq("status", from).select("id"),
  );
  if (result.error) {
    console.error(`${action}Booking failed`, { code: result.error.code ?? null });
    return fail(mapBookingError(result.error));
  }
  if (!result.data || result.data.length === 0) {
    return fail(await whyNoChange(id.data, from));
  }

  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/bookings/${id.data}?notice=${to}`);
}

export async function approveBooking(_prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  return changeStatus("approve", formData);
}

export async function rejectBooking(_prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  return changeStatus("reject", formData);
}

export async function cancelBooking(_prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  return changeStatus("cancel", formData);
}

export async function deleteBooking(_prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  await requireOwner();
  const id = bookingIdSchema.safeParse(readFields(formData, ["id"]).id);
  if (!id.success) return { status: "error", message: MESSAGES.id };

  const supabase = await createClient();
  // D13: permanent. D19: the month's count (monthly_usage) is a separate table and is not touched.
  const result = await withDeadlockRetry(() => supabase.from("bookings").delete().eq("id", id.data).select("id"));
  if (result.error) {
    console.error("deleteBooking failed", { code: result.error.code ?? null });
    return fail(mapBookingError(result.error));
  }
  if (!result.data || result.data.length === 0) {
    return fail(await whyNoChange(id.data, null));
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/bookings?notice=deleted");
}
