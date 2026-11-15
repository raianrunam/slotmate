"use server";

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRate } from "@/lib/rate-limit";
import { withDeadlockRetry } from "@/features/workspaces/db-errors";
import { BOOKING_MESSAGES, mapBookingError } from "@/features/public-booking/errors";
import { getDaySlots } from "@/features/public-booking/queries";
import {
  DATE,
  FIELD_NAMES,
  parseBooking,
  resourceIdSchema,
  type BookingFormState,
  type DaySlotsResult,
  type RawFields,
} from "@/features/public-booking/schema";

// The public Server Actions (no login). They use the admin connection for
// ARCHITECTURE A4 places 1 to 3 only: public reads, booking submission, the rate limit.
//
// submitBooking, in this order (ARCHITECTURE 4.2):
//  1. read ONLY the allow-listed fields; find the resource and its workspace
//     (needed to count the attempt per workspace);
//  2. the rate limit (5 per 10 minutes per visitor per workspace; every attempt counts);
//  3. validate everything again (the browser's check is only for convenience);
//  4. make the secret status code (256 random bits) and its SHA-256 hash; only the
//     hash is sent to the database;
//  5. submit_booking: one transaction (slot, limits, monthly count, insert);
//  6. every refusal becomes a fixed friendly message; a deadlock (40P01) is retried once;
//  7. success: redirect to /booking/<code>, so a refresh cannot book twice (PUB-07).
// Nothing personal is logged: only error codes. The visitor's address is never stored or logged.

const fail = (kind: keyof typeof BOOKING_MESSAGES): BookingFormState => ({
  status: "error",
  kind,
  message: BOOKING_MESSAGES[kind],
});

function readRaw(formData: FormData): RawFields {
  const out = {} as RawFields;
  for (const name of FIELD_NAMES) {
    const value = formData.get(name);
    out[name] = typeof value === "string" ? value : "";
  }
  return out;
}

export async function submitBooking(formData: FormData): Promise<BookingFormState> {
  const raw = readRaw(formData);

  const resourceId = resourceIdSchema.safeParse(raw.resourceId);
  if (!resourceId.success) return fail("not_bookable");

  const admin = createAdminClient();
  const resource = await admin.from("resources").select("workspace_id, capacity").eq("id", resourceId.data).maybeSingle();
  if (resource.error) {
    console.error("submitBooking resource lookup failed", { code: resource.error.code });
    return fail("unknown");
  }
  if (!resource.data) return fail("not_bookable");

  // Step 2: the rate limit. A failed check refuses the request (it never lets one through).
  const rate = await checkRate(
    (workspaceId, ipHash) => admin.rpc("check_rate_limit", { p_workspace_id: workspaceId, p_ip_hash: ipHash }),
    resource.data.workspace_id,
    await headers(),
  );
  if (rate === "refused") return fail("rate_limited");
  if (rate === "failed") return fail("unknown");

  // Step 3: the same rules the browser ran.
  const parsed = parseBooking(raw, resource.data.capacity);
  if (!parsed.ok) return { status: "error", kind: "fields", fieldErrors: parsed.errors };
  const input = parsed.data;

  // Step 4: the secret code (shown to the visitor once) and its hash (the only thing stored).
  const code = randomBytes(32).toString("base64url");
  const hash = `\\x${createHash("sha256").update(code).digest("hex")}`;

  // Step 5 and 6.
  const result = await withDeadlockRetry(() =>
    admin.rpc("submit_booking", {
      p_resource_id: input.resourceId,
      p_starts_at: input.startsAt, // normalised by the schema: milliseconds, "Z" (finding 17)
      p_visitor_name: input.name,
      p_visitor_email: input.email,
      // The database expects NULL for an empty optional field; the generated type does not allow it.
      p_visitor_phone: input.phone as unknown as string,
      p_note: input.note as unknown as string,
      p_attendees: input.attendees,
      p_status_token_hash: hash,
    }),
  );
  if (result.error) {
    const kind = mapBookingError(result.error);
    console.error("submit_booking refused", { code: result.error.code ?? null, kind });
    return fail(kind);
  }
  if (!result.data || result.data.length !== 1) {
    console.error("submit_booking returned no row");
    return fail("unknown");
  }

  // Step 7. "submitted=1" only makes the page show the success message and the link once.
  redirect(`/booking/${code}?submitted=1`);
}

/** PUB-03: the free times of one day, for the date picker. Public, read-only, no login. */
export async function loadDaySlots(resourceId: string, date: string): Promise<DaySlotsResult> {
  if (typeof resourceId !== "string" || typeof date !== "string") return { ok: false };
  if (!resourceIdSchema.safeParse(resourceId).success || !DATE.test(date)) return { ok: false };
  return getDaySlots(resourceId, date);
}
